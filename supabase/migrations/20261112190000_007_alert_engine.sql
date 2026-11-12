-- Migration 007 (B12): the alert engine. Replaces B10's interim private.raise_alert and adds acknowledgement,
-- resolution, grouped suppression, the rate cap with its flood summary, dispatch planning and the escalator.
-- References: event-pipeline §3 (SOS, 60 s escalation), §7 (alert budget), §8 (idempotency); api-contracts §3.
--
-- ABSOLUTE (lane rules, 2026-11-12): nothing here can reach a phone or a chat. Every dispatch row this engine
-- writes is status 'dry_run' (or 'suppressed'); the dispatch kick fires only on 'queued', so no pg_net request
-- is ever made. private.alert_dispatch_status() is the single place B13 changes when live sending is approved.
--
-- Design notes
--   * raise_alert keeps its B10 behaviour: one breach is still one domain event, one ledger row, one loop row.
--     The detector flow creates NO dispatch row inline (008/009 assert this); dispatch planning is done by
--     escalate_step, the 1-second `sos-escalator` job, which has its own connection and transaction, takes no
--     advisory lock and claims rows with FOR UPDATE SKIP LOCKED. SOS alone is planned inline (sos_raise must not
--     wait for a job), and the job is its fallback.
--   * Upgrade events stay with apply_findings (it knows the sim time and the privacy rule for anomaly alerts);
--     everything the engine originates itself (suppressed, acknowledged, escalated, resolved, flood) goes through
--     emit_event with the alert's own operator, so private.event_visible and the sealed rules apply unchanged.
--   * Resolution: when a rule clears (private.rule_state active -> false) its alert resolves, escalate_at is
--     cleared, alert.resolved {via: sensor} is emitted, and for the seatbelt rule safety.seatbelt_resolved too.
--     This closes B10's MINOR 9 (a fastened belt would otherwise have escalated 20 s later).

-- ── 1. columns and indexes ───────────────────────────────────────────────────────────────────────
alter table public.alerts
  add column if not exists resolved_at timestamptz,
  add column if not exists dispatched_tier public.alert_tier,
  add column if not exists epoch int not null default 0;
comment on column public.alerts.dispatched_tier is
  'The tier whose immediate dispatch rules have already been planned (null = none yet). escalate_step plans the rest.';
comment on column public.alerts.epoch is
  'Bumped on every upgrade and every flap reopen, so each state of an alert has its own idempotency keys.';
create index if not exists alerts_undispatched_idx on public.alerts (first_seen)
  where status in ('open', 'escalating') and dispatched_tier is distinct from tier;
create index if not exists alerts_flood_window_idx on public.alerts (operator_id, first_seen)
  where status <> 'suppressed';

-- ── 2. dispatch planning (dry run only) ──────────────────────────────────────────────────────────
-- B13 replaces this body when live sending is approved. Until then no engine path can produce a queued row.
create or replace function private.alert_dispatch_status()
returns public.dispatch_status language sql immutable set search_path = '' as $$ select 'dry_run'::public.dispatch_status $$;

create or replace function private.dispatch_targets(p_tokens text[])
returns table (token text, d_channel public.dispatch_channel, d_role public.app_role, d_ref text)
language sql immutable set search_path = '' as $$
  select v.t, v.c::public.dispatch_channel, v.r::public.app_role, v.f
    from (values
      ('supervisor_telegram', 'telegram',     'fleet_manager', 'TELEGRAM_SUPERVISOR_CHAT_ID'),
      ('supervisor_call',     'twilio_voice', 'fleet_manager', 'DEMO_SUPERVISOR_PHONE'),
      ('operator_call',       'twilio_voice', 'operator',      'DEMO_OPERATOR_PHONE')) v(t, c, r, f)
   where v.t = any (coalesce(p_tokens, '{}'::text[]))
   order by v.t
$$;
comment on function private.dispatch_targets(text[]) is
  'Maps a policy token to channel, recipient role and the NAME of the Edge Function secret that holds the number. Never a number.';

-- Writes one round of dispatch rows for an alert and returns its level (-1 when there was nothing to send).
-- An operator call is checked against private.can_call_operator (the predicate behind operator_state.motion_locked)
-- and stored suppressed(reason) when denied. Level = one past the highest level already used for the alert.
create or replace function private.alert_dispatch(p_alert_id uuid, p_tokens text[], p_purpose text)
returns int language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype; t record; v_level int; v_status public.dispatch_status; v_reason text; v_can jsonb;
        v_id uuid; v_any boolean := false;
