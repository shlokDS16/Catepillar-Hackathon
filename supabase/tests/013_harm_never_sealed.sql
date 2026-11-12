-- 003i: harm is never sealed at the single source of truth (event_is_sealed, the ledger computation, the
-- gate trigger), by flag or by inference, for every event type; severity parsed as a number.
-- Runs inside begin … rollback.

create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t values ('site', gen_random_uuid()), ('op', gen_random_uuid()), ('u_anita', gen_random_uuid()), ('run', gen_random_uuid()),
  ('scenario', gen_random_uuid()), ('machine', gen_random_uuid());
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;
grant execute on function pg_temp.id(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('u_anita'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'anita2@sqltest.local', '', now(), '{}', '{}', now(), now());
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site'), 'SQLTHARM', 'sqltest harm quarry', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op'), 'OP-H001', 'Harm test', 'novice', pg_temp.id('site'), 'Operator-H01');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_anita'), 'fleet_manager', null, pg_temp.id('site'), 'Anita');
insert into public.machines (id, code, home_site_id) values (pg_temp.id('machine'), 'EXC-H01', pg_temp.id('site'));
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version) values
  (pg_temp.id('scenario'), 'sqltest-harm', 1, pg_temp.id('site'), now(), interval '8 hours', 'test');
insert into public.scenario_runs (id, scenario_id, sim_anchor, is_current, status) values
  (pg_temp.id('run'), pg_temp.id('scenario'), now(), true, 'playing');

