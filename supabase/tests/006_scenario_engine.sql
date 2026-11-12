-- B9: the scenario engine. Frame application per kind, task progress from load cycles, the motion lock
-- and `nearest`, due-frame selection, the catch-up rule at 1× / 10× / 60× and after a jump, the poison
-- frame, the frame cap, the `clock` and delta `machines` broadcasts, tick_log, the dispatch requeue and
-- `purge_run`. Runs inside begin … rollback, and calls the STEP FUNCTIONS only — `private.worker_step`
-- COMMITs and therefore cannot run here (R2-1); its shape is asserted from the catalog instead.
--
-- Determinism: `now()` is the transaction's start time and does not move inside this transaction, so
-- with `wall_anchor = now()` the engine's `sim_now` is exactly `sim_anchor`. Every offset below is
-- therefore an exact number of simulated milliseconds, not an approximation.

-- The live `worker` job takes try-lock 4210002 for a few milliseconds every second. Only the FIRST tick
-- here can collide with it (afterwards this transaction holds the lock), so retry that one.
create or replace function pg_temp.tick() returns jsonb language plpgsql as $$
declare r jsonb; i int := 0;
begin
  loop
    r := private.step_tick();
    exit when coalesce(r ->> 'reason', '') <> 'locked';
    i := i + 1;
    if i > 100 then raise exception 'step_tick stayed locked: the worker job is holding 4210002'; end if;
    perform pg_sleep(0.05);
  end loop;
  return r;
end $$;

-- ── 1. Fixtures ──────────────────────────────────────────────────────────────────────────────────
create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t values
  ('site', gen_random_uuid()), ('op_ravi', gen_random_uuid()), ('op_other', gen_random_uuid()),
  ('u_ravi', gen_random_uuid()), ('exc', gen_random_uuid()), ('doz', gen_random_uuid()),
  ('scenario', gen_random_uuid()), ('run', gen_random_uuid()), ('task', gen_random_uuid()),
  ('alert_a', gen_random_uuid()), ('alert_b', gen_random_uuid());
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;

-- the simulated shift start, and the one place every offset below is measured from
create temp table s (shift_start timestamptz not null) on commit drop;
insert into s values (date_trunc('second', now()) - interval '3 hours');
create or replace function pg_temp.s() returns timestamptz language sql as $$ select shift_start from s $$;
create or replace function pg_temp.sim(bigint) returns timestamptz language sql as $$
  select pg_temp.s() + make_interval(secs => $1 / 1000.0) $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('u_ravi'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'b9ravi@sqltest.local', '', now(), '{}', '{}', now(), now());
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site'), 'SQLTESB9', 'sqltest B9 quarry', 'quarry',
   extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op_ravi'), 'OP-B901', 'Ravi (B9)', 'novice', pg_temp.id('site'), 'Operator-B91'),
  (pg_temp.id('op_other'), 'OP-B902', 'Other (B9)', 'expert', pg_temp.id('site'), 'Operator-B92');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_ravi'), 'operator', pg_temp.id('op_ravi'), pg_temp.id('site'), 'Ravi');
insert into public.machines (id, code, home_site_id) values
  (pg_temp.id('exc'), 'EXC-B91', pg_temp.id('site')),
  (pg_temp.id('doz'), 'DOZ-B91', pg_temp.id('site'));
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version) values
  (pg_temp.id('scenario'), 'sqltest-b9', 9, pg_temp.id('site'), pg_temp.s(), interval '8 hours', 'test');

update public.scenario_runs set is_current = false where is_current;   -- only one current run may exist
insert into public.scenario_runs (id, scenario_id, status, speed, sim_anchor, wall_anchor, cursor_seq, is_current, rehearsal)
values (pg_temp.id('run'), pg_temp.id('scenario'), 'playing', 1, pg_temp.sim(20000), now(), 0, true, true);
insert into public.operator_pairings (run_id, operator_id, machine_id) values
  (pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('exc'));
insert into public.tasks (id, run_id, operator_id, machine_id, site_id, task_type, planned_start, status,
  planned_cycles, cycles_at_start, started_at)
values (pg_temp.id('task'), pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('exc'), pg_temp.id('site'),
  'excavation', pg_temp.sim(0), 'in_progress', 120, 18, now());

