-- B4: events, emit_event idempotency and queues, append-only, SOS dedupe exclusion, dispatch outbox,
-- per-audience RLS and Realtime topics, my_snapshot shape. Runs inside begin … rollback.
create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t values
  ('site', gen_random_uuid()), ('op_ravi', gen_random_uuid()), ('op_other', gen_random_uuid()),
  ('u_ravi', gen_random_uuid()), ('u_anita', gen_random_uuid()), ('u_trainer', gen_random_uuid()),
  ('machine', gen_random_uuid()), ('scenario', gen_random_uuid()), ('run', gen_random_uuid()), ('task', gen_random_uuid()),
  ('sos1', gen_random_uuid()), ('sos2', gen_random_uuid());
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;
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
insert into public.scenario_runs (id, scenario_id, sim_anchor, is_current, status) values (pg_temp.id('run'), pg_temp.id('scenario'), now(), true, 'playing');
insert into public.operator_pairings (run_id, operator_id, machine_id) values (pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('machine'));
insert into public.tasks (id, run_id, operator_id, machine_id, site_id, task_type, planned_start, planned_cycles, eta_factors) values
  (pg_temp.id('task'), pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('machine'), pg_temp.id('site'), 'excavation', now(), 120, '[{"key":"weather:hot","multiplier":1.11,"assumed":false}]'),
  (gen_random_uuid(), pg_temp.id('run'), pg_temp.id('op_other'), pg_temp.id('machine'), pg_temp.id('site'), 'grading', now(), 80, null);
