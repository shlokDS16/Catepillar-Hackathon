-- B12 (migration 007): the alert engine. Upgrade in place, grouped suppression, the rate cap and flood summary,
-- ack idempotency and authorisation, resolution (the open item from B10), dispatch planning, the motion-lock
-- matrix for operator calls, escalation timing (60 s) and its independence from the tick and the Loop, and
-- DRY RUN ONLY: no dispatch row leaves dry_run/suppressed and nothing is handed to pg_net.
-- Step functions only; rolled back; no phone, SMS or Telegram can be reached from here.
-- The live project may hold its own alerts: every assertion below is about this file's fixtures, never a global count.

-- ── 0. fixtures ──────────────────────────────────────────────────────────────────────────────────
create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t select k, gen_random_uuid() from unnest(array['site1','site2','op_ravi','op_other','op_cap','op_cap2',
  'm1','m2','m3','m4','m5','m6','u_ravi','u_other','u_fm1','u_fm2','u_tr1','model','ma','mb','mc','md','zone','scenario','run']) k;
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

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(k), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', k || '@b12.local', '', now(), '{}', '{}', now(), now()
  from unnest(array['u_ravi','u_other','u_fm1','u_fm2','u_tr1']) k;
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site1'), 'SQLB121', 'b12 site 1', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography),
  (pg_temp.id('site2'), 'SQLB122', 'b12 site 2', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(73.8, 18.5), 4326)::extensions.geography);
insert into public.zones (id, site_id, name, zone_type, boundary, max_speed_kmh, max_slope_deg) values
  (pg_temp.id('zone'), pg_temp.id('site1'), 'Bench 3', 'work',
   extensions.ST_GeogFromText('POLYGON((79.0875 21.1458, 79.0895 21.1458, 79.0895 21.1475, 79.0875 21.1475, 79.0875 21.1458))'), 25, 15);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym)
select pg_temp.id(k), 'OP-B12-' || k, 'B12 ' || k, 'novice', pg_temp.id('site1'), 'Operator-B12-' || k
  from unnest(array['op_ravi','op_other','op_cap','op_cap2','m1','m2','m3','m4','m5','m6']) k;
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_ravi'), 'operator', pg_temp.id('op_ravi'), pg_temp.id('site1'), 'Ravi'),
  (pg_temp.id('u_other'), 'operator', pg_temp.id('op_other'), pg_temp.id('site1'), 'Other'),
  (pg_temp.id('u_fm1'), 'fleet_manager', null, pg_temp.id('site1'), 'FM1'),
  (pg_temp.id('u_fm2'), 'fleet_manager', null, pg_temp.id('site2'), 'FM2'),
  (pg_temp.id('u_tr1'), 'trainer', null, pg_temp.id('site1'), 'TR1');
insert into public.machine_models (id, code, name, machine_type, idle_fuel_lph, baseline_idle_pct) values
  (pg_temp.id('model'), 'SQLTEST-B12', 'b12 model', 'excavator', 28, 25);
insert into public.machines (id, code, model_id, home_site_id) values
  (pg_temp.id('ma'), 'EXC-B12-A', pg_temp.id('model'), pg_temp.id('site1')),
  (pg_temp.id('mb'), 'EXC-B12-B', pg_temp.id('model'), pg_temp.id('site1')),
  (pg_temp.id('mc'), 'EXC-B12-C', pg_temp.id('model'), pg_temp.id('site1')),
  (pg_temp.id('md'), 'EXC-B12-D', pg_temp.id('model'), pg_temp.id('site1'));
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version)
  values (pg_temp.id('scenario'), 'sqltest-b12', 12, pg_temp.id('site1'), (select shift_start from s), interval '10 hours', 'test');
update public.scenario_runs set is_current = false where is_current;
insert into public.scenario_runs (id, scenario_id, status, speed, sim_anchor, wall_anchor, cursor_seq, is_current, rehearsal)
  values (pg_temp.id('run'), pg_temp.id('scenario'), 'playing', 1, (select shift_start from s), now(), 0, false, true);
insert into public.operator_pairings (run_id, operator_id, machine_id) values (pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('ma'));

-- machine A: Ravi's belt goes off (11), on (12), off (13), on (14), off (15) a minute apart
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, payload)
select pg_temp.id('scenario'), 10 + n, 600000 + 60000 * (n - 1), 'telemetry', pg_temp.id('ma'),
       jsonb_build_object('speed_kmh', 5, 'seatbelt_fastened', n % 2 = 0, 'pitch_deg', 2, 'lat', 21.1463, 'lon', 79.0882)
  from generate_series(1, 5) n;
-- the poison frame (a telemetry frame with no machine) and a breach on machine B, which has nobody paired
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, payload) values
  (pg_temp.id('scenario'), 1, 5000, 'telemetry', null, '{"speed_kmh": 3.0}'),
  (pg_temp.id('scenario'), 401, 1200000, 'telemetry', pg_temp.id('mb'),
   '{"speed_kmh": 5, "seatbelt_fastened": false, "pitch_deg": 2, "lat": 21.1463, "lon": 79.0882}');
-- operator state for the motion-lock matrix (m1 on foot; m2 in a parked cab; m3 in a moving cab; m4 nothing; m5 stale)
insert into public.machine_state (run_id, machine_id, ts, speed_kmh, moving, parking_brake, updated_at) values
  (pg_temp.id('run'), pg_temp.id('mc'), now(), 0, false, true, now()),
  (pg_temp.id('run'), pg_temp.id('md'), now(), 8, true, false, now());