-- Frames: raw sensor values only (no events, no labels). Offsets 16000-20000 sit inside the 1× catch-up
-- threshold of 5 000 ms, so this first tick must report zero catch-ups.
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, operator_id, payload) values
  (pg_temp.id('scenario'),  1, 16000, 'weather', null, null,
   '{"temperature_c": 38.5, "wind_kmh": 12.0, "humidity_pct": 44, "wbgt_c": 31.2, "forecast_peak_c": 44.0}'),
  (pg_temp.id('scenario'),  2, 16500, 'operator_state', pg_temp.id('exc'), pg_temp.id('op_ravi'),
   '{"on_foot": false, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'),  3, 17000, 'ppe', null, pg_temp.id('op_ravi'),
   '{"helmet": true, "vest": false, "boots": true}'),
  (pg_temp.id('scenario'),  4, 17500, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 6.2, "seatbelt_fastened": false, "pitch_deg": 17.4, "roll_deg": 2.0, "load_cycles": 30, "engine_hours": 4120.5, "fuel_used_l": 31.2, "idle_hours": 0.4, "hydraulic_temp_c": 71.0, "coolant_temp_c": 88.0, "parking_brake": false, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'),  5, 18000, 'gps', null, pg_temp.id('op_ravi'),
   '{"lat": 21.14631, "lon": 79.08821, "speed_kmh": 0.0, "accuracy_m": 4.0}'),
  (pg_temp.id('scenario'),  6, 18500, 'fault', pg_temp.id('exc'), null,
   '{"code_type": "j1939_spn_fmi", "spn": 110, "fmi": 16, "severity": "derate", "description_key": "fault.coolant_high", "active": true}'),
  (pg_temp.id('scenario'),  7, 19000, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 6.2, "seatbelt_fastened": false, "pitch_deg": 17.4, "load_cycles": 42, "parking_brake": false, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'),  8, 19500, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 0.0, "seatbelt_fastened": true, "pitch_deg": 2.0, "load_cycles": 42, "parking_brake": true, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'),  9, 19800, 'telemetry', pg_temp.id('doz'), null,
   '{"speed_kmh": 0.0, "load_cycles": 5, "parking_brake": true, "lat": 21.14700, "lon": 79.08820}'),
  (pg_temp.id('scenario'), 10, 20000, 'gps', null, pg_temp.id('op_ravi'),
   '{"lat": 21.14631, "lon": 79.08821, "speed_kmh": 0.0, "accuracy_m": 4.0}'),
  (pg_temp.id('scenario'), 11, 60000, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 1.0}'),
  -- section 4: the poison frame and the frames behind it
  (pg_temp.id('scenario'), 12, 20500, 'telemetry', null, null, '{"speed_kmh": 3.0}'),
  (pg_temp.id('scenario'), 13, 20800, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 0.0, "load_cycles": 60, "parking_brake": true, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'), 14, 20900, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 0.0, "load_cycles": 60, "parking_brake": true, "lat": 21.1473, "lon": 79.0882}'),
  -- section 5: the catch-up rule, one "late" and one "on time" frame per speed
  (pg_temp.id('scenario'), 101,  980000, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 0.0}'),
  (pg_temp.id('scenario'), 102, 1000000, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 0.0}'),
  (pg_temp.id('scenario'), 103, 1980000, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 0.0}'),
  (pg_temp.id('scenario'), 104, 1900000, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 0.0}'),
  (pg_temp.id('scenario'), 105, 2800000, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 0.0}'),
  (pg_temp.id('scenario'), 106, 2600000, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 0.0}'),
  (pg_temp.id('scenario'), 107, 2999000, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 0.0}'),
  (pg_temp.id('scenario'), 108, 3000500, 'telemetry', pg_temp.id('exc'), null, '{"speed_kmh": 0.0}');

-- ── 2. The first tick: due frames only, every kind applied ───────────────────────────────────────
do $$
declare r jsonb;
begin
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 10, 'ten due frames, got ' || r::text;
  assert (r ->> 'errors')::int = 0, 'no errors on the first tick: ' || r::text;
  assert (r ->> 'catchups')::int = 0, 'an on-time tick reports zero catch-ups: ' || r::text;
  assert (r ->> 'cursor_seq')::int = 10, 'the cursor stops at the last due frame';
  assert (r ->> 'lag_sim_ms')::bigint = 0, 'nothing due is left behind';
  assert not (r ->> 'finished')::boolean, 'frames remain, so the run is not finished';
  assert (select cursor_seq from public.scenario_runs where id = pg_temp.id('run')) = 10, 'the cursor is persisted';
  -- frame 11 is 40 s of sim in the future and must not have been touched
  assert not exists (select 1 from public.telemetry_readings where run_id = pg_temp.id('run') and frame_seq = 11),
    'a frame that is not due yet is never applied';
