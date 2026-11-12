-- B10 review fixes (migration 005b): one breach = one event across a tier rise, catch-up → live, §2.10 scoping,
-- rule_state rebuild, older-frame guard, config thresholds, narrowed operator_pairings.
-- Step functions only; rolled back; no dispatch can be created.

create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t select k, gen_random_uuid() from unnest(array['site1','site2','op_ravi','op_other','u_ravi','u_other','u_fm1','u_fm2','u_tr1',
  'model','ma','mb','mc','md','mg','scenario','run']) k;
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;
grant execute on function pg_temp.id(text) to authenticated;
create temp table s (shift_start timestamptz not null) on commit drop;
insert into s values (date_trunc('second', now()) - interval '10 hours');
create or replace function pg_temp.sim(bigint) returns timestamptz language sql as $$
  select (select shift_start from s) + make_interval(secs => $1 / 1000.0) $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(k), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', k || '@b10r.local', '', now(), '{}', '{}', now(), now()
  from unnest(array['u_ravi','u_other','u_fm1','u_fm2','u_tr1']) k;
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site1'), 'SQLB10R1', 'b10r site 1', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography),
  (pg_temp.id('site2'), 'SQLB10R2', 'b10r site 2', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(80.0882, 22.1463), 4326)::extensions.geography);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op_ravi'), 'OP-B10R1', 'Ravi R', 'novice', pg_temp.id('site1'), 'Operator-R1'),
  (pg_temp.id('op_other'), 'OP-B10R2', 'Other R', 'expert', pg_temp.id('site1'), 'Operator-R2');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_ravi'), 'operator', pg_temp.id('op_ravi'), pg_temp.id('site1'), 'Ravi'),
  (pg_temp.id('u_other'), 'operator', pg_temp.id('op_other'), pg_temp.id('site1'), 'Other'),
  (pg_temp.id('u_fm1'), 'fleet_manager', null, pg_temp.id('site1'), 'FM1'),
  (pg_temp.id('u_fm2'), 'fleet_manager', null, pg_temp.id('site2'), 'FM2'),
  (pg_temp.id('u_tr1'), 'trainer', null, pg_temp.id('site1'), 'TR1');
insert into public.machine_models (id, code, name, machine_type, idle_fuel_lph, baseline_idle_pct) values
  (pg_temp.id('model'), 'SQLTEST-B10R', 'b10r model', 'excavator', 28, 25);
insert into public.machines (id, code, model_id, home_site_id)
  select pg_temp.id(k), upper(substr(k, 2)) || '-B10R', pg_temp.id('model'), pg_temp.id('site1') from unnest(array['ma','mb','mc','md','mg']) k;
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version)
  values (pg_temp.id('scenario'), 'sqltest-b10r', 11, pg_temp.id('site1'), (select shift_start from s), interval '10 hours', 'test');
update public.scenario_runs set is_current = false where is_current;
insert into public.scenario_runs (id, scenario_id, status, speed, sim_anchor, wall_anchor, cursor_seq, is_current, rehearsal)
  values (pg_temp.id('run'), pg_temp.id('scenario'), 'playing', 1, pg_temp.sim(0), now(), 0, false, true);
insert into public.operator_pairings (run_id, operator_id, machine_id) values
  (pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('ma'));

create or replace function pg_temp.frame(p_seq int, p_off bigint, p_machine text, p_payload jsonb) returns void language sql as $$
  insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, payload)
  values (pg_temp.id('scenario'), p_seq, p_off, 'telemetry', pg_temp.id(p_machine), p_payload) $$;
