-- B2: migration 001 per role. Runs inside begin … rollback (scripts/sqltest.ts): the three auth users,
-- site, operators and rows below never survive. `set local role` + `request.jwt.claims` impersonate a
-- client the way PostgREST does (auth.uid() reads the claims).
create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t values
  ('site', gen_random_uuid()), ('op_ravi', gen_random_uuid()), ('op_other', gen_random_uuid()),
  ('u_ravi', gen_random_uuid()), ('u_anita', gen_random_uuid()), ('u_trainer', gen_random_uuid()),
  ('machine', gen_random_uuid()), ('scenario', gen_random_uuid()), ('run', gen_random_uuid()), ('task', gen_random_uuid());
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;                            -- the impersonated roles read the fixture ids
grant execute on function pg_temp.id(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(k), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', k || '@sqltest.local', '', now(), '{}', '{}', now(), now()
from t where k like 'u\_%';

insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site'), 'SQLTEST', 'sqltest quarry', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op_ravi'), 'OP-T001', 'Ravi (test)', 'novice', pg_temp.id('site'), 'Operator-T01'),
  (pg_temp.id('op_other'), 'OP-T002', 'Other (test)', 'expert', pg_temp.id('site'), 'Operator-T02');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_ravi'), 'operator', pg_temp.id('op_ravi'), pg_temp.id('site'), 'Ravi'),
  (pg_temp.id('u_anita'), 'fleet_manager', null, pg_temp.id('site'), 'Anita'),
  (pg_temp.id('u_trainer'), 'trainer', null, pg_temp.id('site'), 'Trainer');
insert into public.machines (id, code, home_site_id) values (pg_temp.id('machine'), 'EXC-T01', pg_temp.id('site'));
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version) values
  (pg_temp.id('scenario'), 'sqltest', 1, pg_temp.id('site'), now(), interval '8 hours', 'test');
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, payload) values
  (pg_temp.id('scenario'), 1, 0, 'telemetry', pg_temp.id('machine'), '{"speed_kmh": 1}');
insert into public.scenario_runs (id, scenario_id, sim_anchor) values (pg_temp.id('run'), pg_temp.id('scenario'), now());
insert into public.tasks (id, run_id, operator_id, machine_id, site_id, task_type, planned_start, planned_cycles) values
  (pg_temp.id('task'), pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('machine'), pg_temp.id('site'), 'excavation', now(), 120),
  (gen_random_uuid(), pg_temp.id('run'), pg_temp.id('op_other'), pg_temp.id('machine'), pg_temp.id('site'), 'grading', now(), 80);
insert into public.telemetry_readings (run_id, frame_seq, machine_id, operator_id, ts, speed_kmh) values
  (pg_temp.id('run'), 1, pg_temp.id('machine'), pg_temp.id('op_ravi'), now(), 6.2),
  (pg_temp.id('run'), 2, pg_temp.id('machine'), pg_temp.id('op_other'), now(), 0);
insert into public.operator_state (run_id, operator_id, ts) values (pg_temp.id('run'), pg_temp.id('op_ravi'), now()), (pg_temp.id('run'), pg_temp.id('op_other'), now());
insert into public.operator_gps_trail (run_id, operator_id, ts, location) values
  (pg_temp.id('run'), pg_temp.id('op_ravi'), now(), extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography),
  (pg_temp.id('run'), pg_temp.id('op_other'), now(), extensions.ST_SetSRID(extensions.ST_MakePoint(79.0883, 21.1464), 4326)::extensions.geography);
insert into public.operator_pairings (run_id, operator_id, machine_id) values (pg_temp.id('run'), pg_temp.id('op_other'), pg_temp.id('machine'));
insert into public.shifts (run_id, operator_id, site_id, shift_type, scheduled_start, scheduled_end) values
  (pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('site'), 'day', now(), now() + interval '8 hours'),
  (pg_temp.id('run'), pg_temp.id('op_other'), pg_temp.id('site'), 'day', now(), now() + interval '8 hours');
insert into public.ppe_overrides (task_id, operator_id, granted_by, reason, missing, valid_until) values
  (pg_temp.id('task'), pg_temp.id('op_ravi'), pg_temp.id('u_anita'), 'Vest torn; replacement issued.', array['vest'], now() + interval '15 minutes');
insert into public.consents (operator_id, version) values (pg_temp.id('op_ravi'), '1'), (pg_temp.id('op_other'), '1');
insert into public.task_history (external_ref, source, task_type, weather, operator_skill, machine_age_years, organiser_estimate_min, actual_min, operator_id, split, model_p50_min)
select 'T' || g, 'synthetic', 'excavation', 'hot', 'novice', 3, 50, 55 + g, pg_temp.id('op_other'), 'test', 54 from generate_series(1, 6) g;