end $$;

-- what each kind wrote
do $$
declare ms public.machine_state%rowtype; os public.operator_state%rowtype;
begin
  assert (select count(*) from public.telemetry_readings where run_id = pg_temp.id('run')) = 4, 'four telemetry rows';
  assert (select seatbelt_fastened from public.telemetry_readings where run_id = pg_temp.id('run') and frame_seq = 4) = false,
    'the organiser field round-trips';
  assert (select operator_id from public.telemetry_readings where run_id = pg_temp.id('run') and frame_seq = 4) = pg_temp.id('op_ravi'),
    'the reading is attributed to the paired operator';
  assert (select count(*) from public.operator_gps_trail where run_id = pg_temp.id('run')) = 2, 'two gps points';
  assert (select count(*) from public.weather_snapshots where run_id = pg_temp.id('run')) = 1, 'one weather snapshot';
  assert (select wbgt_c from public.weather_snapshots where run_id = pg_temp.id('run')) = 31.2, 'WBGT stored';
  assert (select count(*) from public.fault_codes where run_id = pg_temp.id('run')) = 1, 'one fault code';

  select * into ms from public.machine_state where run_id = pg_temp.id('run') and machine_id = pg_temp.id('exc');
  assert ms.ts = pg_temp.sim(19500), 'machine_state carries the SIMULATED timestamp of its last frame';
  assert ms.moving = false and ms.parking_brake, 'the last telemetry frame wins';
  assert ms.load_cycles = 42, 'load cycles tracked';
  assert ms.health = 'fault', 'a derate fault marks the machine';
  assert ms.operator_id = pg_temp.id('op_ravi'), 'the cab occupant comes from the pairing';

  select * into os from public.operator_state where run_id = pg_temp.id('run') and operator_id = pg_temp.id('op_ravi');
  assert os.on_foot = false and os.in_cab_machine_id = pg_temp.id('exc'), 'operator_state frame applied';
  assert os.ppe = '{"helmet": true, "vest": false, "boots": true}'::jsonb, 'the ppe frame merged into ppe';
  assert os.location is not null, 'the gps frame set a position';
end $$;

-- task progress comes from load cycles, and the event only fires on a 10 % step (UI-1, G2-14)
do $$
begin
  assert (select progress_pct from public.tasks where id = pg_temp.id('task')) = 20.00,
    'progress = (42 − 18) / 120 = 20 %, got ' || (select progress_pct from public.tasks where id = pg_temp.id('task'))::text;
  assert (select count(*) from public.events where type = 'task.progress' and task_id = pg_temp.id('task')) = 2,
    'one event per 10 % step, not one per frame';
  assert (select payload ->> 'progress_pct' from public.events where type = 'task.progress'
            and task_id = pg_temp.id('task') order by seq desc limit 1) = '20.00', 'the event carries the percentage';
end $$;

