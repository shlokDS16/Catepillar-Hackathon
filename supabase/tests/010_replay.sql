-- B10b (migration 006): the Loop builder and Replay on the server.
-- step_loop (lesson assignment + build_replay), the stored four-phase scenario, the answer key staying server-side,
-- replay_get / replay_submit (own replay only, idempotent), scoring numbers, and a raising build leaving the event,
-- alert and ledger entry intact (N2). Step functions only; rolled back; no dispatch can be created.
-- Scoring PARITY with apps/web/src/replay/fixture-scoring.ts is proved by scripts/replay-parity.test.ts.

create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t select k, gen_random_uuid() from unnest(array['site1','op_ravi','op_other','u_ravi','u_other','u_fm1','u_tr1',
  'model','ma','mb','zone','scenario','run']) k;
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;
grant execute on function pg_temp.id(text) to authenticated;
create temp table s (shift_start timestamptz not null) on commit drop;
insert into s values (date_trunc('second', now()) - interval '10 hours');
create or replace function pg_temp.expect_err(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_like then return; end if;
    raise exception 'expected error like % but got: %', p_like, sqlerrm;
  end;
  raise exception 'expected error like % but the statement succeeded: %', p_like, p_sql;
end $$;
grant execute on function pg_temp.expect_err(text, text) to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(k), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', k || '@b10b.local', '', now(), '{}', '{}', now(), now()
  from unnest(array['u_ravi','u_other','u_fm1','u_tr1']) k;
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site1'), 'SQLB10B1', 'b10b site', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.zones (id, site_id, name, zone_type, boundary, max_speed_kmh, max_slope_deg) values
  (pg_temp.id('zone'), pg_temp.id('site1'), 'Bench 3', 'work',
   extensions.ST_GeogFromText('POLYGON((79.0875 21.1458, 79.0895 21.1458, 79.0895 21.1475, 79.0875 21.1475, 79.0875 21.1458))'), 25, 15);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op_ravi'), 'OP-B10B1', 'Ravi B', 'novice', pg_temp.id('site1'), 'Operator-B1'),
  (pg_temp.id('op_other'), 'OP-B10B2', 'Other B', 'expert', pg_temp.id('site1'), 'Operator-B2');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_ravi'), 'operator', pg_temp.id('op_ravi'), pg_temp.id('site1'), 'Ravi'),
  (pg_temp.id('u_other'), 'operator', pg_temp.id('op_other'), pg_temp.id('site1'), 'Other'),
  (pg_temp.id('u_fm1'), 'fleet_manager', null, pg_temp.id('site1'), 'FM1'),
  (pg_temp.id('u_tr1'), 'trainer', null, pg_temp.id('site1'), 'TR1');
insert into public.machine_models (id, code, name, machine_type, idle_fuel_lph, baseline_idle_pct) values
  (pg_temp.id('model'), 'SQLTEST-B10B', 'b10b model', 'excavator', 28, 25);
insert into public.machines (id, code, model_id, home_site_id) values
  (pg_temp.id('ma'), 'EXC-B10B-A', pg_temp.id('model'), pg_temp.id('site1')),
  (pg_temp.id('mb'), 'EXC-B10B-B', pg_temp.id('model'), pg_temp.id('site1'));
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version)
  values (pg_temp.id('scenario'), 'sqltest-b10b', 12, pg_temp.id('site1'), (select shift_start from s), interval '10 hours', 'test');
update public.scenario_runs set is_current = false where is_current;
insert into public.scenario_runs (id, scenario_id, status, speed, sim_anchor, wall_anchor, cursor_seq, is_current, rehearsal)
  values (pg_temp.id('run'), pg_temp.id('scenario'), 'playing', 1, (select shift_start from s), now(), 0, false, true);
insert into public.operator_pairings (run_id, operator_id, machine_id) values (pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('ma'));