begin
  select * into a from public.alerts x where x.id = p_alert_id;
  if not found or cardinality(coalesce(p_tokens, '{}'::text[])) = 0 then return -1; end if;
  select coalesce(max(d.escalation_level) + 1, 0) into v_level from public.dispatches d where d.alert_id = a.id;
  for t in select * from private.dispatch_targets(p_tokens) loop
    v_status := private.alert_dispatch_status(); v_reason := null; v_id := null;
    if t.token = 'operator_call' then
      v_can := private.can_call_operator(a.run_id, a.operator_id);
      if not coalesce((v_can ->> 'allowed')::boolean, false) then
        v_status := 'suppressed'; v_reason := coalesce(v_can ->> 'reason', 'state_unknown');
      end if;
    end if;
    insert into public.dispatches (alert_id, site_id, purpose, channel, recipient_ref, recipient_role,
                                   escalation_level, status, body, error)
    values (a.id, a.site_id, p_purpose, t.d_channel, t.d_ref, t.d_role, v_level, v_status,
            jsonb_build_object('alert_id', a.id, 'kind', a.kind, 'tier', a.tier, 'level', v_level, 'token', t.token),
            case when v_reason is not null then jsonb_build_object('reason', v_reason) end)
    on conflict (subject_key, purpose, channel, recipient_role, escalation_level) do nothing
    returning id into v_id;
    if v_id is not null then v_any := true; end if;
    if v_id is not null and v_status = 'suppressed' then
      perform private.emit_event('dispatch.suppressed',
        jsonb_build_object('dispatch_id', v_id, 'channel', t.d_channel, 'status', 'suppressed', 'reason', v_reason),
        'dispatch:' || v_id::text || ':suppressed', 'system', a.site_id, p_run_id => a.run_id,
        p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
    end if;
  end loop;
  return case when v_any then v_level else -1 end;
end $$;

-- The immediate dispatch rules for the alert's CURRENT tier (event-pipeline §7: critical => external now).
--   a policy with notify_now sends it once, at creation;
--   otherwise a critical tier sends the policy's escalation targets now;
--   a warning or lower tier waits for the ack timeout (escalate_step) and so sends nothing here.
create or replace function private.alert_dispatch_pending(p_alert_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype; pol public.alert_policies%rowtype; v_tokens text[]; v_level int;
begin
  select * into a from public.alerts x
    where x.id = p_alert_id and x.status in ('open', 'escalating') and x.dispatched_tier is distinct from x.tier;
  if not found then return 0; end if;
  select * into pol from public.alert_policies p where p.kind = a.kind;
  v_tokens := case
    when cardinality(pol.notify_now) > 0 then case when a.dispatched_tier is null then pol.notify_now else '{}'::text[] end
    when a.tier = 'critical' then pol.escalate_to
    else '{}'::text[] end;
  v_level := private.alert_dispatch(a.id, v_tokens,
               case when a.kind = 'alert_flood' then 'flood_summary' else 'alert' end);
  update public.alerts set dispatched_tier = a.tier, escalation_level = greatest(escalation_level, greatest(v_level, 0))::smallint
    where id = a.id;
  return case when v_level >= 0 then 1 else 0 end;
end $$;

-- ── 3. acknowledgement and resolution ────────────────────────────────────────────────────────────
-- Compare-and-set: only an unacknowledged live alert changes. A repeat (or a race with the escalator, which holds
-- the row lock) finds the new state and changes nothing. Returns the alert as it is after the call.
create or replace function private.ack_alert(p_alert_id uuid, p_via public.ack_via, p_by uuid, p_by_role public.app_role)
returns public.alerts language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype;
begin
  update public.alerts set status = 'acknowledged', ack_at = now(), ack_by = p_by, ack_via = p_via, escalate_at = null
    where id = p_alert_id and status in ('open', 'escalating', 'escalated')
    returning * into a;
  if found then
    update public.dispatches set status = 'suppressed', error = jsonb_build_object('reason', 'acknowledged')
      where alert_id = a.id and status = 'queued';          -- a call not yet placed is never placed (G2-10)
    perform private.emit_event('alert.acknowledged',
      jsonb_build_object('alert_id', a.id, 'via', p_via, 'by_role', p_by_role),
      'alertack:' || a.id::text || ':' || a.epoch::text, 'system', a.site_id, p_run_id => a.run_id,
      p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
  else
    select * into a from public.alerts x where x.id = p_alert_id;
  end if;
  return a;
end $$;

-- The client RPC (api-contracts AlertAckIn / AlertAckOut). Operator: own alert, never an SOS. Fleet manager: the site's.
create or replace function public.alert_ack(p_alert_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.profiles%rowtype; a public.alerts%rowtype;
begin
  select * into me from public.profiles where user_id = (select auth.uid());
  if not found then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_alert_id is null or p_request_id is null then raise exception 'validation' using errcode = 'P0001'; end if;
  select * into a from public.alerts x where x.id = p_alert_id;
  if not found
     or not ((me.role = 'fleet_manager' and a.site_id = me.site_id)
          or (me.role = 'operator' and a.operator_id = me.operator_id and a.kind <> 'sos')) then
    raise exception 'forbidden' using errcode = 'P0001';     -- one answer for "absent" and "not yours"
  end if;
  a := private.ack_alert(a.id, 'app', me.user_id, me.role);
  return jsonb_build_object('alert_id', a.id, 'status', a.status);
end $$;

create or replace function private.resolve_alert(p_alert_id uuid, p_via public.ack_via default 'sensor')
returns boolean language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype;
begin
  update public.alerts set status = 'resolved', escalate_at = null, resolved_at = now()
    where id = p_alert_id and status in ('open', 'acknowledged', 'escalating', 'escalated')
    returning * into a;
  if not found then return false; end if;
  update public.dispatches set status = 'suppressed', error = jsonb_build_object('reason', 'resolved')
    where alert_id = a.id and status = 'queued';
  perform private.emit_event('alert.resolved', jsonb_build_object('alert_id', a.id, 'via', p_via),
    'alertres:' || a.id::text || ':' || a.epoch::text, 'system', a.site_id, p_run_id => a.run_id,
    p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
  return true;
end $$;

-- A rule that clears resolves its alert (B10 MINOR 9). The seatbelt rule also announces safety.seatbelt_resolved.
create or replace function private.rule_state_resolve()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype;
begin
  if old.alert_id is null then return null; end if;
  select * into a from public.alerts x where x.id = old.alert_id;
  if not found then return null; end if;
  if private.resolve_alert(old.alert_id, 'sensor') and new.rule = 'seatbelt_off_moving' then
    perform private.emit_event('safety.seatbelt_resolved', jsonb_build_object('frame_seq', new.last_frame_seq),
      'seatbelt_res:' || a.id::text || ':' || a.epoch::text, 'system', a.site_id, p_run_id => a.run_id,
      p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
  end if;
  return null;
end $$;
drop trigger if exists rule_state_resolve on private.rule_state;
create trigger rule_state_resolve after update of active on private.rule_state
  for each row when (old.active and not new.active) execute function private.rule_state_resolve();

-- ── 4. the flood summary (one per operator, deduplicated by its hazard_key; G2-8d) ────────────────
create or replace function private.raise_flood(p_run_id uuid, p_operator_id uuid, p_site_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype; v_hk text := 'flood:' || coalesce(p_operator_id::text, '-') || ':flood'; i int; v_id uuid;
begin
  for i in 1..2 loop
    select * into a from public.alerts x where x.hazard_key = v_hk and x.status in ('open', 'acknowledged', 'escalating') for update;
    if found then
      update public.alerts set occurrences = occurrences + 1, last_seen = now() where id = a.id;
      return a.id;
    end if;
    begin
      -- operator_id stays null: the summary is for the fleet manager, the operator does not receive it
      insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, site_id, needs_ack, dispatched_tier)
        values (p_run_id, 'alert_flood', v_hk, 'caution', 'open', null, p_site_id, false, null)
        returning id into v_id;
      perform private.emit_event('alert.raised',
        jsonb_build_object('alert_id', v_id, 'kind', 'alert_flood', 'tier', 'caution', 'needs_ack', false,
          'escalate_at', null, 'occurrences', 1, 'protocol_card_id', null, 'upgraded_from', null),
        'alertraise:' || v_id::text, 'system', p_site_id, p_run_id => p_run_id, p_alert_id => v_id,
        p_tier => 'caution');
      return v_id;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'raise_flood could not settle %', v_hk using errcode = 'P0001';
end $$;

-- ── 5. raise_alert: the engine ───────────────────────────────────────────────────────────────────
-- Same signature and same return as B10's interim version (apply_findings calls it unchanged).
create or replace function private.raise_alert(p_run_id uuid, p_kind text, p_hazard_key text, p_tier public.alert_tier,
  p_site_id uuid, p_operator_id uuid, p_machine_id uuid, p_catchup boolean, p_protocol_card_id text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pol public.alert_policies%rowtype; a public.alerts%rowtype; b public.alerts%rowtype;
        v_tier public.alert_tier; v_id uuid; v_esc timestamptz; i int; v_subject text; v_cnt int; v_abuse boolean;
begin
  select * into pol from public.alert_policies where kind = p_kind;
  if not found then raise exception 'unknown alert kind %', p_kind using errcode = 'P0001'; end if;
  v_tier := least(p_tier, pol.tier_max);

  if p_catchup then            -- EP §0: catch-up alerts are stored, never dispatched
    insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, machine_id, site_id, needs_ack,
                               suppress_reason, protocol_card_id)
    values (p_run_id, p_kind, p_hazard_key, v_tier, 'suppressed', p_operator_id, p_machine_id, p_site_id, false,
            'catch_up', p_protocol_card_id)
    returning id into v_id;
    return v_id;
  end if;

  v_esc := case when pol.needs_ack and pol.ack_timeout_s is not null then now() + make_interval(secs => pol.ack_timeout_s) end;

  if p_kind = 'sos' then       -- never deduplicated, suppressed or capped; abuse control only flags (PA-7)
    select count(*) >= 3 into v_abuse from public.alerts x
      where x.kind = 'sos' and x.operator_id is not distinct from p_operator_id and x.first_seen > now() - interval '10 minutes';
    insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, machine_id, site_id, needs_ack,
                               escalate_at, protocol_card_id, abuse_suspected)
    values (p_run_id, p_kind, p_hazard_key, v_tier, 'open', p_operator_id, p_machine_id, p_site_id, pol.needs_ack,
            v_esc, p_protocol_card_id, v_abuse)
    returning id into v_id;
    perform private.alert_dispatch_pending(v_id);            -- the Telegram message goes in the same transaction
    return v_id;
  end if;

  v_subject := split_part(p_hazard_key, ':', 3);
  for i in 1..2 loop
    -- (a) same hazard_key: dedupe, or upgrade in place (an upgrade is never merged away)
    select * into a from public.alerts x
      where x.hazard_key = p_hazard_key and x.status in ('open', 'acknowledged', 'escalating') and x.kind <> 'sos' for update;
    if found then
      if v_tier > a.tier then
        update public.alerts set tier = v_tier, occurrences = occurrences + 1, last_seen = now(), epoch = epoch + 1,
            tier_history = tier_history || jsonb_build_array(jsonb_build_object('from', a.tier, 'to', v_tier, 'at', now())),
            status = case when pol.needs_ack then 'open'::public.alert_status else status end,   -- raised again: needs a fresh ack
            ack_at = case when pol.needs_ack then null else ack_at end,
            ack_by = case when pol.needs_ack then null else ack_by end,
            ack_via = case when pol.needs_ack then null else ack_via end,
            escalate_at = case when pol.needs_ack then coalesce(v_esc, escalate_at) else escalate_at end
          where id = a.id;
      else
        update public.alerts set occurrences = occurrences + 1, last_seen = now() where id = a.id;
      end if;
      return a.id;
    end if;

    -- (b) flap guard: a hazard that resolved and recurs inside dedupe_window_s reopens the same alert
    select * into a from public.alerts x
      where x.hazard_key = p_hazard_key and x.status = 'resolved' and x.kind <> 'sos'
        and x.resolved_at > now() - make_interval(secs => coalesce(pol.dedupe_window_s, 0))
      order by x.resolved_at desc limit 1 for update;
    if found then
      begin
        update public.alerts set status = 'open', resolved_at = null, occurrences = occurrences + 1, last_seen = now(),
            epoch = epoch + 1, tier = greatest(a.tier, v_tier), needs_ack = pol.needs_ack,
            ack_at = null, ack_by = null, ack_via = null, escalate_at = v_esc
          where id = a.id;
        return a.id;
      exception when unique_violation then null;      -- a concurrent writer opened one: loop and merge into it
      end;
    else
      -- (c) grouped suppression: only inside the same hazard_group and subject, only by an OPEN (unacknowledged)
      --     alert of a HIGHER tier. Different hazards never suppress each other; an acknowledged alert suppresses nothing.
      select x.* into b from public.alerts x join public.alert_policies p on p.kind = x.kind
        where p.hazard_group = pol.hazard_group and split_part(x.hazard_key, ':', 3) = v_subject
          and x.hazard_key <> p_hazard_key and x.status = 'open' and x.tier > v_tier and x.kind <> 'sos'
          and x.run_id is not distinct from p_run_id
        order by x.tier desc, x.first_seen limit 1;
      if found then
        insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, machine_id, site_id, needs_ack,
                                   suppress_reason, suppressed_by, protocol_card_id)
        values (p_run_id, p_kind, p_hazard_key, v_tier, 'suppressed', p_operator_id, p_machine_id, p_site_id, false,
                'lower_tier', b.id, p_protocol_card_id)
        returning id into v_id;
        perform private.emit_event('alert.suppressed',
          jsonb_build_object('alert_id', v_id, 'reason', 'lower_tier', 'suppressed_by', b.id),
          'alertsup:' || v_id::text, 'system', p_site_id, p_run_id => p_run_id, p_machine_id => p_machine_id,
          p_alert_id => v_id);
        return v_id;
      end if;

      -- (d) rate cap: info and caution kinds only, <= 6 per operator per 10 wall-minutes; the excess is stored
      --     suppressed(rate_cap) and ONE alert_flood summary per operator is raised for the fleet manager
      if pol.rate_capped and v_tier in ('info', 'caution') then
        select count(*) into v_cnt from public.alerts x join public.alert_policies p on p.kind = x.kind
          where p.rate_capped and x.tier in ('info', 'caution') and x.status <> 'suppressed'
            and x.first_seen > now() - interval '10 minutes'
            and x.operator_id is not distinct from p_operator_id
            and (p_operator_id is not null or x.machine_id is not distinct from p_machine_id);
        if v_cnt >= 6 then
          insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, machine_id, site_id, needs_ack,
                                     suppress_reason, protocol_card_id)
          values (p_run_id, p_kind, p_hazard_key, v_tier, 'suppressed', p_operator_id, p_machine_id, p_site_id, false,
                  'rate_cap', p_protocol_card_id)
          returning id into v_id;
          perform private.raise_flood(p_run_id, p_operator_id, p_site_id);
          return v_id;
        end if;
      end if;
    end if;

    -- (e) a new alert
    begin
      insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, machine_id, site_id, needs_ack,
                                 escalate_at, protocol_card_id)
      values (p_run_id, p_kind, p_hazard_key, v_tier, 'open', p_operator_id, p_machine_id, p_site_id, pol.needs_ack,
              v_esc, p_protocol_card_id)
      returning id into v_id;
      return v_id;
    exception when unique_violation then null;        -- a concurrent writer won: loop and merge into it
    end;
  end loop;
  raise exception 'raise_alert could not settle hazard %', p_hazard_key using errcode = 'P0001';
end $$;

-- ── 6. the escalator ─────────────────────────────────────────────────────────────────────────────
-- Runs as its own pg_cron job: its own connection and transaction, no advisory lock, and every claim is
-- FOR UPDATE SKIP LOCKED plus a compare-and-set, so a slow tick, a failing frame or a raising build_replay cannot
-- delay it, and two overlapping runs never process the same alert twice. Each alert is handled in its own
-- exception block. It reads `alerts` and writes `alerts`, `dispatches` and `events` only.
create or replace function private.escalate_step(p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; a public.alerts%rowtype; pol public.alert_policies%rowtype; v_lvl int; v_planned int := 0;
        v_escalated int := 0; v_errors int := 0;
begin
  -- 1. immediate dispatch rules for a new tier (notify_now; critical => now)
  for v_id in
    select x.id from public.alerts x
      where x.status in ('open', 'escalating') and x.dispatched_tier is distinct from x.tier
      order by x.first_seen limit 50 for update skip locked
  loop
    begin
      v_planned := v_planned + private.alert_dispatch_pending(v_id);
    exception when others then
      v_errors := v_errors + 1; raise warning 'escalate_step: dispatch plan for % failed: %', v_id, sqlerrm;
    end;
  end loop;

  -- 2. escalations whose ack timeout has passed: CAS open -> escalating, then the policy's escalation targets
  for v_id in
    select x.id from public.alerts x
      where x.status = 'open' and x.escalate_at is not null and x.escalate_at <= p_now
      order by x.escalate_at limit 20 for update skip locked
  loop
    begin
      update public.alerts set status = 'escalating', escalate_at = null
        where id = v_id and status = 'open' and escalate_at <= p_now
        returning * into a;
      if not found then continue; end if;
      select * into pol from public.alert_policies p where p.kind = a.kind;
      v_lvl := private.alert_dispatch(a.id, pol.escalate_to, 'escalation');
      update public.alerts set escalation_level = greatest(escalation_level, greatest(v_lvl, 0))::smallint,
                               dispatched_tier = a.tier,
                               status = case when cardinality(pol.escalate_to) = 0 then 'escalated'::public.alert_status else status end
        where id = a.id;
      perform private.emit_event('alert.escalated',
        jsonb_build_object('alert_id', a.id, 'level', greatest(v_lvl, 0), 'to', to_jsonb(pol.escalate_to)),
        'alertesc:' || a.id::text || ':' || a.epoch::text, 'system', a.site_id, p_run_id => a.run_id,
        p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
      v_escalated := v_escalated + 1;
    exception when others then
      v_errors := v_errors + 1; raise warning 'escalate_step: escalation of % failed: %', v_id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('planned', v_planned, 'escalated', v_escalated, 'errors', v_errors);
end $$;

-- ── 7. the job, grants, comments ─────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sos-escalator', '1 seconds', 'select private.escalate_step();');
  else
    raise warning 'pg_cron is not installed: the sos-escalator job was not scheduled';
  end if;
end $$;

revoke execute on function
  private.alert_dispatch_status(), private.dispatch_targets(text[]), private.alert_dispatch(uuid, text[], text),
  private.alert_dispatch_pending(uuid), private.ack_alert(uuid, public.ack_via, uuid, public.app_role),
  private.resolve_alert(uuid, public.ack_via), private.rule_state_resolve(), private.raise_flood(uuid, uuid, uuid),
  private.raise_alert(uuid, text, text, public.alert_tier, uuid, uuid, uuid, boolean, text),
  private.escalate_step(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.alert_ack(uuid, uuid) from public, anon;
grant execute on function public.alert_ack(uuid, uuid) to authenticated, service_role;
-- B15's sos_raise, the Telegram callback and the Twilio webhook run as service_role / owner functions
grant execute on function private.ack_alert(uuid, public.ack_via, uuid, public.app_role),
  private.resolve_alert(uuid, public.ack_via) to service_role;

comment on function private.raise_alert(uuid, text, text, public.alert_tier, uuid, uuid, uuid, boolean, text) is
  'B12 alert engine (replaces B10''s interim body, same signature). Order: catch-up stored suppressed; SOS never deduplicated (abuse flag after 3 in 10 min, planned inline); same hazard_key merges or upgrades in place (reopens an acknowledged alert); a resolved hazard recurring inside dedupe_window_s reopens the same alert; a lower tier is suppressed(lower_tier) by an OPEN higher-tier alert of the same hazard_group and subject; info/caution kinds are capped at 6 per operator per 10 wall-minutes (excess suppressed(rate_cap) + one alert_flood summary). Creates no dispatch row except for SOS.';
comment on function private.escalate_step(timestamptz) is
  'The sos-escalator job body (own connection, no advisory lock, FOR UPDATE SKIP LOCKED + CAS, per-alert exception blocks). Plans immediate dispatches and escalates alerts whose escalate_at has passed. Writes dispatch rows as dry_run only (private.alert_dispatch_status); never calls pg_net.';
comment on function private.alert_dispatch(uuid, text[], text) is
  'One round of dispatch rows for an alert. Status is private.alert_dispatch_status() (dry_run) or suppressed(reason) for a denied operator call. Never queued, so the pg_net kick cannot fire.';
comment on function public.alert_ack(uuid, uuid) is
  'api-contracts AlertAckIn/AlertAckOut. CAS on the alert; a repeat or a lost race returns the current status. Operator: own alert, not SOS. Fleet manager: the site''s.';
