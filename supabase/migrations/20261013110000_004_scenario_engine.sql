-- Migration 004 — B9, the scenario engine (data-model §2.3, §2.4, §6, §7; event-pipeline §0, §2;
-- api-contracts §7). 001…003b are applied, so everything here is additive.
--
-- The spine (event-pipeline §0) is one 1-second pg_cron job running a procedure that COMMITs between
-- its steps:
--
--   call private.worker_step();
--     step 1  private.ledger_drain(50)   ≤ 50 queue rows under lock 4210001 (B5)          COMMIT
--     step 2  private.step_loop(20)      ≤ 20 Loop items (body arrives with B10b)         COMMIT
--     step 3  private.step_tick()        try-lock 4210002, ≤ 200 due frames, per-frame
--                                        exception → private.tick_errors, tick_log,
--                                        'clock' + delta 'machines' broadcast             COMMIT
--     step 4  private.step_requeue()     every 5th second: dispatch requeue, housekeeping COMMIT
--
-- Procedure rules (R2-1, proved by B0's COMMIT probe): SECURITY INVOKER, **no `SET` clause** (PostgreSQL
-- forbids transaction control in a procedure that has one), every name schema-qualified, each step in its
-- own `begin … exception … end` with the `commit` OUTSIDE that block (a COMMIT inside an exception block
-- is a subtransaction error the handler would swallow), and the job command exactly `call …;` (a
-- multi-statement command is one implicit transaction, in which COMMIT fails). The step bodies are plain
-- SECURITY DEFINER functions so the rollback-wrapped SQL tests can call them.
--
-- Statement timeout (N4, settled by B0): the role-level backstop via `cron.schedule_in_database(…,
-- username)` is **unavailable on this project** — `postgres` is not superuser, so it cannot create or
-- schedule as `spotter_worker` (decision D13). The guarantee is therefore **bounded work per step**:
-- ≤ 50 ledger rows, ≤ 20 Loop items, ≤ `app_config.max_frames_per_tick` (200) frames, ≤ 50 requeues,
-- every query index-backed. The only backstop left is the `postgres` role's 2-minute cap; a cancel is
-- not caught by `WHEN OTHERS`, so that run's remaining steps are skipped and the next run 1 s later
-- resumes from what already committed.
--
-- Blocks:
--   1. tables          worker_errors, worker_state, machine_broadcast; tick_log.catchups
--   2. motion lock     can_call_operator (the one predicate behind operator_state.motion_locked,
--                      call_allowed and B12's dispatcher) and operator_nearest (UI-6)
--   3. apply_frame     one scenario frame → telemetry / state / gps / weather / faults / ppe, task
--                      progress from load cycles, motion lock, nearest; then the detector hook
--   4. step_tick       the tick itself (lock, due frames, catch-up, errors, cursor, log, broadcasts)
--   5. step_loop       stub: B10b fills it in. It must NOT mark queue rows done.
--   6. step_requeue    dispatch requeue + housekeeping + the size guard
--   7. worker_step     the procedure, and private.manual_tick for the director
--   8. purge_run       rehearsal cleanup (data-model §7)
--   9. the pg_cron job, grants and comments
--
-- pg_net: nothing here puts a credential into `net.http_request_queue`. The requeue step only flips
-- `dispatches.status` back to 'queued'; the kick trigger (002d) posts `{dispatch_id}` and nothing else.

-- ════ 1. Tables ═══════════════════════════════════════════════════════════════════════════════════

-- One row per step that raised. `tick_errors` is per frame; this is per step, so a failing drain or Loop
-- build is as visible as a poison frame (and `demo-check` reads both).
create table if not exists private.worker_errors (
  id bigint generated always as identity primary key,
  step text not null,
  sqlstate text,
  message text,
  at timestamptz not null default now()
);
create index if not exists worker_errors_at_idx on private.worker_errors (at desc);

-- Single-row bookkeeping for the parts of step 4 that must not run every 5 seconds.
create table if not exists private.worker_state (
  id boolean primary key default true check (id),
  last_housekeeping_at timestamptz not null default to_timestamp(0)
);
insert into private.worker_state (id) values (true) on conflict (id) do nothing;

-- What the last `machines` broadcast said, so the next one can be a delta (data-model §7: the frame is
-- sent only for machines that moved > 5 m or changed health/motion, which is what keeps Realtime inside
-- the free-plan message budget).
create table if not exists private.machine_broadcast (
  run_id uuid not null references public.scenario_runs(id) on delete cascade,
  machine_id uuid not null references public.machines(id),
  last_location extensions.geography(Point, 4326),
  last_moving boolean,
  last_health public.machine_health,
  last_sent_at timestamptz not null default now(),
  primary key (run_id, machine_id)
);
create index if not exists machine_broadcast_machine_idx on private.machine_broadcast (machine_id);

-- the acceptance criterion "zero catch_up suppressions at 60×" has to be measurable after the fact
alter table private.tick_log add column if not exists catchups int not null default 0;
create index if not exists tick_errors_run_idx on private.tick_errors (run_id, at desc);

-- ════ 2. Motion lock and nearest hazard ═══════════════════════════════════════════════════════════

-- event-pipeline §2 (G2-17), the decision table, default DENY:
--   state missing, or older than app_config.state_stale_s   → deny  state_unknown
--   on foot                                                 → allow on_foot
--   in a cab, that machine parked (speed ≤ motion_speed_kmh
--     AND parking brake on)                                 → allow parked
--   in a cab, machine moving (or its state unknown)         → deny  motion_lock / state_unknown
--   not on foot and no cab                                  → deny  state_unknown
--   a voice call to this person in the last 60 s            → deny  call_cooldown
-- `motion_locked` is the cockpit's glance-mode flag and deliberately ignores the cooldown: a cooldown
-- says "do not ring him again", not "he cannot touch the screen".
-- Staleness is measured on `updated_at` (WALL clock), never on `ts` (SIMULATED): at 60× a sim timestamp
-- runs an hour ahead of reality and would call a two-minute-old state fresh.
create or replace function private.can_call_operator(p_run_id uuid, p_operator_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare os public.operator_state%rowtype; ms public.machine_state%rowtype; cfg public.app_config%rowtype;
        v_state text; v_locked boolean; v_allowed boolean; v_reason text;
begin
  select * into cfg from public.app_config where id;
  select * into os from public.operator_state o
    where o.run_id is not distinct from p_run_id and o.operator_id = p_operator_id;

  if not found or os.updated_at < now() - make_interval(secs => coalesce(cfg.state_stale_s, 10)) then
    return jsonb_build_object('allowed', false, 'reason', 'state_unknown',
                              'motion_locked', true, 'state', 'state_unknown');
  end if;

  if coalesce(os.on_foot, false) then
    v_state := 'on_foot';
  elsif os.in_cab_machine_id is not null then
    select * into ms from public.machine_state m
      where m.run_id is not distinct from p_run_id and m.machine_id = os.in_cab_machine_id;
    if not found then
      v_state := 'state_unknown';                                    -- a cab we know nothing about: deny
    elsif coalesce(ms.speed_kmh, 999) <= coalesce(cfg.motion_speed_kmh, 0.5) and coalesce(ms.parking_brake, false) then
      v_state := 'parked';
    else
      v_state := 'moving';
    end if;
  else
    v_state := 'state_unknown';
  end if;

  v_locked := v_state not in ('on_foot', 'parked');
  v_allowed := not v_locked;
  v_reason := case v_state when 'moving' then 'motion_lock' when 'state_unknown' then 'state_unknown' end;

  -- Twilio's own rule (event-pipeline §7 external caps): one call per recipient per 60 s.
  if v_allowed and exists (
      select 1 from public.dispatches d
      join public.alerts a on a.id = d.alert_id
      where d.channel = 'twilio_voice' and d.recipient_role = 'operator'
        and a.operator_id = p_operator_id
        and d.status <> 'suppressed'
        and d.created_at > now() - interval '60 seconds') then
    v_allowed := false; v_reason := 'call_cooldown';
  end if;

  return jsonb_build_object('allowed', v_allowed, 'reason', v_reason,
                            'motion_locked', v_locked, 'state', v_state);
end $$;

-- UI-6: the closest hazard to the operator, {kind, id, code, distance_m, zone}. The rings come from
-- app_config (danger 15 m, guardian 50 m); anything further is 'awareness'. Bounded by ST_DWithin on the
-- GIST indexes and `limit 1`, and the operator's own cab machine is never his own nearest hazard.
create or replace function private.operator_nearest(p_run_id uuid, p_operator_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare os public.operator_state%rowtype; cfg public.app_config%rowtype; v jsonb;
        v_radius numeric;
begin
  select * into cfg from public.app_config where id;
  select * into os from public.operator_state o
    where o.run_id is not distinct from p_run_id and o.operator_id = p_operator_id;
  if not found or os.location is null then return null; end if;
  v_radius := greatest(coalesce(cfg.guardian_radius_m, 50) * 6, 300);   -- look a little past the rings

  select jsonb_build_object('kind', c.kind, 'id', c.id, 'code', c.code,
           'distance_m', round(c.distance_m::numeric, 1),
           'zone', case when c.distance_m <= coalesce(cfg.danger_radius_m, 15) then 'danger'
                        when c.distance_m <= coalesce(cfg.guardian_radius_m, 50) then 'warning'
                        else 'awareness' end)
    into v
    from (
      select 'machine' as kind, m.id, m.code,
             extensions.ST_Distance(ms.location, os.location) as distance_m
        from public.machine_state ms
        join public.machines m on m.id = ms.machine_id
       where ms.run_id is not distinct from p_run_id
         and ms.location is not null
         and ms.machine_id is distinct from os.in_cab_machine_id
         and extensions.ST_DWithin(ms.location, os.location, v_radius)
      union all
      select 'person' as kind, o2.id, o2.employee_code,
             extensions.ST_Distance(os2.location, os.location) as distance_m
        from public.operator_state os2
        join public.operators o2 on o2.id = os2.operator_id
       where os2.run_id is not distinct from p_run_id
         and os2.operator_id <> p_operator_id
         and os2.location is not null
         and extensions.ST_DWithin(os2.location, os.location, v_radius)
    ) c
   order by c.distance_m
   limit 1;
  return v;
end $$;

-- Writes operator_state.motion_locked / call_allowed / nearest from the two functions above and emits
-- `operator.motion_lock_changed` only when the lock actually flips (UI-5: the cockpit and the dispatcher
-- must never disagree, and a 1 Hz event stream would drown the inbox).
create or replace function private.refresh_operator_lock(p_run_id uuid, p_operator_id uuid, p_site_id uuid,
                                                         p_sim_ts timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare d jsonb; v_near jsonb; v_was boolean; v_was_allowed boolean;
begin
  if p_operator_id is null then return; end if;
  select o.motion_locked, o.call_allowed into v_was, v_was_allowed
    from public.operator_state o
    where o.run_id is not distinct from p_run_id and o.operator_id = p_operator_id;
  if not found then return; end if;

  d := private.can_call_operator(p_run_id, p_operator_id);
  v_near := private.operator_nearest(p_run_id, p_operator_id);

  update public.operator_state o
     set motion_locked = (d ->> 'motion_locked')::boolean,
         call_allowed = (d ->> 'allowed')::boolean,
         nearest = v_near,
         updated_at = now()
   where o.run_id is not distinct from p_run_id and o.operator_id = p_operator_id;

  if v_was is distinct from (d ->> 'motion_locked')::boolean
     or v_was_allowed is distinct from (d ->> 'allowed')::boolean then
    perform private.emit_event('operator.motion_lock_changed',
      jsonb_build_object('motion_locked', (d ->> 'motion_locked')::boolean,
                         'call_allowed', (d ->> 'allowed')::boolean,
                         'reason', d ->> 'state'),
      'mlock:' || p_run_id::text || ':' || p_operator_id::text || ':' ||
        to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
      'system', p_site_id, p_run_id, null::uuid, p_operator_id, null::uuid, null::uuid, p_sim_ts);
  end if;
end $$;

-- ════ 3. apply_frame ══════════════════════════════════════════════════════════════════════════════

-- The detector hook. B10 (pure rules + apply_findings) and B11 (EWMA + Guardian) replace this body with
-- `create or replace`; B9 ships it as a no-op so the engine is complete and testable on its own, and so
-- that a detector that raises is contained by the per-frame exception block in step_tick, not by luck.
create or replace function private.detect_frame(p_run_id uuid, p_frame public.scenario_frames,
                                                p_frame_sim timestamptz, p_catchup boolean)
returns int language plpgsql security definer set search_path = '' as $$
begin
  return 0;      -- B10/B11: pure detectors → private.apply_findings(...). Nothing to do in B9.
end $$;

-- One scenario frame → live state. Raw sensor values only: a frame never carries an event, an alert or a
-- label (honesty rule — the generator and the detector are separate programs). The frame's `machine_id`
-- and `operator_id` columns say who it is about; `payload` carries the readings.
--
-- Payload keys by kind (the contract B6's generator writes, mirrored in
-- packages/shared/src/contracts/frames.ts):
--   telemetry      engine_hours, fuel_used_l, load_cycles, idle_hours, seatbelt_fastened,
--                  organiser_safety_alert, rpm, engine_load_pct, coolant_temp_c, hydraulic_temp_c,
--                  hydraulic_pressure_bar, speed_kmh, pitch_deg, roll_deg, parking_brake,
--                  fuel_level_pct, def_pct, lat, lon
--   gps            lat, lon, speed_kmh, accuracy_m
--   operator_state on_foot, lat, lon        (frame.machine_id = the cab when on_foot is false)
--   ppe            helmet, vest, boots, gloves   (booleans, merged into operator_state.ppe)
--   weather        temperature_c, apparent_temperature_c, humidity_pct, wind_kmh, wind_from_deg,
--                  wind_gust_kmh, precipitation_mm, weather_code, shortwave_wm2, wbgt_c, wind_chill_c,
--                  forecast_peak_c, forecast_peak_at
--   fault          code_type, spn, fmi, cid, mid, eid, severity, description_key, active
create or replace function private.apply_frame(p_run public.scenario_runs, p_scenario public.scenarios,
                                               p_frame public.scenario_frames, p_cfg public.app_config,
                                               p_frame_sim timestamptz, p_catchup boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare p jsonb := p_frame.payload; v_loc extensions.geography(Point, 4326);
        v_operator uuid; v_moving boolean; v_health public.machine_health;
        t public.tasks%rowtype; v_new_pct numeric(5,2); v_old_pct numeric(5,2);
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'frame %: payload must be a JSON object', p_frame.seq using errcode = 'P0001';
  end if;
  if (p ? 'lat') and (p ? 'lon') and (p ->> 'lat') is not null and (p ->> 'lon') is not null then
    v_loc := extensions.ST_SetSRID(extensions.ST_MakePoint((p ->> 'lon')::double precision,
                                                           (p ->> 'lat')::double precision), 4326)::extensions.geography;
  end if;

  if p_frame.kind = 'telemetry' then
    if p_frame.machine_id is null then
      raise exception 'frame %: a telemetry frame needs a machine', p_frame.seq using errcode = 'P0001';
    end if;
    -- who is in that cab right now (the pairing is the run's truth; UI "pair a machine", G2-14)
    select op.operator_id into v_operator from public.operator_pairings op
      where op.machine_id = p_frame.machine_id and op.unpaired_at is null
        and op.run_id is not distinct from p_run.id
      order by op.paired_at desc limit 1;
    v_operator := coalesce(p_frame.operator_id, v_operator);
    v_moving := coalesce((p ->> 'speed_kmh')::numeric, 0) > coalesce(p_cfg.motion_speed_kmh, 0.5);

    insert into public.telemetry_readings (run_id, frame_seq, machine_id, operator_id, ts,
      engine_hours, fuel_used_l, load_cycles, idle_hours, seatbelt_fastened, organiser_safety_alert,
      rpm, engine_load_pct, coolant_temp_c, hydraulic_temp_c, hydraulic_pressure_bar, speed_kmh,
      pitch_deg, roll_deg, parking_brake, fuel_level_pct, def_pct, location)
    values (p_run.id, p_frame.seq, p_frame.machine_id, v_operator, p_frame_sim,
      (p ->> 'engine_hours')::numeric, (p ->> 'fuel_used_l')::numeric, (p ->> 'load_cycles')::int,
      (p ->> 'idle_hours')::numeric, (p ->> 'seatbelt_fastened')::boolean, p ->> 'organiser_safety_alert',
      (p ->> 'rpm')::int, (p ->> 'engine_load_pct')::numeric, (p ->> 'coolant_temp_c')::numeric,
      (p ->> 'hydraulic_temp_c')::numeric, (p ->> 'hydraulic_pressure_bar')::numeric, (p ->> 'speed_kmh')::numeric,
      (p ->> 'pitch_deg')::numeric, (p ->> 'roll_deg')::numeric, (p ->> 'parking_brake')::boolean,
      (p ->> 'fuel_level_pct')::numeric, (p ->> 'def_pct')::numeric, v_loc)
    on conflict (run_id, frame_seq) do nothing;              -- a replayed frame is a no-op (EP §8)

    insert into public.machine_state (run_id, machine_id, ts, speed_kmh, moving, parking_brake,
      seatbelt_fastened, operator_id, pitch_deg, roll_deg, location, hydraulic_temp_c, coolant_temp_c,
      load_cycles, updated_at)
    values (p_run.id, p_frame.machine_id, p_frame_sim, (p ->> 'speed_kmh')::numeric, v_moving,
      (p ->> 'parking_brake')::boolean, (p ->> 'seatbelt_fastened')::boolean, v_operator,
      (p ->> 'pitch_deg')::numeric, (p ->> 'roll_deg')::numeric, v_loc, (p ->> 'hydraulic_temp_c')::numeric,
      (p ->> 'coolant_temp_c')::numeric, (p ->> 'load_cycles')::int, now())
    on conflict (run_id, machine_id) do update set
      ts = excluded.ts, speed_kmh = excluded.speed_kmh, moving = excluded.moving,
      parking_brake = excluded.parking_brake, seatbelt_fastened = excluded.seatbelt_fastened,
      operator_id = coalesce(excluded.operator_id, public.machine_state.operator_id),
      pitch_deg = excluded.pitch_deg, roll_deg = excluded.roll_deg,
      location = coalesce(excluded.location, public.machine_state.location),
      hydraulic_temp_c = excluded.hydraulic_temp_c, coolant_temp_c = excluded.coolant_temp_c,
      load_cycles = coalesce(excluded.load_cycles, public.machine_state.load_cycles), updated_at = now();

    -- Task progress from load cycles (G2-14, UI-1): the running task of the operator in this cab.
    if v_operator is not null and (p ? 'load_cycles') then
      select * into t from public.tasks tk
        where tk.run_id is not distinct from p_run.id and tk.operator_id = v_operator
          and tk.status = 'in_progress' and tk.cycles_at_start is not null and tk.planned_cycles > 0
        order by tk.planned_start limit 1;
      if found then
        v_old_pct := t.progress_pct;
        v_new_pct := least(100, greatest(0,
          round(((p ->> 'load_cycles')::int - t.cycles_at_start) * 100.0 / t.planned_cycles, 2)));
        if v_new_pct is distinct from v_old_pct then
          update public.tasks set progress_pct = v_new_pct where id = t.id;
          -- one event per 10 % step, never per frame
          if floor(v_new_pct / 10) > floor(coalesce(v_old_pct, 0) / 10) then
            perform private.emit_event('task.progress',
              jsonb_build_object('task_id', t.id, 'status', t.status, 'progress_pct', v_new_pct,
                                 'eta_p50_min', t.eta_p50_min, 'eta_p90_min', t.eta_p90_min),
              'sys:progress:' || t.id::text || ':' || (floor(v_new_pct / 10) * 10)::int::text,
              'system', t.site_id, p_run.id, t.machine_id, t.operator_id, t.id, null::uuid, p_frame_sim);
          end if;
        end if;
      end if;
    end if;

    -- the cab's occupant may have just become (un)reachable
    perform private.refresh_operator_lock(p_run.id, v_operator, p_scenario.site_id, p_frame_sim);

  elsif p_frame.kind = 'gps' then
    if p_frame.operator_id is null or v_loc is null then
      raise exception 'frame %: a gps frame needs an operator and a position', p_frame.seq using errcode = 'P0001';
    end if;
    insert into public.operator_gps_trail (run_id, operator_id, ts, location, speed_kmh, accuracy_m)
    values (p_run.id, p_frame.operator_id, p_frame_sim, v_loc, (p ->> 'speed_kmh')::numeric,
            (p ->> 'accuracy_m')::numeric);
    insert into public.operator_state (run_id, operator_id, ts, location, updated_at)
    values (p_run.id, p_frame.operator_id, p_frame_sim, v_loc, now())
    on conflict (run_id, operator_id) do update set
      ts = excluded.ts, location = excluded.location, updated_at = now();
    perform private.refresh_operator_lock(p_run.id, p_frame.operator_id, p_scenario.site_id, p_frame_sim);

  elsif p_frame.kind = 'operator_state' then
    if p_frame.operator_id is null then
      raise exception 'frame %: an operator_state frame needs an operator', p_frame.seq using errcode = 'P0001';
    end if;
    insert into public.operator_state (run_id, operator_id, ts, location, on_foot, in_cab_machine_id, updated_at)
    values (p_run.id, p_frame.operator_id, p_frame_sim, v_loc, (p ->> 'on_foot')::boolean,
            case when coalesce((p ->> 'on_foot')::boolean, false) then null else p_frame.machine_id end, now())
    on conflict (run_id, operator_id) do update set
      ts = excluded.ts,
      location = coalesce(excluded.location, public.operator_state.location),
      on_foot = excluded.on_foot, in_cab_machine_id = excluded.in_cab_machine_id, updated_at = now();
    perform private.refresh_operator_lock(p_run.id, p_frame.operator_id, p_scenario.site_id, p_frame_sim);

  elsif p_frame.kind = 'ppe' then
    if p_frame.operator_id is null then
      raise exception 'frame %: a ppe frame needs an operator', p_frame.seq using errcode = 'P0001';
    end if;
    insert into public.operator_state (run_id, operator_id, ts, ppe, updated_at)
    values (p_run.id, p_frame.operator_id, p_frame_sim, p - 'lat' - 'lon', now())
    on conflict (run_id, operator_id) do update set
      ts = excluded.ts, ppe = public.operator_state.ppe || excluded.ppe, updated_at = now();

  elsif p_frame.kind = 'weather' then
    insert into public.weather_snapshots (site_id, run_id, ts, temperature_c, apparent_temperature_c,
      humidity_pct, wind_kmh, wind_from_deg, wind_gust_kmh, precipitation_mm, weather_code,
      shortwave_wm2, wbgt_c, wind_chill_c, forecast_peak_c, forecast_peak_at, source)
    values (p_scenario.site_id, p_run.id, p_frame_sim, (p ->> 'temperature_c')::numeric,
      (p ->> 'apparent_temperature_c')::numeric, (p ->> 'humidity_pct')::numeric, (p ->> 'wind_kmh')::numeric,
      (p ->> 'wind_from_deg')::numeric, (p ->> 'wind_gust_kmh')::numeric, (p ->> 'precipitation_mm')::numeric,
      (p ->> 'weather_code')::int, (p ->> 'shortwave_wm2')::numeric, (p ->> 'wbgt_c')::numeric,
      (p ->> 'wind_chill_c')::numeric, (p ->> 'forecast_peak_c')::numeric, (p ->> 'forecast_peak_at')::timestamptz,
      coalesce(p ->> 'source', 'open_meteo_archive'));

  elsif p_frame.kind = 'fault' then
    if p_frame.machine_id is null then
      raise exception 'frame %: a fault frame needs a machine', p_frame.seq using errcode = 'P0001';
    end if;
    insert into public.fault_codes (run_id, machine_id, ts, code_type, spn, fmi, cid, mid, eid,
      severity, description_key, active, cleared_at)
    values (p_run.id, p_frame.machine_id, p_frame_sim, coalesce(p ->> 'code_type', 'j1939_spn_fmi'),
      (p ->> 'spn')::int, (p ->> 'fmi')::int, (p ->> 'cid')::int, (p ->> 'mid')::int, (p ->> 'eid')::int,
      coalesce((p ->> 'severity')::public.fault_severity, 'info'), coalesce(p ->> 'description_key', 'fault.unknown'),
      coalesce((p ->> 'active')::boolean, true),
      case when coalesce((p ->> 'active')::boolean, true) then null else p_frame_sim end);
    v_health := case coalesce(p ->> 'severity', 'info')
                  when 'shutdown' then 'fault' when 'derate' then 'fault'
                  when 'caution' then 'caution' else 'ok' end;
    if coalesce((p ->> 'active')::boolean, true) then
      update public.machine_state set health = v_health, updated_at = now()
        where run_id = p_run.id and machine_id = p_frame.machine_id and health <> v_health;
    end if;

  else
    raise exception 'frame %: unknown frame kind %', p_frame.seq, p_frame.kind using errcode = 'P0001';
  end if;

  -- detectors last, on the state this frame just produced (B10/B11)
  perform private.detect_frame(p_run.id, p_frame, p_frame_sim, p_catchup);
end $$;

-- ════ 4. step_tick ════════════════════════════════════════════════════════════════════════════════

-- The worker's step 3, and the whole of `manual_tick`. A plain function, so the rollback-wrapped SQL
-- tests can call it (R2-1); the COMMIT around it belongs to the procedure.
create or replace function private.step_tick()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run public.scenario_runs%rowtype; v_scn public.scenarios%rowtype; v_cfg public.app_config%rowtype;
        f public.scenario_frames%rowtype;
        v_t0 timestamptz := clock_timestamp(); v_sim_now timestamptz; v_due_ms bigint;
        v_frames int := 0; v_errors int := 0; v_catchups int := 0; v_cap int;
        v_last_seq int; v_frame_sim timestamptz; v_catchup boolean; v_catch_ms bigint;
        v_next_due_ms bigint; v_lag bigint := 0; v_topic text; v_machines jsonb; v_finished boolean := false;
begin
  -- N5: the same try-lock as private.manual_tick, so a director tick and the job can never overlap.
  if not pg_try_advisory_xact_lock(4210002) then
    return jsonb_build_object('skipped', true, 'reason', 'locked');
  end if;

  select * into v_cfg from public.app_config where id;
  select * into v_run from public.scenario_runs r where r.is_current and r.status = 'playing' limit 1;
  if not found then return jsonb_build_object('skipped', true, 'reason', 'no_playing_run'); end if;
  select * into v_scn from public.scenarios s where s.id = v_run.scenario_id;

  v_sim_now := v_run.sim_anchor + (now() - v_run.wall_anchor) * v_run.speed;
  v_due_ms := floor(extract(epoch from (v_sim_now - v_scn.shift_start_sim)) * 1000)::bigint;
  -- event-pipeline §0 catch-up rule (b): "more than 5 WALL seconds behind", expressed in sim ms.
  -- At 60× that is 300 s of sim time, so an ordinary 1 s tick (60 s of sim) never trips it — which is
  -- exactly what G2-5 asked for.
  v_catch_ms := 5000::bigint * v_run.speed;
  v_cap := greatest(coalesce(v_cfg.max_frames_per_tick, 200), 1);
  v_last_seq := v_run.cursor_seq;

  for f in
    select * from public.scenario_frames sf
     where sf.scenario_id = v_run.scenario_id
       and sf.seq > v_run.cursor_seq
       and sf.sim_offset_ms <= v_due_ms
     order by sf.seq
     limit v_cap
  loop
    v_frame_sim := v_scn.shift_start_sim + make_interval(secs => f.sim_offset_ms / 1000.0);
    v_catchup := (v_run.catchup_until_seq is not null and f.seq <= v_run.catchup_until_seq)
                 or (v_due_ms - f.sim_offset_ms > v_catch_ms);
    if v_catchup then v_catchups := v_catchups + 1; end if;
    begin
      perform private.apply_frame(v_run, v_scn, f, v_cfg, v_frame_sim, v_catchup);
    exception when others then
      -- G2-1: the poison frame is logged and skipped; the cursor still advances past it, so the tick
      -- cannot get stuck on it for ever, and the frames behind it are not held hostage.
      v_errors := v_errors + 1;
      insert into private.tick_errors (run_id, frame_seq, sqlstate, message)
      values (v_run.id, f.seq, sqlstate, left(sqlerrm, 500));
    end;
    v_frames := v_frames + 1;
    v_last_seq := f.seq;
  end loop;

  -- how far behind the cursor still is, in SIM ms (read by B11 and by demo-check)
  select min(sf.sim_offset_ms) into v_next_due_ms from public.scenario_frames sf
   where sf.scenario_id = v_run.scenario_id and sf.seq > v_last_seq and sf.sim_offset_ms <= v_due_ms;
  v_lag := case when v_next_due_ms is null then 0 else v_due_ms - v_next_due_ms end;

  if v_last_seq <> v_run.cursor_seq then
    v_finished := not exists (select 1 from public.scenario_frames sf
                              where sf.scenario_id = v_run.scenario_id and sf.seq > v_last_seq);
    update public.scenario_runs r
       set cursor_seq = v_last_seq,
           catchup_until_seq = case when r.catchup_until_seq is not null and v_last_seq >= r.catchup_until_seq
                                    then null else r.catchup_until_seq end,
           status = case when v_finished then 'finished'::public.run_status else r.status end
     where r.id = v_run.id;
    if v_finished then
      perform private.emit_event('scenario.finished',
        jsonb_build_object('status', 'finished', 'speed', v_run.speed, 'sim_now', v_sim_now),
        'sys:scenario:' || v_run.id::text || ':finished', 'system', v_scn.site_id, v_run.id);
    end if;
  end if;

  insert into private.tick_log (run_id, frames, duration_ms, errors, lag_sim_ms, catchups)
  values (v_run.id, v_frames,
          greatest(0, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int),
          v_errors, v_lag, v_catchups);

  -- event-pipeline §9: hitting the cap with frames still due is an overrun worth saying out loud, once
  -- a minute at most.
  if v_frames >= v_cap and v_next_due_ms is not null then
    perform private.emit_event('system.warning',
      jsonb_build_object('code', 'tick_overrun', 'value', v_lag),
      'sys:tick:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'), 'system', v_scn.site_id, v_run.id);
  end if;

  -- ── broadcasts (api-contracts §7) ──
  v_topic := 'site:' || v_scn.site_id::text;
  perform realtime.send(jsonb_build_object('run_id', v_run.id,
      'status', case when v_finished then 'finished' else v_run.status end,
      'speed', v_run.speed, 'sim_now', v_sim_now, 'server_now', now()),
    'clock', v_topic, true);

  -- `machines` is a DELTA (data-model §7): a machine appears only when it is new to the run, moved more
  -- than 5 m, or changed health or motion since the last broadcast.
  select coalesce(jsonb_agg(jsonb_build_object('machine_id', c.machine_id, 'code', c.code,
           'lat', extensions.ST_Y(c.location::extensions.geometry),
           'lon', extensions.ST_X(c.location::extensions.geometry),
           'moving', c.moving, 'health', c.health)), '[]'::jsonb)
    into v_machines
    from (
      select ms.machine_id, m.code, ms.location, ms.moving, ms.health
        from public.machine_state ms
        join public.machines m on m.id = ms.machine_id
        left join private.machine_broadcast b on b.run_id = ms.run_id and b.machine_id = ms.machine_id
       where ms.run_id = v_run.id and ms.location is not null
         and (b.machine_id is null
              or b.last_health is distinct from ms.health
              or b.last_moving is distinct from ms.moving
              or b.last_location is null
              or extensions.ST_Distance(b.last_location, ms.location) > 5)
    ) c;

  if jsonb_array_length(v_machines) > 0 then
    perform realtime.send(jsonb_build_object('run_id', v_run.id, 'sim_ts', v_sim_now, 'machines', v_machines),
      'machines', v_topic, true);
    insert into private.machine_broadcast (run_id, machine_id, last_location, last_moving, last_health, last_sent_at)
    select ms.run_id, ms.machine_id, ms.location, ms.moving, ms.health, now()
      from public.machine_state ms
     where ms.run_id = v_run.id
       and ms.machine_id in (select (e ->> 'machine_id')::uuid from jsonb_array_elements(v_machines) e)
    on conflict (run_id, machine_id) do update set
      last_location = excluded.last_location, last_moving = excluded.last_moving,
      last_health = excluded.last_health, last_sent_at = excluded.last_sent_at;
  end if;

  return jsonb_build_object('run_id', v_run.id, 'frames', v_frames, 'errors', v_errors,
    'catchups', v_catchups, 'cursor_seq', v_last_seq, 'lag_sim_ms', v_lag, 'sim_now', v_sim_now,
    'broadcast_machines', jsonb_array_length(v_machines), 'finished', v_finished);
end $$;

-- ════ 5. step_loop (B10b fills this in) ═══════════════════════════════════════════════════════════

-- The worker's step 2. B9 ships the step so the procedure's shape is final and the COMMIT boundary is
-- proved; B10b replaces the body with lesson assignment and `build_replay`. It deliberately does NOT
-- touch `private.loop_queue`: marking rows done here would silently throw away the work B10b must do.
create or replace function private.step_loop(p_limit int default 20)
returns int language plpgsql security definer set search_path = '' as $$
begin
  return 0;
end $$;

-- ════ 6. step_requeue: dispatch requeue, housekeeping, size guard ═════════════════════════════════

create or replace function private.step_requeue()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_requeued int := 0; v_last timestamptz; v_size bigint; v_deleted int := 0; r record;
begin
  -- data-model §3.3: a row stuck in `sending` for 30 s with no provider_ref goes back to the outbox.
  -- Rows that already have a provider_ref are NEVER re-sent (G2-10) — `dispatch` polls the provider.
  with due as (
    select d.id from public.dispatches d
     where d.status = 'sending' and d.provider_ref is null and d.attempts < 2
       and d.sending_at < now() - interval '30 seconds'
     order by d.sending_at limit 50
  )
  update public.dispatches d set status = 'queued', attempts = d.attempts + 1
    from due where d.id = due.id;                       -- the update fires the kick trigger (002d)
  get diagnostics v_requeued = row_count;

  select w.last_housekeeping_at into v_last from private.worker_state w where w.id;
  if v_last > now() - interval '1 hour' then
    return jsonb_build_object('requeued', v_requeued, 'housekeeping', false);
  end if;
  update private.worker_state set last_housekeeping_at = now() where id;

  -- retention (data-model §6, §7)
  delete from private.tick_log where started_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  delete from private.tick_errors where at < now() - interval '24 hours';
  delete from private.worker_errors where at < now() - interval '24 hours';
  begin
    delete from cron.job_run_details where end_time < now() - interval '1 hour';
  exception when others then
    insert into private.worker_errors (step, sqlstate, message) values ('housekeeping.cron', sqlstate, left(sqlerrm, 500));
  end;

  -- size guard (G2-15): one warning per site, at most hourly (this block already is).
  select pg_database_size(current_database()) into v_size;
  if v_size > 400 * 1024 * 1024 then
    for r in select s.id from public.sites s loop
      perform private.emit_event('system.warning',
        jsonb_build_object('code', 'db_size_warning', 'value', round(v_size / 1048576.0)),
        'sys:dbsize:' || r.id::text || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24'),
        'system', r.id);
    end loop;
  end if;

  return jsonb_build_object('requeued', v_requeued, 'housekeeping', true,
    'tick_log_deleted', v_deleted, 'db_size_mb', round(v_size / 1048576.0));
end $$;

-- ════ 7. The procedure, and the director's manual tick ════════════════════════════════════════════

-- SECURITY INVOKER, no SET clause, every name schema-qualified, one exception block per step, `commit`
-- OUTSIDE each block (data-model §6, R2-1). Scheduled as exactly `call private.worker_step();`.
create or replace procedure private.worker_step()
language plpgsql as $$
declare v_sec int;
begin
  -- step 1: the ledger drain, ≤ 50 rows under lock 4210001 (released by the COMMIT below)
  begin
    perform private.ledger_drain(50);
  exception when others then
    insert into private.worker_errors (step, sqlstate, message) values ('ledger_drain', sqlstate, left(sqlerrm, 500));
  end;
  commit;

  -- step 2: the Loop queue (N2 — a failing build must not touch the event, the alert or the ledger)
  begin
    perform private.step_loop(20);
  exception when others then
    insert into private.worker_errors (step, sqlstate, message) values ('step_loop', sqlstate, left(sqlerrm, 500));
  end;
  commit;

  -- step 3: the scenario tick
  begin
    perform private.step_tick();
  exception when others then
    insert into private.worker_errors (step, sqlstate, message) values ('step_tick', sqlstate, left(sqlerrm, 500));
  end;
  commit;

  -- step 4: every 5th second, the outbox requeue and housekeeping
  v_sec := extract(second from clock_timestamp())::int;
  if v_sec % 5 = 0 then
    begin
      perform private.step_requeue();
    exception when others then
      insert into private.worker_errors (step, sqlstate, message) values ('step_requeue', sqlstate, left(sqlerrm, 500));
    end;
    commit;
  end if;
end $$;

-- Director command `manual_tick` (api-contracts §6). It is the same function behind the same try-lock
-- 4210002 (N5), so a hand-driven tick and the job can never apply the same frame twice.
create or replace function private.manual_tick()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.step_tick();
end $$;

-- ════ 8. purge_run (data-model §7) ════════════════════════════════════════════════════════════════

-- Rehearsal runs only; the live run and the ledger are never purged (§4.7). `incidents` and
-- `private.ledger_queue` are deliberately absent from every statement below — nothing in the ledger has
-- a foreign key to a purgeable row (re-check #15), which is why this is safe at all.
create or replace function private.purge_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run public.scenario_runs%rowtype; v jsonb := '{}'::jsonb; n int;
        v_ledger_before int; v_ledger_after int;
begin
  select * into v_run from public.scenario_runs r where r.id = p_run_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not v_run.rehearsal then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select count(*) into v_ledger_before from public.incidents i where i.run_id = p_run_id;

  delete from public.replay_attempts ra
    where ra.replay_id in (select rs.id from public.replay_scenarios rs
                           where rs.source_event_id in (select e.id from public.events e where e.run_id = p_run_id));
  get diagnostics n = row_count; v := v || jsonb_build_object('replay_attempts', n);

  delete from public.replay_scenarios rs
    where rs.source_event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('replay_scenarios', n);

  delete from public.lesson_assignments la
    where la.because_event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('lesson_assignments', n);

  delete from private.loop_queue lq
    where lq.event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('loop_queue', n);

  delete from public.dispatches d
    where d.alert_id in (select a.id from public.alerts a where a.run_id = p_run_id)
       or d.subject_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('dispatches', n);

  -- `alerts.origin_event_id → events` and `events.alert_id → alerts` point at each other, so neither
  -- table can go first. Both deletes therefore live in ONE statement: a non-deferrable foreign key is
  -- checked when the whole statement (data-modifying CTEs included) has finished, by which time both
  -- sides are gone. Splitting this in two would fail on whichever half ran first.
  with d_alerts as (delete from public.alerts a where a.run_id = p_run_id returning a.id)
  delete from public.events e where e.run_id = p_run_id;
  get diagnostics n = row_count; v := v || jsonb_build_object('events', n);

  -- B10/B11 tables: they do not exist yet, and purge_run must not wait for them to be written.
  if to_regclass('public.anomalies') is not null then
    execute 'delete from public.anomalies where run_id = $1' using p_run_id;
  end if;
  if to_regclass('private.detector_state') is not null then
    execute 'delete from private.detector_state where run_id = $1' using p_run_id;
  end if;

  delete from public.machine_state where run_id = p_run_id;
  delete from public.operator_state where run_id = p_run_id;
  delete from private.machine_broadcast where run_id = p_run_id;
  delete from public.operator_gps_trail where run_id = p_run_id;
  delete from public.telemetry_readings where run_id = p_run_id;
  get diagnostics n = row_count; v := v || jsonb_build_object('telemetry_readings', n);
  delete from public.weather_snapshots where run_id = p_run_id;
  delete from public.fault_codes where run_id = p_run_id;
  delete from private.tick_errors where run_id = p_run_id;
  delete from private.tick_log where run_id = p_run_id;

  select count(*) into v_ledger_after from public.incidents i where i.run_id = p_run_id;
  if v_ledger_after <> v_ledger_before then
    raise exception 'purge_run touched the ledger (% → %)', v_ledger_before, v_ledger_after using errcode = 'P0001';
  end if;

  return v || jsonb_build_object('run_id', p_run_id, 'incidents_kept', v_ledger_after);
end $$;

-- Director command `purge_rehearsals`: every rehearsal run that is not the current one.
create or replace function private.purge_rehearsals()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_runs int := 0;
begin
  for r in select id from public.scenario_runs where rehearsal and not is_current order by created_at loop
    perform private.purge_run(r.id);
    v_runs := v_runs + 1;
  end loop;
  return jsonb_build_object('runs_purged', v_runs);
end $$;

-- ════ 9. The job, grants, comments ════════════════════════════════════════════════════════════════

-- data-model §6: two 1-second jobs. `sos-escalator` belongs to B12; this is the worker.
-- `cron.schedule` replaces a job of the same name, so re-running this migration is a no-op.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('worker', '1 seconds', 'call private.worker_step();');
  else
    raise warning 'pg_cron is not installed: the worker job was not scheduled';
  end if;
end $$;

-- Nothing in `private` is reachable by `anon` or `authenticated` (001c/001d defaults). The director Edge
-- Function runs as `service_role` and needs exactly these three.
grant execute on function private.manual_tick(), private.purge_run(uuid), private.purge_rehearsals() to service_role;

comment on procedure private.worker_step() is
  'The 1-second pg_cron worker (event-pipeline §0): ledger drain, Loop queue, scenario tick, and every 5th second the dispatch requeue and housekeeping, with a COMMIT between steps. SECURITY INVOKER with no SET clause because PostgreSQL forbids transaction control otherwise (R2-1); each step has its own exception block so one failing step cannot stop the next. Bounded work per step is the guarantee: the role-level statement_timeout backstop is unavailable on this project (postgres is not superuser, B0/D13).';
comment on function private.step_tick() is
  'The worker''s tick step, and the whole of manual_tick. Takes try-lock 4210002 and skips if a director tick holds it; applies at most app_config.max_frames_per_tick due frames; each frame runs in its own exception block, so a poison frame is written to private.tick_errors and skipped with the cursor still advancing past it; writes private.tick_log and broadcasts `clock` and a delta `machines` on site:{site_id}.';
comment on function private.can_call_operator(uuid, uuid) is
  'event-pipeline §2 motion-lock decision table, default deny. Returns {allowed, reason, motion_locked, state}; `reason` uses the suppress_reason vocabulary (motion_lock / state_unknown / call_cooldown) and `state` the MotionLockChanged vocabulary (moving / parked / on_foot / state_unknown). Staleness is measured on updated_at (wall), never on ts (simulated).';
comment on function private.detect_frame(uuid, public.scenario_frames, timestamptz, boolean) is
  'Detector hook, a no-op in B9. B10 (pure rules + apply_findings) and B11 (EWMA + Guardian) replace the body. It is called inside step_tick''s per-frame exception block, so a raising detector costs one tick_errors row, not the tick.';
comment on function private.step_loop(int) is
  'The worker''s Loop step, a no-op in B9: B10b fills it in. It must never mark private.loop_queue rows done — that would discard the work silently (N2).';
comment on function private.purge_run(uuid) is
  'Deletes a REHEARSAL run''s data in the order of data-model §7 and asserts afterwards that the ledger is untouched. alerts and events are deleted in one statement because their foreign keys point at each other.';
comment on table private.worker_errors is
  'One row per worker step that raised. A failing step is as visible as a poison frame; demo-check (B21) reads this next to private.tick_errors.';
comment on table private.machine_broadcast is
  'What the last `machines` broadcast carried, so the next one can be a delta (> 5 m moved, or a health/motion change). Keeps Realtime inside the free-plan message budget (data-model §7).';