-- Machine A: 15 telemetry frames a minute apart (offsets 600 000 .. 1 440 000). Belt on for seq 1-10, off from seq 11
-- (the breach, offset 1 200 000, 17.4° pitch); seq 3 lost its GPS fix (forward fill); seq 14-15 fall past the +2 min window.
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, payload)
select pg_temp.id('scenario'), n, 600000 + 60000 * (n - 1), 'telemetry', pg_temp.id('ma'),
       jsonb_build_object('speed_kmh', 5, 'seatbelt_fastened', n < 11, 'pitch_deg', case when n < 11 then 3 else 17.4 end)
       || case when n = 3 then '{}'::jsonb else jsonb_build_object('lat', 21.1463 + n * 0.00002, 'lon', 79.0882 + n * 0.00002) end
  from generate_series(1, 15) n;
-- Ravi's own GPS (seq 101-108, every 2 min from 600 000)
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, operator_id, payload)
select pg_temp.id('scenario'), 100 + n, 600000 + 120000 * (n - 1), 'gps', pg_temp.id('op_ravi'),
       jsonb_build_object('lat', 21.1462 + n * 0.00001, 'lon', 79.0881 + n * 0.00001) from generate_series(1, 8) n;
-- weather at offset 0 (before the window opens: it becomes the wind's t = 0) and one fault on A
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, payload) values
  (pg_temp.id('scenario'), 201, 0, 'weather', '{"temperature_c": 38.5, "wind_kmh": 12, "wind_from_deg": 250, "wbgt_c": 31.2}');
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, payload) values
  (pg_temp.id('scenario'), 301, 300000, 'fault', pg_temp.id('ma'),
   '{"code_type": "j1939_spn_fmi", "spn": 100, "fmi": 1, "severity": "caution", "description_key": "fault.oil_pressure_low", "active": true}');
-- Machine B has nobody paired: its breach has no operator, so build_replay must raise
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, payload) values
  (pg_temp.id('scenario'), 401, 1200000, 'telemetry', pg_temp.id('mb'),
   '{"speed_kmh": 5, "seatbelt_fastened": false, "pitch_deg": 2, "lat": 21.1463, "lon": 79.0882}');

create or replace function pg_temp.apply(p_seq int) returns void language plpgsql as $$
declare r public.scenario_runs; sc public.scenarios; f public.scenario_frames; c public.app_config;
begin
  select * into r from public.scenario_runs where id = pg_temp.id('run');
  select * into sc from public.scenarios where id = r.scenario_id;
  select * into f from public.scenario_frames where scenario_id = sc.id and seq = p_seq;
  select * into c from public.app_config where id;
  perform private.apply_frame(r, sc, f, c, sc.shift_start_sim + make_interval(secs => f.sim_offset_ms / 1000.0), false);
end $$;

-- ── 0. the seed content parses against what the contracts expect ─────────────────────────────────
do $$
begin
  assert (select count(*) from public.replay_templates where event_type = 'safety.seatbelt_breach') = 1, 'template seeded';
  assert (select count(*) from public.lessons where code in ('seatbelt_slopes', 'faulty_machine_nearby')) = 2, 'both lessons seeded';
  assert (select jsonb_array_length(content -> 'cards') between 3 and 5 and jsonb_array_length(content -> 'quiz') = 3
            from public.lessons where code = 'seatbelt_slopes'), 'LessonContent shape: 3-5 cards, 3 questions';
  assert (select jsonb_array_length(steps) between 1 and 6 from public.protocol_cards where id = 'seatbelt_slopes'), 'protocol card steps';
  assert (select count(*) from public.event_types where replay and type <> 'safety.seatbelt_breach') = 0, 'only the seatbelt event builds a replay';
end $$;

