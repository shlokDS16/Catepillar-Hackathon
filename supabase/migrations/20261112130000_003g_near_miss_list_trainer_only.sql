-- 003g: the near-miss list is trainer-only and unattributed (third review of 003f).
-- 003f returned a stable operators.pseudonym, incident_id, seq and redacted free text, for punitive and sealed
-- near misses alike. One punitive row (visible to the FM with identity via incident.logged) ties a pseudonym to
-- a name, which names every sealed row with the same pseudonym; seq and incident_id line up with the ledger
-- export; dictionary redaction of free text missed machine codes, surnames and Devanagari names. So:
--   * near_miss_list() is for the trainer only (the FM gets 'forbidden');
--   * it lists sealed (non_punitive) rows only, as (day, severity, incident_type): no pseudonym, id, seq,
--     time of day or text, ordered by day and severity, never by seq;
--   * redact_operator_names is dropped.
-- Breaking change to an RPC with no consumer: NearMissListOut changes, CONTRACTS_VERSION 1.0.0 -> 2.0.0, and
-- my_snapshot reports the new version (rest of the function unchanged from 003f).
drop function if exists public.near_miss_list();
create function public.near_miss_list()
returns table (day date, severity int, incident_type text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.app_role() is distinct from 'trainer' then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
    select (i.occurred_at at time zone 'UTC')::date, i.severity::int, i.incident_type::text
    from public.incidents i
    where i.site_id = private.my_site_id() and i.non_punitive
    order by 1 desc, 2 desc, 3 limit 200;
end $$;
revoke execute on function public.near_miss_list() from public, anon;
grant execute on function public.near_miss_list() to authenticated, service_role;
drop function if exists private.redact_operator_names(text, uuid);

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
          where private.event_visible(e, me.role, me.site_id, me.operator_id)
          order by e.seq desc limit 50) e;

  return jsonb_build_object(
    'contracts_version', '2.0.0',
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
