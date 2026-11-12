-- 003j: the seal predicate is not callable by a client, event_visible ignores a crafted row, and RLS on events
-- is unchanged. Runs inside begin … rollback.

create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t values ('site', gen_random_uuid()), ('op', gen_random_uuid()), ('u_op', gen_random_uuid()), ('u_fm', gen_random_uuid()),
  ('run', gen_random_uuid()), ('scenario', gen_random_uuid());
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;
grant execute on function pg_temp.id(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(k), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', k || '@sqltest014.local', '', now(), '{}', '{}', now(), now()
from (values ('u_op'), ('u_fm')) v(k);
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site'), 'SQLT014', 'sqltest 014 quarry', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op'), 'OP-014', 'Seal oracle test', 'novice', pg_temp.id('site'), 'Operator-S14');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_op'), 'operator', pg_temp.id('op'), pg_temp.id('site'), 'Op'),
  (pg_temp.id('u_fm'), 'fleet_manager', null, pg_temp.id('site'), 'FM');
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version) values
  (pg_temp.id('scenario'), 'sqltest-014', 1, pg_temp.id('site'), now(), interval '8 hours', 'test');
insert into public.scenario_runs (id, scenario_id, sim_anchor, is_current, status) values
  (pg_temp.id('run'), pg_temp.id('scenario'), now(), true, 'playing');

create or replace function pg_temp.emit_inc(p jsonb, k text) returns void language sql as $$
  select private.emit_event('incident.reported', p, k, 'user', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op')) $$;
select pg_temp.emit_inc('{"incident_type": "near_miss", "severity": 2, "description": "nm"}'::jsonb, 's14:nm');          -- sealed
select pg_temp.emit_inc('{"incident_type": "manual", "severity": 3, "description": "open"}'::jsonb, 's14:open');          -- site-visible
select pg_temp.emit_inc('{"incident_type": "first_aid", "severity": 3, "description": "harm"}'::jsonb, 's14:harm');       -- harm: never sealed
create temp table ev as select idempotency_key k, id from public.events where idempotency_key like 's14:%';
grant select on ev to authenticated;

-- ── 1. privileges: the predicate and its internals are not client-callable ──────────────────────
do $$
begin
  assert not has_function_privilege('authenticated', 'private.event_is_sealed(public.events)', 'execute'), 'event_is_sealed callable by authenticated';
  assert not has_function_privilege('anon', 'private.event_is_sealed(public.events)', 'execute'), 'event_is_sealed callable by anon';
  assert not has_function_privilege('authenticated', 'private.event_is_harm(public.events)', 'execute'), 'event_is_harm callable by authenticated';
  assert not has_function_privilege('authenticated', 'private.event_seal_requested(public.events)', 'execute'), 'event_seal_requested callable by authenticated';
  assert has_function_privilege('service_role', 'private.event_is_sealed(public.events)', 'execute'), 'service_role keeps the internal predicate';
  assert has_function_privilege('authenticated', 'private.event_visible(public.events, public.app_role, uuid, uuid)', 'execute'), 'RLS needs event_visible';
end $$;

-- ── 2. as a signed-in operator: direct call is permission denied, crafted rows learn nothing ─────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_op'), 'role', 'authenticated')::text, true);
do $$
declare crafted public.events; st public.events; denied boolean := false;
begin
  begin
    perform private.event_is_sealed(null::public.events);
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'private.event_is_sealed must raise permission denied for authenticated';
  denied := false;
  begin
    perform private.event_is_harm(null::public.events);
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'private.event_is_harm must raise permission denied for authenticated';
end $$;
do $$
declare st public.events; crafted public.events;
begin
  select * into st from public.events where idempotency_key = 's14:harm';
  crafted := st; crafted.id := gen_random_uuid();                              -- same content, id that is not stored
  assert private.event_visible(crafted, 'operator', pg_temp.id('site'), pg_temp.id('op')) = false, 'a row whose id is not stored answers false';
  crafted := st; crafted.payload := '{"incident_type":"near_miss","non_punitive":true}'::jsonb;
  assert private.event_visible(crafted, 'operator', pg_temp.id('site'), pg_temp.id('op'))
       = private.event_visible(st, 'operator', pg_temp.id('site'), pg_temp.id('op')), 'a doctored payload on a real id changes nothing';
  -- spoofed role/site/operator arguments are ignored for an authenticated session
  select * into st from public.events where idempotency_key = 's14:open';
  assert private.event_visible(st, 'fleet_manager', gen_random_uuid(), null) = private.event_visible(st, 'operator', pg_temp.id('site'), pg_temp.id('op')),
    'spoofed viewer arguments are replaced by the caller''s own';
end $$;

-- ── 3. RLS on events is unchanged ────────────────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from public.events where id in (select id from ev where k = 's14:nm')) = 1, 'operator sees own sealed near miss';
  assert (select count(*) from public.events where id in (select id from ev where k = 's14:harm')) = 1, 'operator sees own harm report';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_fm'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.events where id in (select id from ev where k = 's14:nm')) = 0, 'supervisor never sees a sealed near miss';
  assert (select count(*) from public.events where id in (select id from ev where k = 's14:open')) = 1, 'supervisor sees an ordinary incident';
  assert (select count(*) from public.events where id in (select id from ev where k = 's14:harm')) = 1, 'supervisor sees a harm report';
end $$;
reset role;