-- ── 1. the breach produces one queue row; step_loop assigns the lesson and builds the replay ─────
select pg_temp.apply(11);                       -- the breach on A
select pg_temp.apply(401);                      -- the breach on B (no operator)
do $$
declare ev public.events; n int; rs public.replay_scenarios; sj jsonb;
begin
  select * into ev from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach' and machine_id = pg_temp.id('ma');
  assert ev.id is not null and ev.operator_id = pg_temp.id('op_ravi'), 'A: one breach, Ravi at the controls';
  assert (select count(*) from private.loop_queue where event_id = ev.id and done_at is null and error is null) = 1, 'one loop_queue row, pending';
  assert (select count(*) from public.replay_scenarios) = 0, 'nothing is built inside the inserting transaction (N2)';
  delete from private.loop_queue where event_id not in (select id from public.events where run_id = pg_temp.id('run'));   -- the live project's own rows stay out of this count (rolled back)

  n := private.step_loop(20);
  assert n = 2, 'step_loop handled both queue rows: ' || n::text;
  assert (select done_at is not null and error is null from private.loop_queue where event_id = ev.id), 'A is done, no error';

  assert (select count(*) from public.lesson_assignments la join public.lessons l on l.id = la.lesson_id
           where la.operator_id = pg_temp.id('op_ravi') and l.code = 'seatbelt_slopes' and la.because_event_id = ev.id) = 1, 'one lesson assignment';
  assert (select count(*) from public.events where type = 'training.lesson_assigned' and operator_id = pg_temp.id('op_ravi')
            and payload ->> 'lesson_code' = 'seatbelt_slopes' and (payload ->> 'because_event_id')::uuid = ev.id) = 1, 'one training.lesson_assigned';
  select * into rs from public.replay_scenarios where source_event_id = ev.id;
  assert rs.id is not null and rs.operator_id = pg_temp.id('op_ravi'), 'one replay, Ravi''s';
  assert (select count(*) from public.events where type = 'training.replay_ready' and (payload ->> 'replay_id')::uuid = rs.id
            and (payload ->> 'source_event_id')::uuid = ev.id) = 1, 'one training.replay_ready';
  assert (select count(*) from private.ledger_queue q join public.events e on e.id = q.event_id
           where e.type in ('training.lesson_assigned', 'training.replay_ready')) = 0, 'training events are not ledgered';

  -- second call: nothing left, nothing duplicated
  assert private.step_loop(20) = 0, 'a drained queue is a no-op';
  assert (select count(*) from public.lesson_assignments where operator_id = pg_temp.id('op_ravi')) = 1, 'still one assignment';
  assert (select count(*) from public.replay_scenarios) = 1, 'still one replay';
  assert private.build_replay(ev.id) = rs.id, 'build_replay is idempotent per event';
  assert (select count(*) from public.events where type = 'training.replay_ready') = 1, 'and emits once';
end $$;