-- unique (run_id, frame_seq) on telemetry
do $$
begin
  begin
    insert into public.telemetry_readings (run_id, frame_seq, machine_id, ts) values (pg_temp.id('run'), 1, pg_temp.id('machine'), now());
    raise exception 'duplicate (run_id, frame_seq) was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.telemetry_readings (run_id, frame_seq, machine_id, ts) values (pg_temp.id('run'), null, pg_temp.id('machine'), now());
    raise exception 'a run row without frame_seq was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ── as Ravi (operator) ──────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select private.app_role()) = 'operator', 'app_role';
  assert (select count(*) from public.profiles) = 1, 'OP sees only own profile';
  assert (select count(*) from public.tasks) = 1, 'OP sees own tasks only';
  assert (select count(*) from public.telemetry_readings) = 1, 'OP sees own telemetry only';
  assert (select count(*) from public.operator_state) = 1, 'OP sees own state only';
  assert (select count(*) from public.app_config) = 0, 'app_config hidden from OP';
  assert (select count(*) from public.operator_gps_trail) = 1, 'OP sees own trail only';
  assert (select count(*) from public.shifts) = 1, 'OP sees own shifts only';
  assert (select count(*) from public.ppe_overrides) = 1, 'OP sees own overrides';
  assert (select count(*) from public.consents) = 1, 'OP sees own consents only';
  assert (select count(*) from public.operator_pairings) = 1, 'pairings readable by every role';
  assert (select count(*) from public.machines) >= 1, 'reference data readable';
  assert (select count(*) from public.task_history) = 0, 'OP sees no other operator history';
  assert (select count(*) from public.v_task_analytics) = 0, 'view follows RLS (OP has no test rows)';
  assert (select display_name from public.operators where id = pg_temp.id('op_other')) = 'Other (test)', 'operators readable column by column';
end $$;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.scenario_frames;
    raise exception 'OP could read scenario_frames';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from public.operators where pseudonym is not null;
    raise exception 'OP could read pseudonyms';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$
begin
  begin
    insert into public.tasks (operator_id, site_id, task_type, planned_start, planned_cycles) values (pg_temp.id('op_ravi'), pg_temp.id('site'), 'excavation', now(), 1);
    raise exception 'OP could insert into tasks';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── as Anita (fleet manager) ────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_anita'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select private.app_role()) = 'fleet_manager', 'app_role fm';
  assert (select count(*) from public.profiles) = 3, 'FM sees all profiles';
  assert (select count(*) from public.tasks) = 2, 'FM sees all tasks';
  assert (select count(*) from public.telemetry_readings) = 2, 'FM sees all telemetry';
  assert (select count(*) from public.operator_state) = 2, 'FM sees all operator state';
  assert (select count(*) from public.app_config) = 1, 'FM reads app_config';
  assert (select count(*) from public.operator_gps_trail) = 2, 'FM sees all trails';
  assert (select count(*) from public.shifts) = 2, 'FM sees all shifts';
  assert (select count(*) from public.ppe_overrides) = 1, 'FM sees overrides';
  assert (select count(*) from public.consents) = 2, 'FM sees consents';
  assert (select n from public.v_task_analytics where task_type = 'excavation' and condition = 'hot') = 6, 'analytics row for FM';
end $$;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.operators where pseudonym is not null;
    raise exception 'FM could read pseudonyms (near-miss mode broken)';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from public.scenario_frames;
    raise exception 'FM could read scenario_frames';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── as the trainer ──────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_trainer'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.tasks) = 2, 'TR sees all tasks';
  assert (select count(*) from public.telemetry_readings) = 0, 'TR sees no telemetry';
  assert (select count(*) from public.operator_gps_trail) = 0, 'TR sees no trail';
  assert (select count(*) from public.task_history) = 6, 'TR sees task history';
  assert (select count(*) from public.operator_state) = 0, 'TR sees no operator state';
  assert (select count(*) from public.ppe_overrides) = 0, 'TR sees no overrides';
  assert (select count(*) from public.consents) = 0, 'TR sees no consents';
  assert (select count(*) from public.shifts) = 2, 'TR sees shifts';
  assert (select count(*) from public.operator_pairings) = 1, 'TR sees pairings';
end $$;

-- ── as anon: no grants at all ───────────────────────────────────────────────────────────────────
reset role;
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.sites;
    raise exception 'anon could read sites';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from public.scenario_frames;
    raise exception 'anon could read frames';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