-- ── 3. Motion lock and nearest (event-pipeline §2, UI-5, UI-6) ───────────────────────────────────
do $$
declare d jsonb; n jsonb;
begin
  -- after frame 8 the machine is stopped with the brake on → reachable
  d := private.can_call_operator(pg_temp.id('run'), pg_temp.id('op_ravi'));
  assert (d ->> 'state') = 'parked' and (d ->> 'allowed')::boolean and not (d ->> 'motion_locked')::boolean,
    'parked in the cab is reachable: ' || d::text;
  assert (select call_allowed and not motion_locked from public.operator_state
          where run_id = pg_temp.id('run') and operator_id = pg_temp.id('op_ravi')),
    'operator_state agrees with the predicate (UI-5: they can never disagree)';
  -- the lock flipped during the tick (unknown → moving → parked), so exactly one change event
  assert (select count(*) from public.events where type = 'operator.motion_lock_changed'
            and operator_id = pg_temp.id('op_ravi')) = 1, 'one motion-lock change, not one per frame';

  -- moving
  update public.machine_state set speed_kmh = 6.2, moving = true, parking_brake = false
   where run_id = pg_temp.id('run') and machine_id = pg_temp.id('exc');
  d := private.can_call_operator(pg_temp.id('run'), pg_temp.id('op_ravi'));
  assert (d ->> 'state') = 'moving' and not (d ->> 'allowed')::boolean and (d ->> 'reason') = 'motion_lock'
     and (d ->> 'motion_locked')::boolean, 'a moving cab denies the call: ' || d::text;

  -- on foot
  update public.operator_state set on_foot = true, in_cab_machine_id = null
   where run_id = pg_temp.id('run') and operator_id = pg_temp.id('op_ravi');
  d := private.can_call_operator(pg_temp.id('run'), pg_temp.id('op_ravi'));
  assert (d ->> 'state') = 'on_foot' and (d ->> 'allowed')::boolean, 'on foot is always reachable: ' || d::text;

  -- neither on foot nor in a cab → default deny
  update public.operator_state set on_foot = null, in_cab_machine_id = null
   where run_id = pg_temp.id('run') and operator_id = pg_temp.id('op_ravi');
  d := private.can_call_operator(pg_temp.id('run'), pg_temp.id('op_ravi'));
  assert (d ->> 'state') = 'state_unknown' and not (d ->> 'allowed')::boolean, 'default is deny: ' || d::text;

  -- stale state (measured on WALL time, never on the simulated ts)
  update public.operator_state set on_foot = true, updated_at = now() - interval '30 seconds'
   where run_id = pg_temp.id('run') and operator_id = pg_temp.id('op_ravi');
  d := private.can_call_operator(pg_temp.id('run'), pg_temp.id('op_ravi'));
  assert (d ->> 'reason') = 'state_unknown' and (d ->> 'motion_locked')::boolean,
    'state older than state_stale_s is unknown: ' || d::text;

  -- no row at all
  d := private.can_call_operator(pg_temp.id('run'), pg_temp.id('op_other'));
  assert (d ->> 'reason') = 'state_unknown' and not (d ->> 'allowed')::boolean, 'a missing state denies';

  -- call cooldown: a voice call to this operator less than 60 s ago
  update public.operator_state set on_foot = true, updated_at = now()
   where run_id = pg_temp.id('run') and operator_id = pg_temp.id('op_ravi');
  insert into public.alerts (id, run_id, kind, hazard_key, tier, operator_id, machine_id, site_id, needs_ack)
  values (pg_temp.id('alert_a'), pg_temp.id('run'), 'guardian_hazard',
          'guardian:' || pg_temp.id('op_ravi') || ':EXC-B91', 'critical', pg_temp.id('op_ravi'),
          pg_temp.id('exc'), pg_temp.id('site'), true);
  insert into public.dispatches (alert_id, site_id, purpose, channel, recipient_ref, recipient_role, status, escalation_level)
  values (pg_temp.id('alert_a'), pg_temp.id('site'), 'alert', 'twilio_voice', 'DEMO_OPERATOR_PHONE', 'operator', 'sent', 1);
  d := private.can_call_operator(pg_temp.id('run'), pg_temp.id('op_ravi'));
  assert (d ->> 'reason') = 'call_cooldown' and not (d ->> 'allowed')::boolean, 'one call per 60 s: ' || d::text;
  assert not (d ->> 'motion_locked')::boolean, 'a cooldown is not a motion lock (it must not blank the cockpit)';

  -- nearest: the dozer ≈ 80 m away; his own cab is never his own hazard
  update public.operator_state set on_foot = false, in_cab_machine_id = pg_temp.id('exc')
   where run_id = pg_temp.id('run') and operator_id = pg_temp.id('op_ravi');
  n := private.operator_nearest(pg_temp.id('run'), pg_temp.id('op_ravi'));
  assert n ->> 'kind' = 'machine' and (n ->> 'id')::uuid = pg_temp.id('doz'), 'nearest is the other machine: ' || coalesce(n::text, 'null');
  assert (n ->> 'distance_m')::numeric between 60 and 100, 'about 80 m, got ' || (n ->> 'distance_m');
  assert n ->> 'zone' = 'awareness', '80 m is outside both rings';
  -- walk HIM towards the dozer (moving the machine instead would land in the next `machines` delta and
  -- quietly invalidate the delta assertions below)
  update public.operator_state set location = extensions.ST_SetSRID(extensions.ST_MakePoint(79.08820, 21.146930), 4326)::extensions.geography
   where run_id = pg_temp.id('run') and operator_id = pg_temp.id('op_ravi');
  n := private.operator_nearest(pg_temp.id('run'), pg_temp.id('op_ravi'));
  assert n ->> 'zone' = 'danger', 'inside danger_radius_m the ring is danger: ' || n::text;
  assert (n ->> 'distance_m')::numeric < 15, 'under the danger radius: ' || n::text;