insert into public.operator_state (run_id, operator_id, ts, on_foot, in_cab_machine_id, updated_at) values
  (pg_temp.id('run'), pg_temp.id('m1'), now(), true, null, now()),
  (pg_temp.id('run'), pg_temp.id('m2'), now(), false, pg_temp.id('mc'), now()),
  (pg_temp.id('run'), pg_temp.id('m3'), now(), false, pg_temp.id('md'), now()),
  (pg_temp.id('run'), pg_temp.id('m5'), now(), true, null, now() - interval '1 minute'),
  (pg_temp.id('run'), pg_temp.id('m6'), now(), true, null, now());

create or replace function pg_temp.apply(p_seq int) returns void language plpgsql as $$
declare r public.scenario_runs; sc public.scenarios; f public.scenario_frames; c public.app_config;
begin
  select * into r from public.scenario_runs where id = pg_temp.id('run');
  select * into sc from public.scenarios where id = r.scenario_id;
  select * into f from public.scenario_frames where scenario_id = sc.id and seq = p_seq;
  select * into c from public.app_config where id;
  perform private.apply_frame(r, sc, f, c, sc.shift_start_sim + make_interval(secs => f.sim_offset_ms / 1000.0), false);
end $$;
-- a direct alert through the engine
create or replace function pg_temp.raise(p_kind text, p_hk text, p_tier public.alert_tier, p_op text default 'op_ravi', p_machine text default 'ma')
returns uuid language sql as $$
  select private.raise_alert(pg_temp.id('run'), p_kind, p_hk, p_tier, pg_temp.id('site1'), pg_temp.id(p_op), pg_temp.id(p_machine), false) $$;
create or replace function pg_temp.vis(e public.events, p_role public.app_role, p_site uuid, p_op uuid) returns boolean language sql as $$
  select coalesce(private.event_visible(e, p_role, p_site, p_op), false) $$;
create or replace function pg_temp.evn(p_type text, p_alert uuid) returns bigint language sql as $$
  select count(*) from public.events e where e.type = p_type and e.alert_id = p_alert $$;

-- ── 1. the engine is B10's raise_alert, replaced in place: signature, privileges, the job ─────────
do $$
begin
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname = 'raise_alert') = 1, 'one raise_alert, no overload';
  assert exists (select 1 from cron.job where jobname = 'sos-escalator' and schedule = '1 seconds'
                   and command = 'select private.escalate_step();'), 'the sos-escalator job is scheduled every second';
  assert not has_function_privilege('authenticated', 'private.escalate_step(timestamptz)', 'execute'), 'no client can run the escalator';
  assert not has_function_privilege('authenticated', 'private.raise_alert(uuid, text, text, public.alert_tier, uuid, uuid, uuid, boolean, text)', 'execute');
  assert has_function_privilege('authenticated', 'public.alert_ack(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.alert_ack(uuid, uuid)', 'execute');
end $$;

-- ── 2. upgrade in place; dedupe; an acknowledged alert upgraded is raised again ───────────────────
do $$
declare a1 uuid; a2 uuid; a3 uuid; r public.alerts;
begin
  a1 := pg_temp.raise('seatbelt_off_moving', 'seatbelt:x1:UP-1', 'warning');
  select * into r from public.alerts where id = a1;
  assert r.status = 'open' and r.tier = 'warning' and r.needs_ack and r.escalate_at = now() + interval '20 seconds' and r.occurrences = 1 and r.epoch = 0,
    'a new warning: open, escalates in 20 s';
  assert pg_temp.raise('seatbelt_off_moving', 'seatbelt:x1:UP-1', 'warning') = a1 and pg_temp.raise('seatbelt_off_moving', 'seatbelt:x1:UP-1', 'caution') = a1,
    'same or lower tier merges into the same alert';
  select * into r from public.alerts where id = a1;
  assert r.occurrences = 3 and r.tier = 'warning' and r.epoch = 0 and jsonb_array_length(r.tier_history) = 0, 'occurrences counted, tier kept, no history';
  assert pg_temp.raise('seatbelt_off_moving', 'seatbelt:x1:UP-1', 'critical') = a1, 'a higher tier upgrades the SAME alert';
  select * into r from public.alerts where id = a1;
  assert r.tier = 'critical' and r.occurrences = 4 and r.epoch = 1 and r.tier_history -> 0 ->> 'from' = 'warning' and r.tier_history -> 0 ->> 'to' = 'critical',
    'upgraded in place with its history: ' || r.tier_history::text;
  assert (select count(*) from public.alerts where hazard_key = 'seatbelt:x1:UP-1') = 1, 'still one row';
  assert pg_temp.raise('seatbelt_off_moving', 'seatbelt:x1:UP-1', 'warning') = a1 and (select tier from public.alerts where id = a1) = 'critical', 'no downgrade';

  -- acknowledged, then upgraded: never merged away, it needs a fresh ack and escalates again
  a2 := pg_temp.raise('guardian_hazard', 'guardian:x2:UP-2', 'warning');
  perform private.ack_alert(a2, 'app', pg_temp.id('u_fm1'), 'fleet_manager');
  assert (select status from public.alerts where id = a2) = 'acknowledged' and (select escalate_at from public.alerts where id = a2) is null, 'acked: escalate_at cleared';
  assert pg_temp.raise('guardian_hazard', 'guardian:x2:UP-2', 'critical') = a2;
  select * into r from public.alerts where id = a2;
  assert r.status = 'open' and r.tier = 'critical' and r.ack_at is null and r.ack_by is null and r.escalate_at = now() + interval '15 seconds',
    'the upgrade of an acknowledged alert is open again with a new timer: ' || r.status::text;

  -- tier_max clamps
  a3 := pg_temp.raise('ppe_missing', 'ppe:x3:UP-3', 'critical');
  assert (select tier from public.alerts where id = a3) = 'caution', 'tier is clamped to the policy maximum';
  assert (select escalate_at from public.alerts where id = a3) is null and not (select needs_ack from public.alerts where id = a3), 'ppe: no ack, no timer';
  -- the interim B10 behaviour is unchanged: the engine itself creates no dispatch row for these
  assert (select count(*) from public.dispatches where alert_id in (a1, a2, a3)) = 0, 'raise_alert plans no dispatch (the escalator does)';
