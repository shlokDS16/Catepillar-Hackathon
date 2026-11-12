-- Migration 007b: Opus review of B12 (1 blocker, 1 major, 4 minor). 007 is applied, so every fix lands here.
--
-- BLOCKER  An operator could switch off the critical escalation path by acknowledging. Now: an operator may not
--          acknowledge while motion_locked (forbidden); an operator ack of a CRITICAL alert only records
--          alerts.operator_ack_at (status, escalate_at and every dispatch untouched); ack_alert plans the pending
--          dispatch before any status change and an operator ack never withdraws a supervisor row. An unlocked
--          operator ack of a non-critical alert still stops the timeout (A09).
-- MAJOR    flood summaries are keyed per site when there is no operator (no shared flood:-:flood).
-- MINOR    a reopened critical dispatches at once; 'escalated' joins the dedupe/upgrade set and the unique index.
-- Dry run only: nothing here writes anything but dry_run / suppressed dispatch rows.

alter table public.alerts add column if not exists operator_ack_at timestamptz;
comment on column public.alerts.operator_ack_at is
  'The operator saw a CRITICAL alert. Informational: it never stops escalation (only a supervisor ack or the sensor does).';

drop index if exists public.alerts_active_hazard_uidx;
create unique index alerts_active_hazard_uidx on public.alerts (hazard_key)
  where status in ('open', 'acknowledged', 'escalating', 'escalated') and kind <> 'sos';

create or replace function private.ack_alert(p_alert_id uuid, p_via public.ack_via, p_by uuid, p_by_role public.app_role)
returns public.alerts language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype;
begin
  perform private.alert_dispatch_pending(p_alert_id);       -- plan what the tier owes BEFORE any status change
  update public.alerts set status = 'acknowledged', ack_at = now(), ack_by = p_by, ack_via = p_via, escalate_at = null
    where id = p_alert_id and status in ('open', 'escalating', 'escalated')
    returning * into a;
  if found then
    update public.dispatches set status = 'suppressed', error = jsonb_build_object('reason', 'acknowledged')
      where alert_id = a.id and status = 'queued' and (p_by_role = 'fleet_manager' or recipient_role = 'operator');
    perform private.emit_event('alert.acknowledged',
      jsonb_build_object('alert_id', a.id, 'via', p_via, 'by_role', p_by_role),
      'alertack:' || a.id::text || ':' || a.epoch::text, 'system', a.site_id, p_run_id => a.run_id,
      p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
  else
    select * into a from public.alerts x where x.id = p_alert_id;
  end if;
  return a;
end $$;

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
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if me.role = 'operator' then
    -- A09: acknowledge exists only when the cab is not locked; the server enforces it (default deny)
    if coalesce((private.can_call_operator(a.run_id, me.operator_id) ->> 'motion_locked')::boolean, true) then
      raise exception 'forbidden' using errcode = 'P0001', hint = 'motion_locked';
    end if;
    if a.tier = 'critical' then
      -- a critical alert is never switched off by its operator: record the sighting, change nothing else
      update public.alerts set operator_ack_at = coalesce(operator_ack_at, now())
        where id = a.id and status in ('open', 'escalating', 'escalated');
      perform private.emit_event('alert.acknowledged',
        jsonb_build_object('alert_id', a.id, 'via', 'app', 'by_role', 'operator'),
        'alertack_op:' || a.id::text || ':' || a.epoch::text, 'system', a.site_id, p_run_id => a.run_id,
        p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
      select * into a from public.alerts x where x.id = p_alert_id;
      return jsonb_build_object('alert_id', a.id, 'status', a.status);
    end if;
  end if;
  a := private.ack_alert(a.id, 'app', me.user_id, me.role);
  return jsonb_build_object('alert_id', a.id, 'status', a.status);
end $$;

create or replace function private.raise_flood(p_run_id uuid, p_operator_id uuid, p_site_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype; v_id uuid; i int;
        v_hk text := 'flood:' || coalesce(p_operator_id::text, 'site-' || p_site_id::text) || ':flood';
begin
  for i in 1..2 loop
    select * into a from public.alerts x where x.hazard_key = v_hk
      and x.status in ('open', 'acknowledged', 'escalating', 'escalated') for update;
    if found then
      update public.alerts set occurrences = occurrences + 1, last_seen = now() where id = a.id;
      return a.id;
    end if;
    begin
      insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, site_id, needs_ack, dispatched_tier)
        values (p_run_id, 'alert_flood', v_hk, 'caution', 'open', null, p_site_id, false, null)
        returning id into v_id;
      perform private.emit_event('alert.raised',
        jsonb_build_object('alert_id', v_id, 'kind', 'alert_flood', 'tier', 'caution', 'needs_ack', false,
          'escalate_at', null, 'occurrences', 1, 'protocol_card_id', null, 'upgraded_from', null),
        'alertraise:' || v_id::text, 'system', p_site_id, p_run_id => p_run_id, p_alert_id => v_id, p_tier => 'caution');
      return v_id;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'raise_flood could not settle %', v_hk using errcode = 'P0001';
end $$;

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
      where x.hazard_key = p_hazard_key and x.status in ('open', 'acknowledged', 'escalating', 'escalated') and x.kind <> 'sos' for update;
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
            dispatched_tier = case when greatest(a.tier, v_tier) = 'critical' then null else dispatched_tier end,  -- a reopened critical dispatches at once
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
            and (p_operator_id is not null or (x.machine_id is not distinct from p_machine_id and x.site_id = p_site_id));
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

revoke execute on function private.ack_alert(uuid, public.ack_via, uuid, public.app_role), private.raise_flood(uuid, uuid, uuid),
  private.raise_alert(uuid, text, text, public.alert_tier, uuid, uuid, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.alert_ack(uuid, uuid) from public, anon;
grant execute on function public.alert_ack(uuid, uuid) to authenticated, service_role;
grant execute on function private.ack_alert(uuid, public.ack_via, uuid, public.app_role) to service_role;