end $$;

-- ── 4. A poison frame is logged and skipped; the frames behind it still land (G2-1) ──────────────
do $$
declare r jsonb;
begin
  update public.scenario_runs set sim_anchor = pg_temp.sim(20800), wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 2, 'two frames attempted: ' || r::text;
  assert (r ->> 'errors')::int = 1, 'the poison frame raised: ' || r::text;
  assert (r ->> 'cursor_seq')::int = 13, 'the cursor advanced PAST the poison frame';
  assert (select count(*) from private.tick_errors where run_id = pg_temp.id('run') and frame_seq = 12) = 1,
    'the poison frame is in tick_errors';
  assert (select message from private.tick_errors where run_id = pg_temp.id('run') and frame_seq = 12) like '%needs a machine%',
    'with the reason it failed for';
  assert not exists (select 1 from public.telemetry_readings where run_id = pg_temp.id('run') and frame_seq = 12),
    'nothing of the poison frame was committed';
  assert exists (select 1 from public.telemetry_readings where run_id = pg_temp.id('run') and frame_seq = 13),
    'the frame behind it applied normally';
  assert (select progress_pct from public.tasks where id = pg_temp.id('task')) = 35.00, 'progress kept moving';
  -- the machine did not move and did not change health: nothing to broadcast
  assert (r ->> 'broadcast_machines')::int = 0, 'a delta with no change is not sent: ' || r::text;
end $$;

-- a machine that moved more than 5 m is in the next delta
do $$
declare r jsonb;
begin
  update public.scenario_runs set sim_anchor = pg_temp.sim(20900), wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 1 and (r ->> 'errors')::int = 0, 'one clean frame: ' || r::text;
  assert (r ->> 'broadcast_machines')::int = 1, 'the machine that moved is in the delta: ' || r::text;
  assert (select count(*) from private.machine_broadcast where run_id = pg_temp.id('run')) = 2,
    'both machines have a broadcast watermark';
end $$;

-- ── 5. Catch-up applies only on a jump or a real stall, scaled by speed (G2-5, EP §0) ────────────
do $$
declare r jsonb;
begin
  -- 1×: threshold 5 s of sim. Frame 101 is 20 s late → catch-up; frame 102 is on time.
  update public.scenario_runs set speed = 1, cursor_seq = 100, sim_anchor = pg_temp.sim(1000000),
         wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 2 and (r ->> 'catchups')::int = 1, '1×: one late frame of two: ' || r::text;

  -- 10×: threshold 50 s of sim. Frame 103 is 20 s late (NOT catch-up), frame 104 is 100 s late.
  update public.scenario_runs set speed = 10, cursor_seq = 102, sim_anchor = pg_temp.sim(2000000),
         wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 2 and (r ->> 'catchups')::int = 1,
    '10×: 20 s late is normal at ten times speed: ' || r::text;

  -- 60×: threshold 300 s of sim. Frame 105 is 200 s late and still normal — this is exactly why a 1 s
  -- tick at 60× (60 s of sim per tick) never suppresses an alert. Frame 106 is 400 s late.
  update public.scenario_runs set speed = 60, cursor_seq = 104, sim_anchor = pg_temp.sim(3000000),
         wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 3 and (r ->> 'catchups')::int = 1,
    '60×: only the 400 s-late frame is catch-up: ' || r::text;

  -- a jump marks its frames as catch-up however fresh they are, then clears itself
  update public.scenario_runs set cursor_seq = 107, catchup_until_seq = 108, sim_anchor = pg_temp.sim(3001000),
         wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 1 and (r ->> 'catchups')::int = 1, 'a jumped-over frame is catch-up: ' || r::text;
  assert (select catchup_until_seq from public.scenario_runs where id = pg_temp.id('run')) is null,
    'catchup_until_seq clears once the cursor passes it';
  assert (r ->> 'finished')::boolean, 'frame 108 is the last one: the run finishes';
  assert (select status from public.scenario_runs where id = pg_temp.id('run')) = 'finished', 'status finished';
  assert (select count(*) from public.events where type = 'scenario.finished' and run_id = pg_temp.id('run')) = 1,
    'one scenario.finished event';