create or replace function pg_temp.emit_inc(p jsonb, k text) returns void language sql as $$
  select private.emit_event('incident.reported', p, k, 'user', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op')) $$;

-- ── 1. the gate: refused with validation + hint ─────────────────────────────────────────────────
do $$
declare v_hint text; v_msg text; k int := 0; p jsonb;
begin
  foreach p in array array[
    '{"incident_type": "near_miss", "severity": 5, "description": "x"}'::jsonb,                       -- inference, no flag
    '{"incident_type": "near_miss", "severity": "5", "description": "x"}'::jsonb,                      -- string severity
    '{"incident_type": "near_miss", "severity": 5.0, "description": "x"}'::jsonb,
    '{"incident_type": "near_miss", "severity": " 5 ", "description": "x", "non_punitive": true}'::jsonb,
    '{"incident_type": "manual", "severity": "5", "description": "x", "non_punitive": true}'::jsonb,
    '{"incident_type": "near_miss", "severity": "abc", "description": "x"}'::jsonb,                    -- non-numeric
    '{"incident_type": "near_miss", "severity": 2.5, "description": "x"}'::jsonb,                      -- fractional
    '{"incident_type": "near_miss", "severity": true, "description": "x"}'::jsonb,
    '{"incident_type": "first_aid", "severity": 3, "description": "x", "non_punitive": true}'::jsonb] loop
    k := k + 1;
    begin
      perform pg_temp.emit_inc(p, 'harm:g:' || k);
      raise exception 'accepted: %', p;
    exception when raise_exception then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
      if v_msg <> 'validation' then raise; end if;
      assert v_hint is not null and length(v_hint) > 10, 'a hint for ' || p::text;
    end;
  end loop;
  -- any event type: a critical tier that asks to be sealed
  begin
    perform private.emit_event('safety.seatbelt_breach', '{"non_punitive": true, "speed_kmh": 5}'::jsonb, 'harm:g:crit', 'detector.rule',
      pg_temp.id('site'), pg_temp.id('run'), pg_temp.id('machine'), pg_temp.id('op'), null::uuid, null::uuid, now(), 'critical');
    raise exception 'a sealed critical seatbelt event was accepted';
  exception when raise_exception then
    if sqlerrm <> 'validation' then raise; end if;
  end;
  begin
    perform private.emit_event('ppe.override_granted', '{"non_punitive": true, "reason": "r"}'::jsonb, 'harm:g:crit2', 'user',
      pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op'), null::uuid, null::uuid, null::timestamptz, 'critical');
    raise exception 'a sealed critical ppe override was accepted';
  exception when raise_exception then
    if sqlerrm <> 'validation' then raise; end if;
  end;
  assert not exists (select 1 from public.events where idempotency_key like 'harm:g:%'), 'refused events leave no row';
  -- severity as number or numeric string is accepted for a non-harm report
  perform pg_temp.emit_inc('{"incident_type": "manual", "severity": "3", "description": "ok"}'::jsonb, 'harm:ok:1');
  perform pg_temp.emit_inc('{"incident_type": "manual", "severity": 4.0, "description": "ok"}'::jsonb, 'harm:ok:2');
end $$;

-- ── 2. defence in depth: with the gate off, the source of truth still refuses to seal harm ──────
alter table public.events disable trigger events_refuse_sealed_harm;
do $$
declare n int; e public.events;
begin
  perform pg_temp.emit_inc('{"incident_type": "near_miss", "severity": 5, "description": "inferred"}'::jsonb, 'harm:d:1');          -- inference
  perform pg_temp.emit_inc('{"incident_type": "near_miss", "severity": "5", "description": "str", "non_punitive": true}'::jsonb, 'harm:d:2');
  perform pg_temp.emit_inc('{"incident_type": "near_miss", "severity": 3, "description": "genuine"}'::jsonb, 'harm:d:4');
  perform pg_temp.emit_inc('{"incident_type": "near_miss", "severity": 3, "description": "genuine flagged", "non_punitive": true}'::jsonb, 'harm:d:5');
  perform private.emit_event('safety.seatbelt_breach', '{"non_punitive": true, "speed_kmh": 5}'::jsonb, 'harm:d:6', 'detector.rule',
    pg_temp.id('site'), pg_temp.id('run'), pg_temp.id('machine'), pg_temp.id('op'), null::uuid, null::uuid, now(), 'critical');
  perform private.emit_event('sos.raised', '{"alert_id": "00000000-0000-4000-8000-000000000002", "non_punitive": true}'::jsonb,
    'harm:d:7', 'user', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op'));

  for e in select * from public.events where idempotency_key in ('harm:d:1', 'harm:d:2', 'harm:d:6', 'harm:d:7') loop
    assert private.event_is_harm(e) and not private.event_is_sealed(e), 'harm event not sealed: ' || e.idempotency_key;
  end loop;
  for e in select * from public.events where idempotency_key in ('harm:d:4', 'harm:d:5') loop
    assert not private.event_is_harm(e) and private.event_is_sealed(e), 'genuine near miss stays sealed: ' || e.idempotency_key;
  end loop;

  n := private.ledger_drain();
  assert n = 8, 'eight entries written (6 above + 2 ok), got ' || n;
  assert (select count(*) from public.incidents where site_id = pg_temp.id('site') and non_punitive) = 2, 'only the two genuine near misses are sealed in the ledger';
  assert (select bool_and(not non_punitive) from public.incidents
           where site_id = pg_temp.id('site') and (severity >= 5 or incident_type::text in ('first_aid', 'sos'))), 'no harm row is sealed in the ledger';
  -- malformed severity counts as harm (event_is_sealed is read by RLS and must never raise)
  perform pg_temp.emit_inc('{"incident_type": "near_miss", "severity": "abc", "description": "bad", "non_punitive": true}'::jsonb, 'harm:d:3');
  select * into e from public.events where idempotency_key = 'harm:d:3';
  assert private.event_is_harm(e) and not private.event_is_sealed(e), 'malformed severity is harm and unsealed';
end $$;
alter table public.events enable trigger events_refuse_sealed_harm;

-- ── 3. the supervisor sees harm, still not the genuine near misses ───────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_anita'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.events where idempotency_key in ('harm:d:1', 'harm:d:2', 'harm:d:3', 'harm:d:6', 'harm:d:7')) = 5,
    'the supervisor reads every harm event';
  assert (select count(*) from public.events where idempotency_key in ('harm:d:4', 'harm:d:5')) = 0, 'genuine near-miss events stay hidden';
  assert (select count(*) from public.incidents where site_id = pg_temp.id('site') and incident_type = 'near_miss' and severity = 3) = 0,
    'genuine near-miss rows stay hidden';
end $$;
reset role;
