-- Migration 002c (B4 review fixes; 002 and 002b are already applied to the shared project, so every
-- change here is additive ALTER / CREATE OR REPLACE and safe to run once on top of them).
--  1. fan-out: the "no operator" guard is simply `topic is not null` ('op:' || null is null); the old
--     `not like '%:'` clause was noise.
--  2. dispatches.site_id: the FM dispatch view becomes site-scoped (the alert's site).
--  3. dispatch kick: one trigger for inserts, one for a real status change back to 'queued' (a no-op
--     update of status = 'queued' must not post a second pg_net request).
--  4. events RLS mirrors the Realtime topics exactly: FM = supervisor/site audiences of its site (no
--     trainer-audience training records, no other sites), TR = trainer audience of its site (fixes the
--     trainer cross-site read), OP = operator audience of self + site audience of its site.
--  5. alerts RLS: FM site-scoped (was org-wide).
--  6. service_role has no direct insert/truncate on events: private.emit_event is the single write path.
--  7. my_snapshot: `is not distinct from` for the run comparisons, alerts scoped to the current run like
--     tasks, recent_events under the same predicate as the new events RLS, one comment per block.
--  8. least privilege on pg_net: client roles can neither read the request queue / responses nor use the schema.

-- ── 1. fan-out guard ───────────────────────────────────────────────────────────────────────────────
create or replace function private.events_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare et public.event_types%rowtype; a public.audience; topic text; body jsonb;
begin
  body := to_jsonb(new);
  foreach a in array new.audiences loop
    topic := case a
      when 'operator' then 'op:' || new.operator_id::text     -- null when the event has no operator: no topic
      when 'site' then 'site:' || new.site_id::text
      when 'supervisor' then 'sup:' || new.site_id::text
      when 'trainer' then 'train:' || new.site_id::text end;
    if topic is not null then
      perform realtime.send(body, 'event', topic, true);
    end if;
  end loop;
  select * into et from public.event_types where type = new.type;
  if et.ledger then
    insert into private.ledger_queue (idempotency_key, event_id, entry)
    values ('ledger:' || new.idempotency_key, new.id, jsonb_build_object('event_id', new.id, 'type', new.type))
    on conflict (idempotency_key) do nothing;
  end if;
  if et.lesson_code is not null or et.replay then
    insert into private.loop_queue (event_id) values (new.id) on conflict (event_id) do nothing;
  end if;
  return null;
end $$;

-- ── 2. dispatches.site_id (FM's dispatch view is site-scoped) ──────────────────────────────────────
alter table public.dispatches add column if not exists site_id uuid references public.sites(id);
update public.dispatches d set site_id = a.site_id
  from public.alerts a where d.alert_id = a.id and d.site_id is null;   -- alert dispatches carry the alert's site
update public.dispatches d set site_id = e.site_id
  from public.events e where d.subject_id = e.id and d.site_id is null; -- checkpoint / flood summary rows
create index if not exists dispatches_site_idx on public.dispatches (site_id);
do $$   -- enforce it when the backfill left nothing behind (a fresh project has no rows)
begin
  if not exists (select 1 from public.dispatches where site_id is null) then
    alter table public.dispatches alter column site_id set not null;
  else
    raise warning 'dispatches.site_id: rows without a site remain; not null not enforced';
  end if;
end $$;

-- ── 3. dispatch kick: insert + real requeue, never a no-op update ──────────────────────────────────
drop trigger if exists dispatches_kick on public.dispatches;
drop trigger if exists dispatches_kick_insert on public.dispatches;
drop trigger if exists dispatches_kick_requeue on public.dispatches;
create trigger dispatches_kick_insert after insert on public.dispatches
  for each row when (new.status = 'queued') execute function private.dispatch_kick();
create trigger dispatches_kick_requeue after update of status on public.dispatches
  for each row when (old.status is distinct from new.status and new.status = 'queued') execute function private.dispatch_kick();

-- ── 4. events RLS: exact mirror of the Realtime topics op:{me} / site:{site} / sup:{site} / train:{site} ──
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (
  ('site' = any (audiences) and site_id = (select private.my_site_id()))
  or ('operator' = any (audiences) and operator_id = (select private.my_operator_id()))
  or ((select private.is_fm()) and 'supervisor' = any (audiences) and site_id = (select private.my_site_id()))
  or ((select private.app_role()) = 'trainer' and 'trainer' = any (audiences) and site_id = (select private.my_site_id()))
);
comment on policy events_read on public.events is
  'Exact mirror of the Realtime topics (api-contracts §7): a role selects only the events it can receive on op:{me}, site:{site}, sup:{site} (FM) or train:{site} (TR) — no trainer-audience training records for FM, no cross-site reads for TR.';

-- alerts: FM is site-scoped (was org-wide)
drop policy if exists alerts_read on public.alerts;
create policy alerts_read on public.alerts for select to authenticated
  using (operator_id = (select private.my_operator_id())
         or ((select private.is_fm()) and site_id = (select private.my_site_id())));
comment on policy alerts_read on public.alerts is
  'Operators see their own alerts; the fleet manager sees only its site''s.';

-- dispatches: FM is site-scoped through the new site_id
drop policy if exists dispatches_read on public.dispatches;
create policy dispatches_read on public.dispatches for select to authenticated
  using ((select private.is_fm()) and site_id = (select private.my_site_id()));
comment on policy dispatches_read on public.dispatches is
  'The outbox is supervisor-only ( recipient_ref names an Edge Function secret) and site-scoped for the fleet manager.';

-- ── 5. events: no direct writes for any client role, service_role included ─────────────────────────
revoke insert, truncate on public.events from anon, authenticated, service_role;

-- ── 6. my_snapshot (rewritten; shape unchanged, run comparisons are `is not distinct from`) ────────
create or replace function public.my_snapshot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles%rowtype; run public.scenario_runs%rowtype; v_machine_id uuid; v_tel text; v_sim_now timestamptz;
  j_tasks jsonb; j_alerts jsonb; j_machine jsonb; j_state jsonb; j_weather jsonb; j_assign jsonb; j_events jsonb; j_site jsonb;
begin
  -- who is asking (role check: any signed-in user with a profile; the rest is scoped by me.*)
  select * into me from public.profiles where user_id = (select auth.uid());
  if not found then raise exception 'forbidden' using errcode = 'P0001'; end if;

  -- the current scenario run and its simulated clock
  select * into run from public.scenario_runs where is_current limit 1;
  if run.id is not null then
    v_sim_now := case when run.status = 'playing' then run.sim_anchor + (now() - run.wall_anchor) * run.speed else run.sim_anchor end;
  end if;

  -- site (the emergency number lives in Vault, never in a table)
  select decrypted_secret into v_tel from vault.decrypted_secrets where name = 'site_emergency_tel';
  select jsonb_build_object('id', s.id, 'name', s.name, 'emergency_tel', v_tel) into j_site from public.sites s where s.id = me.site_id;

  -- the machine this operator is paired with in the current run (or, with no run, outside any run)
  if me.operator_id is not null then
    select machine_id into v_machine_id from public.operator_pairings
      where operator_id = me.operator_id and unpaired_at is null and run_id is not distinct from run.id
      order by paired_at desc limit 1;
  end if;

  -- tasks of the current run: own for an operator, the site's for FM / TR
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'task_type', t.task_type, 'status', t.status,
      'planned_start', t.planned_start, 'progress_pct', t.progress_pct, 'eta_p50_min', t.eta_p50_min,
      'eta_p90_min', t.eta_p90_min, 'eta_factors', t.eta_factors) order by t.planned_start), '[]')
    into j_tasks
    from public.tasks t
    where t.run_id is not distinct from run.id
      and (t.operator_id = me.operator_id or (me.role in ('fleet_manager', 'trainer') and t.site_id = me.site_id));

  -- active alerts of the current run (open / acknowledged / escalating): own, or the site's for FM
  select coalesce(jsonb_agg(jsonb_build_object('alert_id', a.id, 'kind', a.kind, 'tier', a.tier, 'needs_ack', a.needs_ack,
      'escalate_at', a.escalate_at, 'occurrences', a.occurrences, 'protocol_card_id', a.protocol_card_id,
      'upgraded_from', (a.tier_history -> -1 ->> 'from'), 'status', a.status, 'first_seen', a.first_seen)
      order by a.first_seen desc), '[]')
    into j_alerts
    from public.alerts a
    where a.status in ('open', 'acknowledged', 'escalating')
      and a.run_id is not distinct from run.id
      and (a.operator_id = me.operator_id or (me.role = 'fleet_manager' and a.site_id = me.site_id));

  -- the paired machine's live state (falls back to the site centre when it has no position yet)
  if v_machine_id is not null then
    select jsonb_build_object('id', m.id, 'code', m.code, 'model_name', mm.name,
        'moving', coalesce(ms.moving, false), 'speed_kmh', coalesce(ms.speed_kmh, 0), 'health', coalesce(ms.health, 'ok'),
        'location', jsonb_build_object('lat', coalesce(extensions.ST_Y(ms.location::extensions.geometry), extensions.ST_Y(s.location::extensions.geometry)),
                                       'lon', coalesce(extensions.ST_X(ms.location::extensions.geometry), extensions.ST_X(s.location::extensions.geometry))),
        'seatbelt_fastened', ms.seatbelt_fastened, 'parking_brake', ms.parking_brake)
      into j_machine
      from public.machines m
      left join public.machine_models mm on mm.id = m.model_id
      left join public.machine_state ms on ms.machine_id = m.id and ms.run_id is not distinct from run.id
      join public.sites s on s.id = me.site_id
      where m.id = v_machine_id;
  end if;

  -- the operator's own live state (motion lock and nearest hazard are server-computed, UI-5/UI-6)
  if me.operator_id is not null then
    select jsonb_build_object('on_foot', os.on_foot, 'ppe', os.ppe,
        'location', case when os.location is null then null else jsonb_build_object('lat', extensions.ST_Y(os.location::extensions.geometry), 'lon', extensions.ST_X(os.location::extensions.geometry)) end,
        'ts', os.ts, 'motion_locked', os.motion_locked, 'call_allowed', os.call_allowed, 'nearest', os.nearest)
      into j_state
      from public.operator_state os where os.operator_id = me.operator_id and os.run_id is not distinct from run.id;
  end if;

  -- latest weather for the site: the current run's snapshot first, otherwise the site's newest
  select jsonb_build_object('ts', w.ts, 'temperature_c', w.temperature_c, 'wbgt_c', w.wbgt_c, 'wind_chill_c', w.wind_chill_c,
      'wind_kmh', w.wind_kmh, 'forecast_peak_c', w.forecast_peak_c, 'forecast_peak_at', w.forecast_peak_at,
      'source_label', case when w.source = 'open_meteo_archive' then 'Open-Meteo archive, CC BY 4.0 (scenario forecast)' else w.source end)
    into j_weather
    from public.weather_snapshots w
    where w.site_id = me.site_id and (w.run_id is not distinct from run.id or w.run_id is null)
    order by (w.run_id is not distinct from run.id) desc, w.ts desc limit 1;

  -- open lesson assignments with their replay, if one was built from the same event
  select coalesce(jsonb_agg(jsonb_build_object('id', la.id, 'lesson_code', l.code, 'because_event_id', la.because_event_id,
      'replay_id', rs.id) order by la.assigned_at desc), '[]')
    into j_assign
    from public.lesson_assignments la
    join public.lessons l on l.id = la.lesson_id
    left join public.replay_scenarios rs on rs.source_event_id = la.because_event_id and rs.operator_id = la.operator_id
    where la.operator_id = me.operator_id and la.completed_at is null;

  -- the 50 newest events this role may see (same predicate as the events RLS policy: topic mirror)
  select coalesce(jsonb_agg(to_jsonb(e) order by e.seq desc), '[]') into j_events
    from (select * from public.events e
          where ('site' = any (e.audiences) and e.site_id = me.site_id)
             or ('operator' = any (e.audiences) and e.operator_id = me.operator_id)
             or (me.role = 'fleet_manager' and 'supervisor' = any (e.audiences) and e.site_id = me.site_id)
             or (me.role = 'trainer' and 'trainer' = any (e.audiences) and e.site_id = me.site_id)
          order by e.seq desc limit 50) e;

  return jsonb_build_object(
    'contracts_version', '1.0.0',
    'profile', jsonb_build_object('user_id', me.user_id, 'role', me.role, 'operator_id', me.operator_id, 'site_id', me.site_id, 'language', me.language),
    'server_now', now(),
    'run', case when run.id is null then null else jsonb_build_object('id', run.id, 'status', run.status, 'speed', run.speed, 'sim_now', v_sim_now) end,
    'site', j_site,
    'paired_machine_id', v_machine_id,
    'tasks', j_tasks,
    'active_alerts', j_alerts,
    'machine', j_machine,
    'operator_state', j_state,
    'weather', j_weather,
    'assignments', j_assign,
    'recent_events', j_events);
end $$;

-- ── 7. pg_net: client roles cannot read the request queue / responses or use the schema ────────────
do $$
begin
  revoke all on all tables in schema net from anon, authenticated;
  revoke usage on schema net from anon, authenticated;
exception when others then
  raise notice 'pg_net revoke skipped: %', sqlerrm;   -- grants made by another role cannot be revoked by postgres
end $$;