end $$;

-- ── 6. A tick with nothing to do, and the frame cap ──────────────────────────────────────────────
do $$
declare r jsonb; v_before int;
begin
  update public.scenario_runs set status = 'playing' where id = pg_temp.id('run');
  select count(*)::int into v_before from private.tick_log where run_id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 0 and (r ->> 'errors')::int = 0, 'a second tick applies nothing: ' || r::text;
  assert (select count(*)::int from private.tick_log where run_id = pg_temp.id('run')) = v_before + 1,
    'every tick writes exactly one tick_log row';

  -- the cap: 8 frames are due, the cap is 2
  update public.app_config set max_frames_per_tick = 2 where id;
  update public.scenario_runs set speed = 1, cursor_seq = 100, sim_anchor = pg_temp.sim(3000000),
         wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 2, 'the cap bounds the tick: ' || r::text;
  assert (r ->> 'lag_sim_ms')::bigint > 0, 'the remaining frames show up as lag';
  assert (select count(*) from public.events where type = 'system.warning'
            and payload ->> 'code' = 'tick_overrun') = 1, 'an overrun is said out loud once';
  update public.app_config set max_frames_per_tick = 200 where id;

  -- a run that is not playing is never ticked
  update public.scenario_runs set status = 'paused' where id = pg_temp.id('run');
  r := private.step_tick();
  assert (r ->> 'reason') = 'no_playing_run', 'a paused run is not ticked: ' || r::text;
  update public.scenario_runs set status = 'playing' where id = pg_temp.id('run');
end $$;

-- tick_log carries what B11 measures
do $$
declare l private.tick_log%rowtype;
begin
  select * into l from private.tick_log where run_id = pg_temp.id('run') order by id limit 1;
  assert l.frames = 10 and l.errors = 0 and l.catchups = 0, 'the first tick_log row matches the first tick';
  assert l.duration_ms >= 0, 'duration is measured';
  assert exists (select 1 from private.tick_log where run_id = pg_temp.id('run') and errors = 1),
    'the poison tick is in the log with its error count';
end $$;

-- ── 7. Broadcasts: `clock` every tick, `machines` as a delta (api-contracts §7) ───────────────────
do $$
declare v_topic text := 'site:' || pg_temp.id('site')::text; m jsonb;
begin
  -- realtime.send writes into a daily partition the Realtime service creates when a client connects.
  -- Without TODAY's partition it logs a warning and drops the row, so probe for it rather than assume:
  -- a partition for last week would make the guard lie.
  perform realtime.send('{"probe": true}'::jsonb, 'probe', 'site:b9probe', true);
  if not exists (select 1 from realtime.messages where event = 'probe' and topic = 'site:b9probe') then
    raise warning 'realtime.messages has no partition for today: broadcast assertions SKIPPED (run scripts/b0/realtime-wake.ts)';
    return;
  end if;
  assert exists (select 1 from realtime.messages where extension = 'broadcast' and topic = v_topic
                   and event = 'clock' and payload ->> 'run_id' = pg_temp.id('run')::text),
    'the clock is broadcast on the site topic';
  assert exists (select 1 from realtime.messages where extension = 'broadcast' and event = 'clock'
                   and payload ? 'server_now' and payload ? 'sim_now' and payload ? 'speed'),
    'the clock carries server_now for the UI countdowns (UI-4)';
  select payload into m from realtime.messages where extension = 'broadcast' and event = 'machines'
     and payload ->> 'run_id' = pg_temp.id('run')::text order by inserted_at limit 1;
  assert m is not null, 'the machines delta is broadcast';
  assert jsonb_array_length(m -> 'machines') >= 1, 'it carries machines';
  assert (m -> 'machines' -> 0) ? 'lat' and (m -> 'machines' -> 0) ? 'code' and (m -> 'machines' -> 0) ? 'health',
    'each entry has the MachineDelta fields';
end $$;

-- ── 8. step_loop (B10b) drains a queue row: it is marked done or errored, never silently left ─────
do $$
declare v_event uuid; v_n int;
begin
  select e.id into v_event from public.events e where e.run_id = pg_temp.id('run') limit 1;
  insert into private.loop_queue (event_id) values (v_event) on conflict (event_id) do nothing;
  v_n := private.step_loop(20);
  assert v_n >= 1, 'step_loop handled the queue row';
  assert (select done_at is not null or error is not null from private.loop_queue where event_id = v_event),
    'the row is marked done or errored (the full builder tests are 010_replay.sql)';
  assert (select count(*) from public.events where id = v_event) = 1, 'and the event is untouched';