end $$;

-- ── 3. grouped suppression ───────────────────────────────────────────────────────────────────────
do $$
declare hi uuid; lo uuid; same uuid; other_subj uuid; other_grp uuid; later uuid; ev public.events; r public.alerts;
begin
  hi := pg_temp.raise('proximity_zone', 'proximity:p1:SUP-M1', 'warning');
  lo := pg_temp.raise('proximity_zone', 'proximity:p2:SUP-M1', 'caution', 'op_other');          -- same group and subject, lower tier
  select * into r from public.alerts where id = lo;
  assert r.status = 'suppressed' and r.suppress_reason = 'lower_tier' and r.suppressed_by = hi and r.escalate_at is null and not r.needs_ack,
    'a lower tier under an OPEN higher alert of the same group and subject is suppressed(lower_tier)';
  select * into ev from public.events where type = 'alert.suppressed' and alert_id = lo;
  assert ev.id is not null and ev.audiences = array['supervisor']::public.audience[] and ev.payload ->> 'reason' = 'lower_tier'
     and (ev.payload ->> 'suppressed_by')::uuid = hi, 'alert.suppressed, supervisor only: ' || coalesce(ev.payload::text, 'none');
  assert (select count(*) from public.alerts where hazard_key = 'proximity:p2:SUP-M1') = 1;

  same := pg_temp.raise('proximity_zone', 'proximity:p3:SUP-M1', 'warning', 'op_other');         -- equal tier: not suppressed
  assert (select status from public.alerts where id = same) = 'open', 'an equal tier is not suppressed';
  other_subj := pg_temp.raise('proximity_zone', 'proximity:p4:SUP-M2', 'caution', 'op_other');    -- another subject
  assert (select status from public.alerts where id = other_subj) = 'open', 'a different subject is never suppressed';
  other_grp := pg_temp.raise('guardian_hazard', 'guardian:p5:SUP-M1', 'warning', 'op_other');     -- another hazard group, same subject
  assert (select status from public.alerts where id = other_grp) = 'open', 'a different hazard group is never suppressed';

  perform private.ack_alert(hi, 'app', pg_temp.id('u_fm1'), 'fleet_manager');
  perform private.ack_alert(same, 'app', pg_temp.id('u_fm1'), 'fleet_manager');
  later := pg_temp.raise('proximity_zone', 'proximity:p6:SUP-M1', 'caution', 'op_other');
  assert (select status from public.alerts where id = later) = 'open', 'an acknowledged alert suppresses nothing';
  -- caution kinds only count toward the cap when they are not suppressed
  assert (select count(*) from public.alerts where id = lo and status = 'suppressed') = 1;
end $$;

-- ── 4. the rate cap (<= 6 info/caution per operator per 10 wall-minutes) and the flood summary ────
do $$
declare ids uuid[] := '{}'; x uuid; n int; f public.alerts; ev public.events; w uuid; sos uuid;
begin
  for n in 1..6 loop
    ids := ids || pg_temp.raise(case when n % 2 = 0 then 'ppe_missing' else 'anomaly_machine' end, 'k' || n || ':cap:S' || n,
                                'caution', 'op_cap', 'mb');
  end loop;
  assert (select count(*) from public.alerts where id = any (ids) and status = 'open') = 6, 'six capped-kind alerts pass';
  assert (select count(*) from public.alerts where kind = 'alert_flood' and hazard_key like 'flood:' || pg_temp.id('op_cap') || '%') = 0, 'no flood yet';
  x := pg_temp.raise('idle_excess', 'idle:cap:S7', 'info', 'op_cap', 'mb');
  assert (select status from public.alerts where id = x) = 'suppressed' and (select suppress_reason from public.alerts where id = x) = 'rate_cap',
    'the 7th is stored suppressed(rate_cap)';
  select * into f from public.alerts where kind = 'alert_flood' and hazard_key = 'flood:' || pg_temp.id('op_cap') || ':flood';
  assert f.id is not null and f.status = 'open' and f.tier = 'caution' and f.operator_id is null and f.site_id = pg_temp.id('site1') and f.occurrences = 1,
    'one alert_flood summary, for the fleet manager only (no operator)';
  x := pg_temp.raise('anomaly_machine', 'k8:cap:S8', 'caution', 'op_cap', 'mb');
  assert (select suppress_reason from public.alerts where id = x) = 'rate_cap', 'the 8th is capped too';
  select * into f from public.alerts where id = f.id;
  assert (select count(*) from public.alerts where kind = 'alert_flood' and hazard_key like 'flood:' || pg_temp.id('op_cap') || '%') = 1 and f.occurrences = 2,
    'the summary deduplicates (one alert, a counter): ' || f.occurrences::text;
  select * into ev from public.events where type = 'alert.raised' and alert_id = f.id;
  assert ev.id is not null and ev.operator_id is null and ev.payload ->> 'kind' = 'alert_flood'
     and pg_temp.vis(ev, 'fleet_manager', pg_temp.id('site1'), null)
     and not pg_temp.vis(ev, 'fleet_manager', pg_temp.id('site2'), null)
     and not pg_temp.vis(ev, 'operator', pg_temp.id('site1'), pg_temp.id('op_cap'))
     and not pg_temp.vis(ev, 'trainer', pg_temp.id('site1'), null), 'alert.raised for the flood: this site''s fleet manager only';

  -- not capped: another operator, a warning kind, SOS; and an old window
  x := pg_temp.raise('ppe_missing', 'ppe:cap2:S1', 'caution', 'op_cap2', 'mb');
  assert (select status from public.alerts where id = x) = 'open', 'the cap is per operator';
  w := pg_temp.raise('seatbelt_off_moving', 'seatbelt:cap:W1', 'warning', 'op_cap', 'mb');
  assert (select status from public.alerts where id = w) = 'open', 'warning kinds are never capped';
  sos := private.raise_alert(pg_temp.id('run'), 'sos', 'sos:' || pg_temp.id('op_cap') || ':' || gen_random_uuid(), 'critical',
                              pg_temp.id('site1'), pg_temp.id('op_cap'), pg_temp.id('mb'), false);
  assert (select status from public.alerts where id = sos) = 'open', 'SOS is never capped';
  update public.alerts set first_seen = now() - interval '11 minutes' where id = any (ids);
  x := pg_temp.raise('ppe_missing', 'ppe:cap:S9', 'caution', 'op_cap', 'mb');
  assert (select status from public.alerts where id = x) = 'open', 'the window is 10 wall-minutes: older alerts stop counting';
  -- catch-up alerts never count and are never dispatched
  assert (select count(*) from public.alerts where kind = 'alert_flood' and status = 'suppressed') = 0;