-- A: belt off on flat ground (warning), then on a slope (critical)
select pg_temp.frame(1, 1000000, 'ma', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":2}');
select pg_temp.frame(2, 1001000, 'ma', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":17.4}');
-- B: lost rule_state, then the NEXT frame of the same breach
select pg_temp.frame(11, 2000000, 'mb', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":2}');
select pg_temp.frame(12, 2001000, 'mb', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":2}');
-- C: an older belt-on frame is re-applied
select pg_temp.frame(31, 3000000, 'mc', '{"speed_kmh":5,"seatbelt_fastened":true,"pitch_deg":2}');
select pg_temp.frame(32, 3001000, 'mc', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":2}');
select pg_temp.frame(33, 3002000, 'mc', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":2}');
select pg_temp.frame(34, 3003000, 'mc', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":2}');
-- D: starts in catch-up, continues live
select pg_temp.frame(41, 4000000, 'md', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":2}');
select pg_temp.frame(42, 4001000, 'md', '{"speed_kmh":5,"seatbelt_fastened":false,"pitch_deg":2}');
-- G: idle over only 30 minutes is not "the last hour"
select pg_temp.frame(51, 5000000, 'mg', '{"speed_kmh":0,"engine_hours":1000.0,"idle_hours":100.0}');
select pg_temp.frame(52, 6800000, 'mg', '{"speed_kmh":0,"engine_hours":1000.5,"idle_hours":100.45}');

create or replace function pg_temp.apply(p_seq int, p_catchup boolean default false) returns void language plpgsql as $$
declare r public.scenario_runs; sc public.scenarios; f public.scenario_frames; c public.app_config;
begin
  select * into r from public.scenario_runs where id = pg_temp.id('run');
  select * into sc from public.scenarios where id = r.scenario_id;
  select * into f from public.scenario_frames where scenario_id = sc.id and seq = p_seq;
  select * into c from public.app_config where id;
  perform private.apply_frame(r, sc, f, c, sc.shift_start_sim + make_interval(secs => f.sim_offset_ms / 1000.0), p_catchup);
end $$;
create or replace function pg_temp.cnt(p_type text, p_machine text) returns bigint language sql as $$
  select count(*) from public.events e where e.run_id = pg_temp.id('run') and e.type = p_type and e.machine_id = pg_temp.id(p_machine) $$;

-- ── MAJOR 1: a tier rise upgrades the alert, never the event ─────────────────────────────────────
do $$
declare al public.alerts%rowtype; ev public.events%rowtype;
begin
  perform pg_temp.apply(1);
  assert pg_temp.cnt('safety.seatbelt_breach', 'ma') = 1, 'warning breach: one event';
  assert (select tier from public.alerts where machine_id = pg_temp.id('ma')) = 'warning', 'alert starts at warning';
  perform pg_temp.apply(2);
  assert pg_temp.cnt('safety.seatbelt_breach', 'ma') = 1, 'the tier rise does NOT re-fire the event: ' || pg_temp.cnt('safety.seatbelt_breach', 'ma')::text;
  assert (select count(*) from private.ledger_queue q join public.events e on e.id = q.event_id where e.machine_id = pg_temp.id('ma')
            and e.type = 'safety.seatbelt_breach') = 1, 'one ledger_queue row';
  assert (select count(*) from private.loop_queue q join public.events e on e.id = q.event_id where e.machine_id = pg_temp.id('ma')) = 1, 'one loop_queue row';
  assert (select count(*) from public.anomalies where machine_id = pg_temp.id('ma')) = 1, 'one anomaly';
  assert (select severity_tier from public.anomalies where machine_id = pg_temp.id('ma')) = 'critical'
     and (select severity_score from public.anomalies where machine_id = pg_temp.id('ma')) = 85, 'its severity was updated in place';
  assert (select explanation ->> 'en' from public.anomalies where machine_id = pg_temp.id('ma')) like '%17.4° slope.', 'and its explanation';
  select * into al from public.alerts where machine_id = pg_temp.id('ma');
  assert (select count(*) from public.alerts where machine_id = pg_temp.id('ma')) = 1 and al.tier = 'critical' and al.occurrences = 2
     and jsonb_array_length(al.tier_history) = 1 and al.tier_history -> 0 ->> 'from' = 'warning', 'one alert, upgraded in place: ' || al.tier_history::text;
  assert al.origin_event_id is not null, 'origin event intact';
  assert pg_temp.cnt('alert.raised', 'ma') = 1, 'exactly one alert.raised';
  select * into ev from public.events where run_id = pg_temp.id('run') and type = 'alert.raised' and machine_id = pg_temp.id('ma');
  assert ev.payload ->> 'upgraded_from' = 'warning' and ev.payload ->> 'tier' = 'critical' and (ev.payload ->> 'alert_id')::uuid = al.id
     and ev.alert_id = al.id and ev.payload ->> 'kind' = 'seatbelt_off_moving', 'AlertRaised payload: ' || ev.payload::text;
  perform pg_temp.apply(2);
  assert pg_temp.cnt('alert.raised', 'ma') = 1 and pg_temp.cnt('safety.seatbelt_breach', 'ma') = 1, 're-applying the upgrading frame changes nothing';
end $$;

-- ── MINOR 4: the next frame after a lost rule_state ──────────────────────────────────────────────
do $$
begin
  perform pg_temp.apply(11);
  delete from private.rule_state where run_id = pg_temp.id('run');
  perform pg_temp.apply(12);
  assert pg_temp.cnt('safety.seatbelt_breach', 'mb') = 1, 'rule_state rebuilt from the open anomaly: no duplicate';
  assert (select count(*) from public.anomalies where machine_id = pg_temp.id('mb')) = 1, 'one anomaly';
  assert (select active from private.rule_state where run_id = pg_temp.id('run') and machine_id = pg_temp.id('mb')), 'state restored';
end $$;

-- ── MINOR 5: an older belt-on frame neither clears nor re-fires ─────────────────────────────────
do $$
begin
  perform pg_temp.apply(31);
  perform pg_temp.apply(32);
  perform pg_temp.apply(33);
  perform pg_temp.apply(31);                 -- the stale belt-on frame again
  assert (select active from private.rule_state where run_id = pg_temp.id('run') and machine_id = pg_temp.id('mc')), 'an older frame does not clear';
  perform pg_temp.apply(34);
  assert pg_temp.cnt('safety.seatbelt_breach', 'mc') = 1, 'and the next frame is not a new breach';
  assert (select ts_end from public.anomalies where machine_id = pg_temp.id('mc')) is null, 'anomaly still open';
end $$;

-- ── MAJOR 2: catch-up start, live continuation ──────────────────────────────────────────────────
do $$
declare al public.alerts%rowtype;
begin
  perform pg_temp.apply(41, true);
  assert (select count(*) from public.alerts where machine_id = pg_temp.id('md') and status = 'open') = 0, 'during catch-up: only a suppressed alert';
  perform pg_temp.apply(42, false);
  assert (select count(*) from public.alerts where machine_id = pg_temp.id('md') and status = 'open') = 1, 'the first live frame raises one open alert';
  select * into al from public.alerts where machine_id = pg_temp.id('md') and status = 'open';
  assert al.needs_ack and al.escalate_at is not null and al.origin_event_id is not null and al.tier = 'warning',
    'with an ack timeout and its origin event: ' || al.status::text;
  assert pg_temp.cnt('safety.seatbelt_breach', 'md') = 1, 'still one event';
  perform pg_temp.apply(42, false);
  assert (select count(*) from public.alerts where machine_id = pg_temp.id('md') and status = 'open') = 1
     and (select occurrences from public.alerts where id = al.id) = 1, 'idempotent';
end $$;

-- ── MINOR 7 / 8: thresholds in app_config, a full-hour idle window ──────────────────────────────
do $$
begin
  assert (select detector_idle_window_min from public.app_config where id) = 60
     and (select detector_default_slope_deg from public.app_config where id) = 15
     and (select detector_idle_caution_pct from public.app_config where id) = 40
     and (select detector_idle_warning_pct from public.app_config where id) = 50
     and (select detector_fault_grace_min from public.app_config where id) = 5
     and (select detector_warning_radius_m from public.app_config where id) = 30, 'defaults live in app_config';
  perform pg_temp.apply(51);
  perform pg_temp.apply(52);                  -- 30 minutes at 90 % idle
  assert pg_temp.cnt('anomaly.detected', 'mg') = 0, 'a 30-minute window is not "the last hour"';
end $$;

-- ── MAJOR 3 and MINOR 6: scoping ────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_fm2'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.anomalies) = 0, 'the FM of another site reads none of site 1''s anomalies';
  assert (select count(*) from public.operator_pairings) = 0, 'the FM of another site reads none of site 1''s pairings (005c)';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_fm1'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.anomalies where operator_id = pg_temp.id('op_ravi')) = 1, 'the site''s FM reads them';
  assert (select count(*) from public.operator_pairings) = 1, 'the FM reads pairings';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_tr1'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.anomalies where operator_id is not null) = 0, 'a trainer reads no operator-attributed anomaly (§2.10)';
  assert (select count(*) from public.operator_pairings) = 0, 'a trainer reads no pairings';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_other'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.anomalies where operator_id = pg_temp.id('op_ravi')) = 0, 'a colleague cannot read Ravi''s anomalies';
  assert (select count(*) from public.operator_pairings where operator_id = pg_temp.id('op_ravi')) = 0, 'nor Ravi''s pairing: a colleague cannot name an idler';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.operator_pairings) = 1, 'an operator reads their own pairing (the cockpit)';
  assert (select count(*) from public.anomalies where operator_id = pg_temp.id('op_ravi')) = 1, 'and their own anomaly';
end $$;
reset role;
do $$
begin
  assert (select prosecdef from pg_proc where oid = 'public.my_snapshot()'::regprocedure), 'my_snapshot reads pairings as owner, not through RLS';
  assert (select count(*) from public.dispatches d join public.alerts a on a.id = d.alert_id where a.run_id = pg_temp.id('run')) = 0, 'no dispatch';
end $$;