end $$;

-- ── 9. step_requeue: the outbox, not the provider (data-model §3.3, G2-10) ───────────────────────
do $$
declare r jsonb;
begin
  -- B10: the engine now raises the real breach alert for this machine, so the fixture gets its own hazard_key
  insert into public.alerts (id, run_id, kind, hazard_key, tier, operator_id, site_id, needs_ack)
  values (pg_temp.id('alert_b'), pg_temp.id('run'), 'seatbelt_off_moving',
          'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-B91:fixture', 'warning', pg_temp.id('op_ravi'), pg_temp.id('site'), true);
  insert into public.dispatches (alert_id, site_id, purpose, channel, recipient_ref, recipient_role,
    status, attempts, sending_at, escalation_level, provider_ref) values
    (pg_temp.id('alert_b'), pg_temp.id('site'), 'alert', 'telegram', 'TELEGRAM_SUPERVISOR_CHAT_ID', 'fleet_manager', 'sending', 0, now() - interval '60 seconds', 1, null),
    (pg_temp.id('alert_b'), pg_temp.id('site'), 'escalation', 'telegram', 'TELEGRAM_SUPERVISOR_CHAT_ID', 'fleet_manager', 'sending', 0, now() - interval '60 seconds', 2, 'msg-123'),
    (pg_temp.id('alert_b'), pg_temp.id('site'), 'reminder', 'telegram', 'TELEGRAM_SUPERVISOR_CHAT_ID', 'fleet_manager', 'sending', 2, now() - interval '60 seconds', 3, null),
    (pg_temp.id('alert_b'), pg_temp.id('site'), 'flood_summary', 'telegram', 'TELEGRAM_SUPERVISOR_CHAT_ID', 'fleet_manager', 'sending', 0, now(), 4, null);
  r := private.step_requeue();
  assert (r ->> 'requeued')::int = 1, 'exactly one row is due for a requeue: ' || r::text;
  assert (select attempts from public.dispatches where alert_id = pg_temp.id('alert_b') and escalation_level = 1) = 1,
    'attempts is a counter on the same row, never a new row';
  assert (select status from public.dispatches where alert_id = pg_temp.id('alert_b') and escalation_level = 2) = 'sending',
    'a row with a provider_ref is NEVER re-sent (G2-10): dispatch polls the provider instead';
  assert (select status from public.dispatches where alert_id = pg_temp.id('alert_b') and escalation_level = 3) = 'sending',
    'two attempts is the ceiling';
  assert (select status from public.dispatches where alert_id = pg_temp.id('alert_b') and escalation_level = 4) = 'sending',
    'a row that only just started sending is left alone';
  -- the requeue flips status, which fires the kick (002d): still no credential in the public pg_net queue
  assert not exists (select 1 from net.http_request_queue q
                     where q.url like '%/dispatch' and (q.headers ? 'apikey' or q.headers ? 'Authorization')),
    'the requeue kick carries no credential';
end $$;