end $$;

-- ── 5. acknowledgement: CAS, idempotent, authorised ──────────────────────────────────────────────
create temp table ak (k text primary key, v uuid not null) on commit drop;
grant select on ak to authenticated;
insert into ak values ('own', pg_temp.raise('seatbelt_off_moving', 'seatbelt:ack:A1', 'warning')),
                      ('sosr', private.raise_alert(pg_temp.id('run'), 'sos', 'sos:' || pg_temp.id('op_ravi') || ':ackme', 'critical',
                                 pg_temp.id('site1'), pg_temp.id('op_ravi'), pg_temp.id('ma'), false));
create or replace function pg_temp.ak(text) returns uuid language sql as $$ select v from ak where k = $1 $$;
grant execute on function pg_temp.ak(text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; rid uuid := gen_random_uuid();
begin
  r := public.alert_ack(pg_temp.ak('own'), rid);
  assert r = jsonb_build_object('alert_id', pg_temp.ak('own'), 'status', 'acknowledged'), 'the operator acknowledges his own alert: ' || r::text;
  assert public.alert_ack(pg_temp.ak('own'), rid) = r, 'the same request again returns the same answer';
  assert public.alert_ack(pg_temp.ak('own'), gen_random_uuid()) = r, 'a different request id on an acknowledged alert is also a no-op';
  perform pg_temp.expect_err(format('select public.alert_ack(%L, %L)', pg_temp.ak('sosr'), gen_random_uuid()), 'forbidden');
  perform pg_temp.expect_err(format('select public.alert_ack(%L, null)', pg_temp.ak('own')), 'validation');
  perform pg_temp.expect_err(format('select public.alert_ack(%L, %L)', gen_random_uuid(), gen_random_uuid()), 'forbidden');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_other'), 'role', 'authenticated')::text, true);
do $$
begin
  perform pg_temp.expect_err(format('select public.alert_ack(%L, %L)', pg_temp.ak('own'), gen_random_uuid()), 'forbidden');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_fm2'), 'role', 'authenticated')::text, true);
do $$
begin
  perform pg_temp.expect_err(format('select public.alert_ack(%L, %L)', pg_temp.ak('sosr'), gen_random_uuid()), 'forbidden');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_tr1'), 'role', 'authenticated')::text, true);
do $$
begin
  perform pg_temp.expect_err(format('select public.alert_ack(%L, %L)', pg_temp.ak('sosr'), gen_random_uuid()), 'forbidden');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_fm1'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.alert_ack(pg_temp.ak('sosr'), gen_random_uuid());
  assert r ->> 'status' = 'acknowledged', 'the site''s fleet manager acknowledges an SOS';
end $$;
reset role;
do $$
declare ev public.events; r public.alerts;
begin
  select * into r from public.alerts where id = pg_temp.ak('own');
  assert r.status = 'acknowledged' and r.ack_via = 'app' and r.ack_by = pg_temp.id('u_ravi') and r.escalate_at is null, 'ack fields: ' || r.status::text;
  assert pg_temp.evn('alert.acknowledged', pg_temp.ak('own')) = 1, 'exactly one alert.acknowledged however many calls';
  select * into ev from public.events where type = 'alert.acknowledged' and alert_id = pg_temp.ak('own');
  assert ev.payload = jsonb_build_object('alert_id', pg_temp.ak('own'), 'via', 'app', 'by_role', 'operator') and ev.operator_id = pg_temp.id('op_ravi'),
    'AlertAcknowledged payload: ' || ev.payload::text;
  assert (select by_role from (select ev.payload ->> 'by_role' by_role) z) = 'operator';
  select * into ev from public.events where type = 'alert.acknowledged' and alert_id = pg_temp.ak('sosr');
  assert ev.payload ->> 'by_role' = 'fleet_manager', 'and the SOS ack names the role';
  -- the CAS: an escalated or escalating alert can still be acknowledged, a resolved one cannot
  update public.alerts set status = 'escalating' where id = pg_temp.ak('own');
  assert (private.ack_alert(pg_temp.ak('own'), 'telegram', null, 'fleet_manager')).status = 'acknowledged' and pg_temp.evn('alert.acknowledged', pg_temp.ak('own')) = 1,
    'acknowledged stays acknowledged (an ack is not repeated)';
end $$;

-- ── 6. resolution through the real engine (B10 open item) ─────────────────────────────────────────
select pg_temp.apply(11);                                                                      -- belt off, moving: the breach
do $$
declare a public.alerts;
begin
  select * into a from public.alerts where hazard_key = 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-B12-A';
  assert a.status = 'open' and a.escalate_at is not null and a.operator_id = pg_temp.id('op_ravi'), 'the breach alert is open with a timer';
  assert (select count(*) from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach' and machine_id = pg_temp.id('ma')) = 1,
    'B10: one breach, one event';
end $$;
select pg_temp.apply(12);                                                                      -- belt fastened
do $$
declare a public.alerts; ev public.events;
begin
  select * into a from public.alerts where hazard_key = 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-B12-A';
  assert a.status = 'resolved' and a.escalate_at is null and a.resolved_at is not null, 'a fastened belt resolves the alert and clears escalate_at: ' || a.status::text;
  assert pg_temp.evn('alert.resolved', a.id) = 1, 'one alert.resolved';
  select * into ev from public.events where type = 'alert.resolved' and alert_id = a.id;
  assert ev.payload = jsonb_build_object('alert_id', a.id, 'via', 'sensor') and ev.operator_id = pg_temp.id('op_ravi')
     and ev.audiences = array['operator', 'supervisor']::public.audience[], 'AlertResolved payload: ' || ev.payload::text;
  select * into ev from public.events where type = 'safety.seatbelt_resolved' and alert_id = a.id;
  assert ev.id is not null and ev.payload = jsonb_build_object('frame_seq', 12), 'and safety.seatbelt_resolved {frame_seq}: ' || coalesce(ev.payload::text, 'none');
  assert (select count(*) from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach' and machine_id = pg_temp.id('ma')) = 1,
    'resolving does not touch the breach event';
  perform private.escalate_step(now() + interval '1 hour');
  assert (select status from public.alerts where id = a.id) = 'resolved' and not exists (select 1 from public.dispatches where alert_id = a.id),
    'a resolved alert is never escalated';
  assert not private.resolve_alert(a.id), 'resolving twice changes nothing';
  assert pg_temp.evn('alert.resolved', a.id) = 1, 'and emits nothing';
end $$;
-- flap guard: the belt goes off again inside dedupe_window_s (120 s): the SAME alert reopens
select pg_temp.apply(13);
do $$
declare a public.alerts;
begin
  select * into a from public.alerts where hazard_key = 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-B12-A';
  assert (select count(*) from public.alerts where hazard_key = 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-B12-A') = 1, 'still one alert';
  assert a.status = 'open' and a.occurrences = 2 and a.epoch = 1 and a.resolved_at is null and a.escalate_at = now() + interval '20 seconds',
    'reopened with a counter and a fresh timer: ' || a.status::text || ' occ ' || a.occurrences::text;
  assert (select count(*) from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach' and machine_id = pg_temp.id('ma')) = 2,
    'the second breach is its own event';
end $$;
select pg_temp.apply(14);                                                                      -- resolved again (epoch 1)
do $$
declare a public.alerts;
begin
  select * into a from public.alerts where hazard_key = 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-B12-A';
  assert a.status = 'resolved' and pg_temp.evn('alert.resolved', a.id) = 2, 'a second cycle resolves with its own event';
  update public.alerts set resolved_at = now() - interval '121 seconds' where id = a.id;         -- outside the window
end $$;
select pg_temp.apply(15);
do $$
begin
  assert (select count(*) from public.alerts where hazard_key = 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-B12-A') = 2,
    'outside dedupe_window_s a recurrence is a NEW alert';
  assert (select count(*) from public.alerts where hazard_key = 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-B12-A' and status = 'open') = 1;
end $$;

-- ── 7. escalation timing: 60 s for SOS; ack beats escalation; escalation beats nothing ─────────────
do $$
declare s1 uuid; s2 uuid; r jsonb; a public.alerts; dp public.dispatches; ev public.events;
begin
  s1 := private.raise_alert(pg_temp.id('run'), 'sos', 'sos:' || pg_temp.id('op_ravi') || ':t60a', 'critical', pg_temp.id('site1'),
                            pg_temp.id('op_ravi'), pg_temp.id('ma'), false);
  select * into a from public.alerts where id = s1;
  assert a.status = 'open' and a.escalate_at = now() + interval '60 seconds' and a.needs_ack and a.tier = 'critical', 'SOS: critical, escalates at +60 s';
  -- planned inline: the Telegram message goes out (dry run) at level 0 in the same transaction
  select * into dp from public.dispatches where alert_id = s1;
  assert (select count(*) from public.dispatches where alert_id = s1) = 1 and dp.channel = 'telegram' and dp.recipient_role = 'fleet_manager'
     and dp.recipient_ref = 'TELEGRAM_SUPERVISOR_CHAT_ID' and dp.escalation_level = 0 and dp.purpose = 'alert' and dp.status = 'dry_run',
    'SOS dispatches to the supervisor at once, dry run: ' || dp.status::text;
  assert dp.recipient_ref !~ '[0-9]{6,}', 'a secret NAME, never a number';
  perform private.escalate_step(now() + interval '59 seconds');
  assert (select status from public.alerts where id = s1) = 'open' and (select count(*) from public.dispatches where alert_id = s1) = 1, 'at 59 s: nothing';
  perform private.escalate_step(now() + interval '60 seconds');
  select * into a from public.alerts where id = s1;
  assert a.status = 'escalating' and a.escalate_at is null and a.escalation_level = 1, 'at 60 s: escalating, level 1: ' || a.status::text;
  select * into dp from public.dispatches where alert_id = s1 and escalation_level = 1;
  assert dp.channel = 'twilio_voice' and dp.recipient_role = 'fleet_manager' and dp.recipient_ref = 'DEMO_SUPERVISOR_PHONE' and dp.purpose = 'escalation'
     and dp.status = 'dry_run', 'the supervisor call, dry run: ' || coalesce(dp.status::text, 'none');
  select * into ev from public.events where type = 'alert.escalated' and alert_id = s1;
  assert ev.payload = jsonb_build_object('alert_id', s1, 'level', 1, 'to', jsonb_build_array('supervisor_call')), 'alert.escalated payload: ' || coalesce(ev.payload::text, 'none');
  perform private.escalate_step(now() + interval '61 seconds');
  perform private.escalate_step(now() + interval '120 seconds');
  assert (select count(*) from public.dispatches where alert_id = s1) = 2 and pg_temp.evn('alert.escalated', s1) = 1, 'escalates ONCE however often the job runs';
  -- the supervisor presses 1 after the call: escalating -> acknowledged
  assert (private.ack_alert(s1, 'twilio_keypress', null, 'fleet_manager')).status = 'acknowledged', 'an ack still lands on an escalating alert';

  -- ack first, then the timer: no escalation, no call
  s2 := private.raise_alert(pg_temp.id('run'), 'sos', 'sos:' || pg_temp.id('op_ravi') || ':t60b', 'critical', pg_temp.id('site1'),
                            pg_temp.id('op_ravi'), pg_temp.id('ma'), false);
  perform private.ack_alert(s2, 'telegram', null, 'fleet_manager');
  perform private.escalate_step(now() + interval '61 seconds');
  assert (select status from public.alerts where id = s2) = 'acknowledged' and (select count(*) from public.dispatches where alert_id = s2) = 1
     and pg_temp.evn('alert.escalated', s2) = 0, 'acknowledged before 60 s: never escalated';
  -- a queued call that was never placed is withdrawn by the ack (trigger off so the test cannot touch pg_net)
  alter table public.dispatches disable trigger dispatches_kick_insert;
  insert into public.dispatches (alert_id, site_id, purpose, channel, recipient_ref, recipient_role, escalation_level, status)
    values (s2, pg_temp.id('site1'), 'escalation', 'twilio_voice', 'DEMO_SUPERVISOR_PHONE', 'fleet_manager', 5, 'queued');
  alter table public.dispatches enable trigger dispatches_kick_insert;
  update public.alerts set status = 'escalating' where id = s2;
  perform private.ack_alert(s2, 'telegram', null, 'fleet_manager');
  assert (select status from public.dispatches where alert_id = s2 and escalation_level = 5) = 'suppressed', 'an ack suppresses a queued call (G2-10)';
end $$;

-- ── 8. warning -> critical re-raises and dispatches; the seatbelt timer escalates to the supervisor ─
do $$
declare a uuid; b uuid; n int;
begin
  a := pg_temp.raise('seatbelt_off_moving', 'seatbelt:x9:DISP-1', 'warning', 'op_other', 'mc');
  perform private.escalate_step(now());
  assert (select dispatched_tier from public.alerts where id = a) = 'warning' and not exists (select 1 from public.dispatches where alert_id = a),
    'a warning waits for its timer: nothing sent, tier recorded';
  assert pg_temp.raise('seatbelt_off_moving', 'seatbelt:x9:DISP-1', 'critical', 'op_other', 'mc') = a;
  perform private.escalate_step(now());
  assert (select count(*) from public.dispatches where alert_id = a) = 1, 'the upgrade to critical dispatches now';
  assert (select channel from public.dispatches where alert_id = a) = 'telegram' and (select status from public.dispatches where alert_id = a) = 'dry_run'
     and (select escalation_level from public.dispatches where alert_id = a) = 0, 'to the supervisor, level 0, dry run';
  perform private.escalate_step(now());
  assert (select count(*) from public.dispatches where alert_id = a) = 1, 'idempotent: the same tier dispatches once';
  perform private.escalate_step(now() + interval '21 seconds');
  assert (select status from public.alerts where id = a) = 'escalating' and (select count(*) from public.dispatches where alert_id = a) = 2
     and (select escalation_level from public.dispatches where alert_id = a order by escalation_level desc limit 1) = 1, 'the ack timeout (the upgrade re-armed it) escalates at level 1';

  -- a warning that is never upgraded escalates on its timer
  b := pg_temp.raise('seatbelt_off_moving', 'seatbelt:x9:DISP-2', 'warning', 'op_other', 'mc');
  perform private.escalate_step(now() + interval '19 seconds');
  assert (select status from public.alerts where id = b) = 'open', 'before the timeout: open';
  perform private.escalate_step(now() + interval '20 seconds');
  assert (select status from public.alerts where id = b) = 'escalating' and (select count(*) from public.dispatches where alert_id = b and channel = 'telegram') = 1, 'at 20 s: the supervisor';
  -- the flood summary dispatches as a flood_summary
  perform private.escalate_step(now());
  assert exists (select 1 from public.dispatches d join public.alerts f on f.id = d.alert_id
                  where f.kind = 'alert_flood' and f.hazard_key = 'flood:' || pg_temp.id('op_cap') || ':flood'
                    and d.purpose = 'flood_summary' and d.channel = 'telegram' and d.status = 'dry_run'), 'the flood summary goes to the supervisor, dry run';
end $$;

-- ── 9. the motion-lock matrix for operator calls (can_call_operator, shared with motion_locked) ───
create or replace function pg_temp.guard(p_op text, p_machine text) returns uuid language sql as $$
  select pg_temp.raise('guardian_hazard', 'guardian:' || pg_temp.id(p_op) || ':' || p_machine, 'critical', p_op, 'ma') $$;
do $$
declare a uuid; dp public.dispatches; ev public.events;
begin
  perform pg_temp.guard('m1', 'MX1'); perform pg_temp.guard('m2', 'MX2'); perform pg_temp.guard('m3', 'MX3');
  perform pg_temp.guard('m4', 'MX4'); perform pg_temp.guard('m5', 'MX5'); perform pg_temp.guard('m6', 'MX6');
  perform private.escalate_step(now());
  -- critical => external NOW: operator call + supervisor Telegram, same level
  assert (select count(*) from public.dispatches d join public.alerts x on x.id = d.alert_id where x.hazard_key like 'guardian:' || pg_temp.id('m1') || ':%') = 2, 'guardian critical: two rows';
  assert (select count(*) from public.dispatches d join public.alerts x on x.id = d.alert_id
           where x.hazard_key like 'guardian:' || pg_temp.id('m1') || ':%' and d.channel = 'telegram' and d.recipient_role = 'fleet_manager' and d.status = 'dry_run') = 1;
  -- the matrix
  assert (select d.status from public.dispatches d join public.alerts x on x.id = d.alert_id
           where x.hazard_key like 'guardian:' || pg_temp.id('m1') || ':%' and d.recipient_role = 'operator') = 'dry_run', 'on foot: the call is allowed (dry run)';
  assert (select d.status from public.dispatches d join public.alerts x on x.id = d.alert_id
           where x.hazard_key like 'guardian:' || pg_temp.id('m2') || ':%' and d.recipient_role = 'operator') = 'dry_run', 'parked cab: allowed';
  assert (select d.status || ':' || (d.error ->> 'reason') from public.dispatches d join public.alerts x on x.id = d.alert_id
           where x.hazard_key like 'guardian:' || pg_temp.id('m3') || ':%' and d.recipient_role = 'operator') = 'suppressed:motion_lock', 'moving cab: suppressed(motion_lock)';
  assert (select d.status || ':' || (d.error ->> 'reason') from public.dispatches d join public.alerts x on x.id = d.alert_id
           where x.hazard_key like 'guardian:' || pg_temp.id('m4') || ':%' and d.recipient_role = 'operator') = 'suppressed:state_unknown', 'no state: suppressed(state_unknown)';
  assert (select d.status || ':' || (d.error ->> 'reason') from public.dispatches d join public.alerts x on x.id = d.alert_id
           where x.hazard_key like 'guardian:' || pg_temp.id('m5') || ':%' and d.recipient_role = 'operator') = 'suppressed:state_unknown', 'stale state: suppressed(state_unknown)';
  assert (select d.status from public.dispatches d join public.alerts x on x.id = d.alert_id
           where x.hazard_key like 'guardian:' || pg_temp.id('m3') || ':%' and d.channel = 'telegram') = 'dry_run', 'the supervisor Telegram is never blocked by the lock';
  -- the same predicate behind operator_state.motion_locked
  assert (private.can_call_operator(pg_temp.id('run'), pg_temp.id('m3')) ->> 'motion_locked')::boolean and not (private.can_call_operator(pg_temp.id('run'), pg_temp.id('m1')) ->> 'motion_locked')::boolean,
    'the matrix and motion_locked read one function';
  -- cooldown: m6 is on foot (allowed), a first call goes out, a second hazard inside 60 s is suppressed
  perform pg_temp.guard('m6', 'MX6B');
  perform private.escalate_step(now());
  assert (select d.status || ':' || coalesce(d.error ->> 'reason', '') from public.dispatches d join public.alerts x on x.id = d.alert_id
           where x.hazard_key = 'guardian:' || pg_temp.id('m6') || ':MX6B' and d.recipient_role = 'operator') = 'suppressed:call_cooldown', 'a second call inside 60 s: suppressed(call_cooldown)';
  -- the denied call is announced to the cockpit and the supervisor
  select * into ev from public.events e where e.type = 'dispatch.suppressed' and e.operator_id = pg_temp.id('m3');
  assert ev.id is not null and ev.payload ->> 'reason' = 'motion_lock' and ev.payload ->> 'channel' = 'twilio_voice' and ev.payload ->> 'status' = 'suppressed'
     and pg_temp.vis(ev, 'operator', pg_temp.id('site1'), pg_temp.id('m3')) and pg_temp.vis(ev, 'fleet_manager', pg_temp.id('site1'), null)
     and not pg_temp.vis(ev, 'operator', pg_temp.id('site1'), pg_temp.id('m1'))
     and not pg_temp.vis(ev, 'fleet_manager', pg_temp.id('site2'), null) and not pg_temp.vis(ev, 'trainer', pg_temp.id('site1'), null),
    'dispatch.suppressed(motion_lock): that operator and this site''s supervisor, nobody else';
end $$;

-- ── 10. the escalator does not depend on the tick or the Loop (poison frame + raising build_replay) ─
do $$
declare sos1 uuid; r jsonb; ev public.events;
begin
  sos1 := private.raise_alert(pg_temp.id('run'), 'sos', 'sos:' || pg_temp.id('op_ravi') || ':indep', 'critical', pg_temp.id('site1'),
                           pg_temp.id('op_ravi'), pg_temp.id('ma'), false);
  -- a poison frame fails the tick
  update public.scenario_runs set status = 'playing', is_current = true, speed = 1, sim_anchor = (select shift_start from s) + interval '10 seconds',
         wall_anchor = now(), cursor_seq = 0 where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'errors')::int >= 1 and exists (select 1 from private.tick_errors where run_id = pg_temp.id('run') and frame_seq = 1), 'the poison frame failed the tick: ' || r::text;
  -- a build_replay raises (a breach with nobody at the controls)
  perform pg_temp.apply(401);
  delete from private.loop_queue where event_id not in (select id from public.events where run_id = pg_temp.id('run'));
  select * into ev from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach' and machine_id = pg_temp.id('mb');
  perform private.step_loop(20);
  assert (select error like 'replay:%' from private.loop_queue where event_id = ev.id), 'build_replay raised and was recorded on the queue row';
  -- the escalator still escalates, once, at 60 s
  perform private.escalate_step(now() + interval '60 seconds');
  assert (select status from public.alerts where id = sos1) = 'escalating' and (select count(*) from public.dispatches where alert_id = sos1 and channel = 'twilio_voice') = 1,
    'SOS escalated while a poison frame failed the tick and a build_replay raised';
  assert (select count(*) from public.events where id = ev.id) = 1 and exists (select 1 from public.alerts where origin_event_id = ev.id), 'and the breach event and its alert are intact';
end $$;

-- ── 11. no overlap: the escalator takes no advisory lock, no pg_net, claims with skip locked ───────
do $$
declare def text;
begin
  def := pg_get_functiondef('private.escalate_step(timestamptz)'::regprocedure);
  assert def ilike '%for update skip locked%', 'escalate_step claims rows with FOR UPDATE SKIP LOCKED';
  assert def !~* 'advisory' and def !~* 'pg_try_advisory' and def !~* '4210001|4210002', 'and takes no advisory lock';
  assert def !~* '(^|[^a-z_])net\.' and def !~* 'http_post' and def !~* 'twilio\.com|api\.telegram\.org', 'and never touches pg_net or a provider URL';
  assert pg_get_functiondef('private.alert_dispatch(uuid,text[],text)'::regprocedure) !~* '(^|[^a-z_])net\.|http_post|twilio\.com|api\.telegram\.org', 'nor does the dispatch planner';
  assert pg_get_functiondef('private.raise_alert(uuid,text,text,public.alert_tier,uuid,uuid,uuid,boolean,text)'::regprocedure) !~* '(^|[^a-z_])net\.|http_post|advisory',
    'nor does raise_alert';
  assert (select prosrc from pg_proc where oid = 'private.alert_dispatch_status()'::regprocedure) ilike '%dry_run%', 'the single status switch says dry_run';
  assert (select dry_run_external from public.app_config where id), 'app_config.dry_run_external stays on';
end $$;

-- ── 12. DRY RUN ONLY: nothing but dry_run/suppressed; nothing handed to pg_net ─────────────────────
do $$
begin
  assert (select count(*) from public.dispatches d join public.alerts a on a.id = d.alert_id where a.run_id = pg_temp.id('run')) >= 10,
    'the file produced plenty of dispatch rows to judge';
  assert not exists (select 1 from public.dispatches d join public.alerts a on a.id = d.alert_id
                      where a.run_id = pg_temp.id('run') and d.status not in ('dry_run', 'suppressed')), 'every row this file produced is dry_run or suppressed';
  assert not exists (select 1 from public.dispatches d join public.alerts a on a.id = d.alert_id
                      where a.run_id = pg_temp.id('run') and d.provider_ref is not null), 'no provider reference anywhere';
  assert not exists (select 1 from net.http_request_queue q join public.dispatches d on d.alert_id in (select id from public.alerts where run_id = pg_temp.id('run'))
                      where position(d.id::text in convert_from(q.body, 'UTF8')) > 0), 'no dispatch of this file was handed to pg_net';
  assert not exists (select 1 from net.http_request_queue q where q.url ~* 'twilio|telegram'), 'and no provider URL is in it';
end $$;

-- ── 13. privacy (D16): alert events never reach the trainer; a sealed near miss never reaches the FM ──
do $$
declare ev public.events;
begin
  assert not exists (select 1 from public.events e where e.run_id = pg_temp.id('run') and e.type like 'alert.%' and 'trainer' = any (e.audiences)),
    'no alert.* event is addressed to the trainer';
  assert not exists (select 1 from public.events e where e.run_id = pg_temp.id('run') and e.type like 'alert.%' and 'site' = any (e.audiences)),
    'nor to the whole site';
  for ev in select * from public.events e where e.run_id = pg_temp.id('run') and e.type in ('alert.acknowledged', 'alert.escalated', 'alert.resolved') loop
    assert not pg_temp.vis(ev, 'trainer', pg_temp.id('site1'), null) and not pg_temp.vis(ev, 'fleet_manager', pg_temp.id('site2'), null),
      'alert event ' || ev.type || ' is invisible to the trainer and to another site''s manager';
  end loop;
  -- the engine never reads or writes incidents: a sealed near miss stays where §2.10 put it
  assert pg_get_functiondef('private.escalate_step(timestamptz)'::regprocedure) !~* 'incidents|near_miss'
     and pg_get_functiondef('private.raise_alert(uuid,text,text,public.alert_tier,uuid,uuid,uuid,boolean,text)'::regprocedure) !~* 'incidents|near_miss',
    'the engine does not touch incidents or near-miss data';
end $$;