-- ── 2. the stored scenario: four phases, built from the frames ───────────────────────────────────
do $$
declare sj jsonb; c jsonb; tr jsonb;
begin
  select scenario_json into sj from public.replay_scenarios;
  assert sj ->> 'event_type' = 'safety.seatbelt_breach' and sj ->> 'machine_code' = 'EXC-B10B-A', 'header';
  assert sj #>> '{summary,en}' = 'Seatbelt off on a 17° slope', 'summary: ' || (sj #>> '{summary,en}');
  assert sj #>> '{brief,situation,en}' ~ '^At \d\d:\d\d EXC-B10B-A moved at 5 km/h on Bench 3 with the seatbelt off\.$', 'brief: ' || (sj #>> '{brief,situation,en}');
  assert sj #>> '{brief,situation,hi}' like '%Bench 3%' and (sj #>> '{brief,time_budget_s}')::int = 60, 'hi brief, 60 s budget';
  assert (select array_agg(x ->> 'type' order by x ->> 'id') from jsonb_array_elements(sj #> '{investigate,cards}') x)
       = array['protocol_card','fault_code','map_snapshot','shift_hours','telemetry_trend','weather','wind'], 'seven card types (by id c_*)';
  assert (sj #>> '{investigate,max_open}')::int = 4, 'max_open 4';
  assert jsonb_array_length(sj #> '{decide,steps}') = 3, 'three decide steps';
  assert (select count(*) from jsonb_array_elements(sj #> '{decide,steps}') x where x ->> 'kind' = 'order') = 1, 'one order step';

  -- trend: 13 telemetry frames are inside -10 min..+2 min; the belt series flips at the event
  select x into c from jsonb_array_elements(sj #> '{investigate,cards}') x where x ->> 'id' = 'c_trend';
  assert (select jsonb_array_length(s -> 'points') from jsonb_array_elements(c -> 'series') s where s ->> 'metric' = 'speed_kmh') = 13, '13 trend points, frames outside the window left out';
  assert (select array_agg((p ->> 'v')::int order by (p ->> 't_ms')::int) from jsonb_array_elements((select s -> 'points' from jsonb_array_elements(c -> 'series') s where s ->> 'metric' = 'seatbelt')) p)
       = array[1,1,1,1,1,1,1,1,1,1,0,0,0], 'belt on for ten frames, then off';

  -- reenactment: t_ms from the window start, event 10 min in, the belt carried honestly, the lost fix filled forward
  tr := sj -> 'reenactment';
  assert (tr ->> 'duration_ms')::int = 720000 and (tr ->> 'event_ms')::int = 600000, 'duration 12 min, event at 10 min: ' || (tr ->> 'duration_ms') || '/' || (tr ->> 'event_ms');
  assert jsonb_array_length(tr -> 'machine_track') = 13, '13 machine fixes (the dropout is forward-filled, not skipped)';
  assert (tr #>> '{machine_track,2,lat}') = (tr #>> '{machine_track,1,lat}'), 'the lost fix repeats the last position';
  assert (tr #>> '{machine_track,9,seatbelt_fastened}') = 'true' and (tr #>> '{machine_track,10,seatbelt_fastened}') = 'false', 'belt flips exactly at the event: ' || (tr #>> '{machine_track,10}');
  assert (tr #>> '{machine_track,10,t_ms}')::int = (tr ->> 'event_ms')::int and (tr #>> '{machine_track,10,pitch_deg}')::numeric = 17.4, 'the event fix';
  assert jsonb_array_length(tr -> 'trail') = 7, 'seven of Ravi''s GPS fixes in the window: ' || jsonb_array_length(tr -> 'trail')::text;
  assert (tr #>> '{wind,0,t_ms}')::int = 0 and (tr #>> '{wind,0,from_deg}')::numeric = 250 and (tr #>> '{wind,0,kmh}')::numeric = 12, 'wind from the frame before the window';
  assert tr -> 'real_response_ms' = 'null'::jsonb, 'unacknowledged: no response time';

  -- the map and the fault card
  select x into c from jsonb_array_elements(sj #> '{investigate,cards}') x where x ->> 'id' = 'c_map';
  assert jsonb_array_length(c -> 'zones') = 1 and c #>> '{zones,0,name}' = 'Bench 3' and jsonb_array_length(c #> '{zones,0,polygon}') = 5, 'the zone polygon';
  select x into c from jsonb_array_elements(sj #> '{investigate,cards}') x where x ->> 'id' = 'c_fault';
  assert c #>> '{codes,0,code}' = 'SPN 100 FMI 1' and c #>> '{codes,0,description,en}' = 'Oil Pressure Low', 'the active fault: ' || (c ->> 'codes');
  select x into c from jsonb_array_elements(sj #> '{investigate,cards}') x where x ->> 'id' = 'c_shift';
  assert (c ->> 'hours_on_shift')::numeric = 0.3 or (c ->> 'hours_on_shift')::numeric = 0.33, 'hours since the scenario start: ' || (c ->> 'hours_on_shift');
  select x into c from jsonb_array_elements(sj #> '{investigate,cards}') x where x ->> 'id' = 'c_card';
  assert c ->> 'card_id' = 'seatbelt_slopes', 'the card is referenced by id, not copied';

  -- no answer key anywhere in the client JSON
  assert sj::text !~ '"(relevant|best|axis|weight|why|correct)"', 'no answer key in scenario_json';
  assert (select count(*) from jsonb_array_elements(sj #> '{decide,steps}') x where x ? 'best' or x ? 'why' or x ? 'axis') = 0, 'steps carry no key';
  -- the order step is not listed in the answer order
  assert (select array_agg(ch ->> 'id' order by ord) from jsonb_array_elements((select x -> 'choices' from jsonb_array_elements(sj #> '{decide,steps}') x where x ->> 'kind' = 'order')) with ordinality as e(ch, ord))
       <> array['park','belt','report','resume'], 'the order step is scrambled';
end $$;

-- ── 3. a raising build leaves the event, alert and ledger entry intact (N2) ──────────────────────
do $$
declare ev public.events;
begin
  select * into ev from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach' and machine_id = pg_temp.id('mb');
  assert ev.id is not null and ev.operator_id is null, 'B: a breach with nobody paired';
  assert (select done_at is null and error like 'replay: P0001 build_replay: event % has no operator or machine' from private.loop_queue where event_id = ev.id),
    'the failure is written on the queue row: ' || (select error from private.loop_queue where event_id = ev.id);
  assert (select count(*) from public.replay_scenarios where source_event_id = ev.id) = 0, 'no replay';
  assert (select count(*) from public.alerts where origin_event_id = ev.id) = 1, 'the alert is intact';
  assert (select count(*) from private.ledger_queue where event_id = ev.id) = 1, 'the ledger entry is queued';
  assert (select count(*) from public.events where id = ev.id) = 1, 'the event is intact';
  assert private.step_loop(20) = 0, 'an errored row is not retried by itself';
end $$;

-- ── 4. a sealed near miss: the operator keeps the lesson, the trainer sees nothing linking it to a person ──
do $$
declare ev public.events;
begin
  ev := private.emit_event('safety.seatbelt_breach', '{"non_punitive": true, "frame_seq": 11}', 'b10b:sealed', 'system', pg_temp.id('site1'),
         pg_temp.id('run'), pg_temp.id('ma'), pg_temp.id('op_ravi'), p_sim_ts => (select shift_start from s) + interval '1200 seconds');
  perform pg_temp.expect_err(format('select private.build_replay(%L)', ev.id), '%sealed near miss%');
  assert private.step_loop(20) = 1, 'the sealed event''s queue row is handled';
  assert (select done_at is not null and error is null from private.loop_queue where event_id = ev.id), 'and finished cleanly, not left as an error';
  assert (select count(*) from public.replay_scenarios where source_event_id = ev.id) = 0, 'no replay for it';
  assert (select count(*) from public.lesson_assignments where because_event_id = ev.id and operator_id = pg_temp.id('op_ravi')) = 1, 'the operator still gets the lesson';
  assert (select private.event_is_sealed(e) from public.events e where e.type = 'training.lesson_assigned' and (e.payload ->> 'because_event_id')::uuid = ev.id),
    'its training.lesson_assigned is sealed by causation';
end $$;

-- ── 5. who may read what ─────────────────────────────────────────────────────────────────────────
create temp table r (v uuid not null) on commit drop;
insert into r select id from public.replay_scenarios;
grant select on r to authenticated, anon;
create or replace function pg_temp.rid() returns uuid language sql as $$ select v from r $$;
grant execute on function pg_temp.rid() to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
declare sj jsonb;
begin
  sj := public.replay_get(pg_temp.rid());
  assert sj ->> 'id' = pg_temp.rid()::text and jsonb_array_length(sj #> '{investigate,cards}') = 7, 'Ravi gets his replay';
  assert sj::text !~ '"(relevant|best|axis|weight|why|correct)"', 'and no answer key';
  assert public.replay_get(pg_temp.rid()) = sj, 'the order is stored: a reload sees the same lists';
  -- B1: list order must not carry the key
  assert (select count(*) from (select (x ->> 'id') in ('c_trend','c_map','c_card') f from jsonb_array_elements(sj #> '{investigate,cards}') with ordinality t(x, o) order by o limit 3) q where f) < 3, 'the first three cards are not all the relevant ones';
  assert (select count(*) from (select (x ->> 'id') in ('c_trend','c_map','c_card') f from jsonb_array_elements(sj #> '{investigate,cards}') with ordinality t(x, o) order by o desc limit 3) q where f) < 3, 'nor the last three';
  assert sj #>> '{decide,steps,0,choices,0,id}' <> 'stop' and sj #>> '{decide,steps,1,choices,0,id}' <> 'belt', 'the best single choice is not listed first';
  assert (select count(*) from public.replay_scenarios) = 1, 'he can select the row';
  perform pg_temp.expect_err('select answer_key from public.replay_scenarios', 'permission denied%');
  perform pg_temp.expect_err('select * from public.replay_scenarios', 'permission denied%');
  perform pg_temp.expect_err('select event_id from private.loop_queue', 'permission denied%');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_other'), 'role', 'authenticated')::text, true);
do $$
begin
  perform pg_temp.expect_err(format('select public.replay_get(%L)', pg_temp.rid()), 'not_found');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[]'), 'not_found');
  assert (select count(*) from public.replay_scenarios) = 0, 'another operator selects none';
  assert (select count(*) from public.replay_attempts) = 0, 'no attempts either';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_fm1'), 'role', 'authenticated')::text, true);
do $$
begin
  perform pg_temp.expect_err(format('select public.replay_get(%L)', pg_temp.rid()), 'forbidden');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[]'), 'forbidden');
  perform pg_temp.expect_err('select answer_key from public.replay_scenarios', 'permission denied%');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_tr1'), 'role', 'authenticated')::text, true);
do $$
begin
  perform pg_temp.expect_err(format('select public.replay_get(%L)', pg_temp.rid()), 'forbidden');
  perform pg_temp.expect_err('select answer_key from public.replay_scenarios', 'permission denied%');
  assert (select count(*) from public.lesson_assignments) = 1, 'the trainer reads the non-sealed assignment only';
  assert (select count(*) from public.events where type = 'training.lesson_assigned') = 1, 'and one training.lesson_assigned, not the sealed one';
  assert (select count(*) from public.replay_scenarios where id = pg_temp.rid()) = 1, 'a trainer of the site reads the keyless scenario row';
  assert (select count(*) from public.replay_attempts) = 0, 'but never the stored attempts';
end $$;
reset role;
set local role anon;
do $$ begin perform pg_temp.expect_err(format('select public.replay_get(%L)', pg_temp.rid()), 'permission denied%'); end $$;
reset role;

-- ── 6. replay_submit: scoring, idempotency, validation ───────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb; res2 jsonb; req uuid := gen_random_uuid(); att uuid;
begin
  -- A. everything right, in time
  res := public.replay_submit(pg_temp.rid(), req, array['c_trend', 'c_map', 'c_card'],
    '[{"step":1,"choice_ids":["stop"],"ms":4000},{"step":2,"choice_ids":["belt"],"ms":5000},{"step":3,"choice_ids":["park","belt","report","resume"],"ms":9000}]');
  assert res -> 'scores' = '{"safety":100,"procedure":100,"efficiency":100}'::jsonb, 'perfect run: ' || (res ->> 'scores');
  assert res #>> '{process_trace,opened}' = '["c_trend", "c_map", "c_card"]' and jsonb_array_length(res #> '{process_trace,relevant}') = 7, 'trace and the key, after submit';
  assert res #>> '{rule,card_id}' = 'seatbelt_slopes' and res #>> '{rule,text,en}' = 'Seatbelt on before the machine moves; never on a slope without it.', 'the rule is quoted from the card';
  assert res ->> 'lesson_code' = 'seatbelt_slopes', 'lesson_code';
  assert jsonb_array_length(res -> 'review') = 3 and res #>> '{review,0,best}' = '["stop"]', 'review';

  -- the same request again: the stored debrief, no second attempt, no second event
  res2 := public.replay_submit(pg_temp.rid(), req, array['c_wind'], '[]');
  assert res2 = res, 'a repeated request returns the stored result';
  assert (select count(*) from public.replay_attempts) = 1, 'one attempt';
  select id into att from public.replay_attempts;
  assert (select count(*) from public.events where type = 'training.replay_completed' and (payload ->> 'attempt_id')::uuid = att) = 1, 'one replay_completed';
  assert (select payload -> 'scores' from public.events where type = 'training.replay_completed') = res -> 'scores', 'replay_completed carries the same scores (UI-19)';
  assert (select safety_score = 100 and procedure_score = 100 and efficiency_score = 100 and completed_at is not null from public.replay_attempts), 'stored scores';
end $$;
do $$
declare res jsonb;
begin
  -- B. weak run: opens a distractor, step 2 timed out (absent), the order step wrong and over time
  --    safety (50 + 0)/2 = 50; protocol 5/6, investigation 0 -> procedure 41.7; efficiency 1/3 -> 33.3
  res := public.replay_submit(pg_temp.rid(), gen_random_uuid(), array['c_trend', 'c_wind'],
    '[{"step":1,"choice_ids":["stop"],"ms":5000},{"step":3,"choice_ids":["park","report","belt","resume"],"ms":30000}]');
  assert res -> 'scores' = '{"safety":50,"procedure":41.7,"efficiency":33.3}'::jsonb, 'weak run: ' || (res ->> 'scores');
  assert res #>> '{review,1,chosen}' = '[]' and res #>> '{review,1,why,en}' = 'Time ran out. Fasten the seatbelt before moving again.'
     and res #>> '{review,1,why,hi}' like 'समय समाप्त। %', 'a timed-out step reads "Time ran out"';
  assert res #>> '{review,0,why,en}' = 'Stop first, before anything else.', 'an answered step keeps the key''s wording';

  -- C. UI-20: repeats ignored, only the first max_open (4) distinct ids count
  --    opened = [trend, map, card, wind]; net (3-1)/3, ideal pairs all in order -> investigation (0.6667+1)/2; protocol 1 -> 91.7
  res := public.replay_submit(pg_temp.rid(), gen_random_uuid(), array['c_trend', 'c_trend', 'c_map', 'c_card', 'c_wind', 'c_shift'],
    '[{"step":1,"choice_ids":["stop"],"ms":1},{"step":2,"choice_ids":["belt"],"ms":15000},{"step":3,"choice_ids":["park","belt","report","resume"],"ms":25000}]');
  assert res #>> '{process_trace,opened}' = '["c_trend", "c_map", "c_card", "c_wind"]', 'first four distinct: ' || (res #>> '{process_trace,opened}');
  assert res -> 'scores' = '{"safety":100,"procedure":91.7,"efficiency":100}'::jsonb, 'limit-exact answers are within time: ' || (res ->> 'scores');

  -- D. nothing opened, nothing answered
  res := public.replay_submit(pg_temp.rid(), gen_random_uuid(), '{}', '[]');
  assert res -> 'scores' = '{"safety":0,"procedure":0,"efficiency":0}'::jsonb, 'empty: ' || (res ->> 'scores');
  assert (select count(*) from public.replay_attempts) = 4, 'four attempts';
end $$;
do $$
begin
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '{"step":1}'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1,"choice_ids":[],"ms":10}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1,"choice_ids":["stop"],"ms":-5}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, null, %L, %L::jsonb)', pg_temp.rid(), '{}', '[]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1.5,"choice_ids":["stop"],"ms":10}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1,"choice_ids":["stop"],"ms":1e400}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1,"choice_ids":["stop"],"ms":2.5}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1,"choice_ids":[{"a":1}],"ms":10}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1,"choice_ids":["nope"],"ms":10}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":9,"choice_ids":["stop"],"ms":10}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":3,"choice_ids":["park","park","belt"],"ms":10}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1,"choice_ids":["stop"],"ms":1},{"step":1,"choice_ids":["stop"],"ms":1}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), %L, %L::jsonb)', pg_temp.rid(), '{}', '[{"step":1,"choice_ids":["stop"],"ms":-1}]'), 'validation');
  perform pg_temp.expect_err(format('select public.replay_submit(%L, gen_random_uuid(), (select array_agg(''c'' || g) from generate_series(1, 51) g), %L::jsonb)', pg_temp.rid(), '[]'), 'validation');
  assert (select count(*) from public.replay_attempts) = 4, 'rejected submits store nothing';
end $$;
reset role;

-- ── 7. the lesson card in my_snapshot now points at the replay ───────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
declare snap jsonb;
begin
  snap := public.my_snapshot();
  assert (select count(*) from jsonb_array_elements(snap -> 'assignments') a where a ->> 'lesson_code' = 'seatbelt_slopes' and a ->> 'replay_id' = pg_temp.rid()::text) = 1,
    'snapshot assignment links the replay: ' || (snap ->> 'assignments');
end $$;
reset role;