-- ── 10. purge_run (data-model §7): the run's data goes, the ledger stays ─────────────────────────
do $$
declare v_event public.events; v_incidents_before int; v_queue_before int; res jsonb;
begin
  -- an event that points at an alert, and an alert that points back at an event: purge must cope with
  -- the foreign-key cycle, which is the whole reason the two deletes share one statement.
  v_event := private.emit_event('sos.raised',
    ('{"alert_id": "' || pg_temp.id('alert_a') || '", "lat": 21.1463, "lon": 79.0882, "abuse_suspected": false}')::jsonb,
    'sos:b9purge:1', 'user', pg_temp.id('site'), pg_temp.id('run'), pg_temp.id('exc'), pg_temp.id('op_ravi'),
    null::uuid, pg_temp.id('alert_a'));
  update public.alerts set origin_event_id = v_event.id where id = pg_temp.id('alert_a');
  perform private.ledger_drain();     -- the SOS becomes a ledger entry for this run
  select count(*)::int into v_incidents_before from public.incidents where run_id = pg_temp.id('run');
  select count(*)::int into v_queue_before from private.ledger_queue;
  assert v_incidents_before >= 1, 'the run has a ledger entry to protect';

  -- a live run is never purged
  update public.scenario_runs set rehearsal = false where id = pg_temp.id('run');
  begin
    perform private.purge_run(pg_temp.id('run'));
    raise exception 'the live run was purged';
  exception when raise_exception then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  update public.scenario_runs set rehearsal = true where id = pg_temp.id('run');

  res := private.purge_run(pg_temp.id('run'));
  assert (res ->> 'events')::int > 0, 'events were purged: ' || res::text;
  assert (select count(*) from public.events where run_id = pg_temp.id('run')) = 0, 'no events left';
  assert (select count(*) from public.alerts where run_id = pg_temp.id('run')) = 0, 'no alerts left';
  assert (select count(*) from public.dispatches where alert_id in (pg_temp.id('alert_a'), pg_temp.id('alert_b'))) = 0, 'no dispatches left';
  assert (select count(*) from public.telemetry_readings where run_id = pg_temp.id('run')) = 0, 'no telemetry left';
  assert (select count(*) from public.operator_gps_trail where run_id = pg_temp.id('run')) = 0, 'no trail left';
  assert (select count(*) from public.machine_state where run_id = pg_temp.id('run')) = 0, 'no machine state left';
  assert (select count(*) from public.operator_state where run_id = pg_temp.id('run')) = 0, 'no operator state left';
  assert (select count(*) from private.machine_broadcast where run_id = pg_temp.id('run')) = 0, 'no broadcast watermarks left';
  assert (select count(*) from private.tick_log where run_id = pg_temp.id('run')) = 0, 'no tick log left';
  assert (select count(*) from private.tick_errors where run_id = pg_temp.id('run')) = 0, 'no tick errors left';
  -- the point of the whole exercise
  assert (select count(*)::int from public.incidents where run_id = pg_temp.id('run')) = v_incidents_before,
    'THE LEDGER IS NEVER PURGED (data-model §4.7)';
  assert (select count(*)::int from private.ledger_queue) = v_queue_before, 'and neither is its queue';
  assert (res ->> 'incidents_kept')::int = v_incidents_before, 'purge_run says so itself';
  -- the run row survives, so the console keeps its history
  assert exists (select 1 from public.scenario_runs where id = pg_temp.id('run')), 'the run row stays';
end $$;

-- ── 11. The procedure's shape, the job and the privileges (R2-1, data-model §6, §0) ──────────────
do $$
declare p pg_proc%rowtype;
begin
  select * into p from pg_proc where oid = 'private.worker_step()'::regprocedure;
  assert p.prokind = 'p', 'worker_step is a PROCEDURE (only a procedure may COMMIT)';
  assert not p.prosecdef, 'SECURITY INVOKER: a security-definer procedure may not COMMIT (R2-1)';
  assert p.proconfig is null, 'no SET clause: a procedure that has one may not COMMIT either (R2-1)';
  assert p.prosrc like '%commit;%', 'it commits between steps';
  assert (select count(*) from regexp_matches(p.prosrc, '\mcommit;', 'g')) = 4, 'one commit per step';

  -- the step functions it calls are the ones the tests above exercised
  assert (select prosecdef from pg_proc where oid = 'private.step_tick()'::regprocedure), 'step_tick is security definer';
  assert (select proconfig from pg_proc where oid = 'private.step_tick()'::regprocedure) @> array['search_path=""'],
    'and pins its search_path to nothing';

  -- data-model §6: the job command must be exactly `call …;` (a multi-statement command is one implicit
  -- transaction, in which COMMIT fails)
  assert exists (select 1 from cron.job where jobname = 'worker' and schedule = '1 seconds'
                   and command = 'call private.worker_step();' and active),
    'the worker job is scheduled as a bare CALL every second';

  -- nothing in `private` is reachable by a client role
  assert not has_function_privilege('authenticated', 'private.step_tick()', 'EXECUTE'), 'step_tick is closed to clients';
  assert not has_function_privilege('authenticated', 'private.manual_tick()', 'EXECUTE'), 'manual_tick is closed to clients';
  assert not has_function_privilege('anon', 'private.purge_run(uuid)', 'EXECUTE'), 'purge_run is closed to anon';
  assert has_function_privilege('service_role', 'private.manual_tick()', 'EXECUTE'), 'the director may tick by hand';
  assert has_function_privilege('service_role', 'private.purge_run(uuid)', 'EXECUTE'), 'and may purge rehearsals';
end $$;