insert into public.machine_state (run_id, machine_id, ts, speed_kmh, moving, location) values
  (pg_temp.id('run'), pg_temp.id('machine'), now(), 6.2, true, extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.operator_state (run_id, operator_id, ts, on_foot, ppe) values (pg_temp.id('run'), pg_temp.id('op_ravi'), now(), false, '{"helmet": true}');
insert into public.weather_snapshots (site_id, run_id, ts, temperature_c, wind_kmh, wbgt_c) values (pg_temp.id('site'), pg_temp.id('run'), now(), 38.5, 12, 31.2);

-- registry seed present (parity with EVENT_REGISTRY is asserted by scripts/db-contracts.test.ts)
do $$
begin
  assert (select count(*) from public.event_types) = 47, 'event_types rows';
  assert (select count(*) from public.alert_policies) = 9, 'alert_policies rows';
  assert (select count(*) from public.explanation_templates) = 7, 'explanation_templates rows';
  assert (select ledger from public.event_types where type = 'safety.seatbelt_breach'), 'seatbelt is a ledger type';
  assert (select notify_now from public.alert_policies where kind = 'sos') = array['supervisor_telegram'], 'sos notify_now';
end $$;

-- emit_event: registry defaults, queues, idempotency (no double enqueue), unknown type refused
do $$
declare e1 public.events; e2 public.events; k text := 'det:' || pg_temp.id('run') || ':EXC-T01:seatbelt_off_moving:1812';
begin
  e1 := private.emit_event('safety.seatbelt_breach', '{"frame_seq": 1812, "speed_kmh": 6.2, "pitch_deg": 17.4, "roll_deg": 2, "slope_limit_deg": 15, "zone_id": null}'::jsonb,
                           k, 'detector.rule', pg_temp.id('site'), pg_temp.id('run'), pg_temp.id('machine'), pg_temp.id('op_ravi'), pg_temp.id('task'));
  assert e1.tier = 'warning', 'default tier from the registry';
  assert e1.audiences = array['operator', 'supervisor', 'trainer']::public.audience[], 'audiences from the registry';
  assert (select count(*) from private.ledger_queue where idempotency_key = 'ledger:' || k) = 1, 'one ledger queue row';
  assert (select count(*) from private.loop_queue where event_id = e1.id) = 1, 'one loop queue row';
  e2 := private.emit_event('safety.seatbelt_breach', '{}'::jsonb, k, 'detector.rule', pg_temp.id('site'), pg_temp.id('run'));
  assert e2.id = e1.id, 'duplicate key returns the original event';
  assert (select count(*) from public.events where idempotency_key = k) = 1, 'no duplicate event';
  assert (select count(*) from private.ledger_queue where idempotency_key = 'ledger:' || k) = 1, 'no double enqueue';
  assert (select count(*) from private.loop_queue where event_id = e1.id) = 1, 'no double loop enqueue';
  -- a type without ledger/lesson flags touches no queue
  e2 := private.emit_event('task.progress', ('{"task_id": "' || pg_temp.id('task') || '", "status": "in_progress", "progress_pct": 10, "eta_p50_min": null, "eta_p90_min": null}')::jsonb,
                           'sys:test:progress:1', 'system', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op_ravi'), pg_temp.id('task'));
  assert (select count(*) from private.ledger_queue) = 1 and (select count(*) from private.loop_queue) = 1, 'plain event queues nothing';
  begin
    perform private.emit_event('safety.nope', '{}'::jsonb, 'x:1', 'system', pg_temp.id('site'));
    raise exception 'unknown type accepted';
  exception when raise_exception then
    if sqlerrm not like 'unknown event type%' then raise; end if;
  end;
  begin
    update public.events set payload = '{}' where id = e1.id;
    raise exception 'events were updatable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- supervisor-only event (for the RLS matrix below)
select private.emit_event('alert.suppressed', ('{"alert_id": "' || pg_temp.id('sos1') || '", "reason": "dedupe", "suppressed_by": null}')::jsonb,
                          'sys:test:supp:1', 'system', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op_other'));

-- alerts: two SOS rows coexist; a second open alert with the same non-SOS hazard key is refused
insert into public.alerts (id, run_id, kind, hazard_key, tier, operator_id, site_id, needs_ack, escalate_at) values
  (pg_temp.id('sos1'), pg_temp.id('run'), 'sos', 'sos:' || pg_temp.id('op_ravi') || ':1', 'critical', pg_temp.id('op_ravi'), pg_temp.id('site'), true, now() + interval '60 seconds'),
  (pg_temp.id('sos2'), pg_temp.id('run'), 'sos', 'sos:' || pg_temp.id('op_ravi') || ':1', 'critical', pg_temp.id('op_ravi'), pg_temp.id('site'), true, now() + interval '60 seconds');
insert into public.alerts (run_id, kind, hazard_key, tier, operator_id, machine_id, site_id, needs_ack, escalate_at) values
  (pg_temp.id('run'), 'seatbelt_off_moving', 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-T01', 'warning', pg_temp.id('op_ravi'), pg_temp.id('machine'), pg_temp.id('site'), true, now() + interval '20 seconds');
do $$
begin
  begin
    insert into public.alerts (run_id, kind, hazard_key, tier, operator_id, site_id) values
      (pg_temp.id('run'), 'seatbelt_off_moving', 'seatbelt:' || pg_temp.id('op_ravi') || ':EXC-T01', 'warning', pg_temp.id('op_ravi'), pg_temp.id('site'));
    raise exception 'duplicate active hazard accepted';
  exception when unique_violation then null;
  end;
  assert (select count(*) from public.alerts where kind = 'sos') = 2, 'two SOS alerts coexist';
end $$;

-- dispatches: one row per (subject, purpose, channel, role, level); the kick trigger queues a pg_net request (sent only on commit)
insert into public.dispatches (alert_id, purpose, channel, recipient_ref, recipient_role, escalation_level) values
  (pg_temp.id('sos1'), 'alert', 'telegram', 'TELEGRAM_SUPERVISOR_CHAT_ID', 'fleet_manager', 0);
do $$
begin
  begin
    insert into public.dispatches (alert_id, purpose, channel, recipient_ref, recipient_role, escalation_level) values
      (pg_temp.id('sos1'), 'alert', 'telegram', 'TELEGRAM_SUPERVISOR_CHAT_ID', 'fleet_manager', 0);
    raise exception 'duplicate dispatch accepted';
  exception when unique_violation then null;
  end;
  assert (select status from public.dispatches where alert_id = pg_temp.id('sos1')) = 'queued', 'dispatch queued (vault secrets present)';
end $$;

-- ── RLS and Realtime topics per role ─────────────────────────────────────────────────────────────
-- realtime.send only lands rows when the Realtime service has created today's partition of realtime.messages
-- (it does so after a client connects; scripts/b0/realtime-wake.ts). Without it the topic assertions below
-- would fail for an environmental reason, so they are guarded and the guard is loud.
create temp table rt (enabled boolean not null) on commit drop;
insert into rt select exists (select 1 from pg_inherits where inhparent = 'realtime.messages'::regclass);
grant select on rt to authenticated;
do $$
begin
  if not (select enabled from rt) then
    raise warning 'realtime.messages has no partition: Realtime topic assertions skipped (run scripts/b0/realtime-wake.ts)';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
declare snap jsonb;
begin
  assert (select count(*) from public.events where type = 'safety.seatbelt_breach') = 1, 'OP sees own seatbelt event';
  assert (select count(*) from public.events where type = 'alert.suppressed') = 0, 'OP does not see supervisor-only events';
  assert (select count(*) from public.alerts) = 3, 'OP sees own alerts';
  assert (select count(*) from public.dispatches) = 0, 'OP sees no dispatches';
  if (select enabled from rt) then
    perform set_config('realtime.topic', 'op:' || pg_temp.id('op_ravi'), true);
    assert (select count(*) from realtime.messages where extension = 'broadcast') >= 1, 'OP receives on op:{me}';
    perform set_config('realtime.topic', 'sup:' || pg_temp.id('site'), true);
    assert (select count(*) from realtime.messages where extension = 'broadcast') = 0, 'OP is refused sup:{site}';
  end if;
  snap := public.my_snapshot();
  assert snap ->> 'contracts_version' = '1.0.0', 'snapshot version';
  assert snap -> 'profile' ->> 'role' = 'operator', 'snapshot role';
  assert (snap -> 'run' ->> 'status') = 'playing' and (snap -> 'run' ->> 'sim_now') is not null, 'snapshot run';
  assert snap -> 'site' ->> 'emergency_tel' is not null, 'emergency tel from vault';
  assert (snap ->> 'paired_machine_id')::uuid = pg_temp.id('machine'), 'paired machine';
  assert jsonb_array_length(snap -> 'tasks') = 1, 'own tasks';
  assert jsonb_array_length(snap -> 'active_alerts') = 3, 'active alerts';
  assert snap -> 'machine' ->> 'code' = 'EXC-T01' and (snap -> 'machine' ->> 'moving')::boolean, 'machine state';
  assert (snap -> 'operator_state' ->> 'motion_locked')::boolean, 'motion lock default deny';
  assert (snap -> 'weather' ->> 'temperature_c')::numeric = 38.5, 'weather';
  assert jsonb_array_length(snap -> 'recent_events') = 2, 'recent events (seatbelt + task.progress)';
  assert snap -> 'recent_events' -> 0 ->> 'type' = 'task.progress', 'newest first';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_anita'), 'role', 'authenticated')::text, true);
do $$
declare snap jsonb;
begin
  assert (select count(*) from public.events) = 3, 'FM sees every site event';
  assert (select count(*) from public.dispatches) = 1, 'FM sees dispatches';
  if (select enabled from rt) then
    perform set_config('realtime.topic', 'sup:' || pg_temp.id('site'), true);
    assert (select count(*) from realtime.messages where extension = 'broadcast') >= 1, 'FM receives on sup:{site}';
    perform set_config('realtime.topic', 'op:' || pg_temp.id('op_ravi'), true);
    assert (select count(*) from realtime.messages where extension = 'broadcast') = 0, 'FM is refused op:{ravi}';
  end if;
  snap := public.my_snapshot();
  assert jsonb_array_length(snap -> 'tasks') = 2, 'FM snapshot lists site tasks';
  assert snap -> 'operator_state' is null or snap -> 'operator_state' = 'null'::jsonb, 'FM has no operator state';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_trainer'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.events) = 1, 'TR sees trainer-audience events only';
  if (select enabled from rt) then
    perform set_config('realtime.topic', 'train:' || pg_temp.id('site'), true);
    assert (select count(*) from realtime.messages where extension = 'broadcast') >= 1, 'TR receives on train:{site}';
  end if;
end $$;
reset role;
