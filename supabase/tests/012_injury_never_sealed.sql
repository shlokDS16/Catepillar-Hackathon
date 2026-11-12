-- 003h: an injury (first_aid) or an SOS is never sealed (data-model §2.10); a near miss still is; an injury
-- reaches the supervisor. Plus the lesson seeds the animated diagrams key off. Runs inside begin … rollback.

create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t values ('site', gen_random_uuid()), ('op', gen_random_uuid()), ('u_anita', gen_random_uuid()), ('run', gen_random_uuid()),
  ('scenario', gen_random_uuid());
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;
grant execute on function pg_temp.id(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('u_anita'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'anita@sqltest.local', '', now(), '{}', '{}', now(), now());
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site'), 'SQLTSEAL', 'sqltest seal quarry', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op'), 'OP-S001', 'Seal test', 'novice', pg_temp.id('site'), 'Operator-S01');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_anita'), 'fleet_manager', null, pg_temp.id('site'), 'Anita');
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version) values
  (pg_temp.id('scenario'), 'sqltest-seal', 1, pg_temp.id('site'), now(), interval '8 hours', 'test');
insert into public.scenario_runs (id, scenario_id, sim_anchor, is_current, status) values
  (pg_temp.id('run'), pg_temp.id('scenario'), now(), true, 'playing');

-- ── 1. injury + non_punitive is refused with `validation` and a hint, on every route ─────────────
do $$
declare v_hint text; v_msg text; k int := 0; p jsonb;
begin
  foreach p in array array[
    '{"incident_type": "first_aid", "severity": 4, "description": "cut hand", "non_punitive": true}'::jsonb,
    '{"incident_type": "sos", "severity": 5, "description": "help", "non_punitive": true}'::jsonb,
    '{"incident_type": "near_miss", "severity": 5, "description": "severity 5 is never sealed", "non_punitive": true}'::jsonb,
    '{"incident_type": "manual", "severity": 5, "description": "x", "non_punitive": true}'::jsonb] loop
    k := k + 1;
    begin
      perform private.emit_event('incident.reported', p, 'seal:inj:' || k, 'user', pg_temp.id('site'), pg_temp.id('run'),
                                 null::uuid, pg_temp.id('op'));
      raise exception 'a sealed harm report was accepted: %', p;
    exception when raise_exception then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
      if v_msg <> 'validation' then raise; end if;
      assert v_hint like '%never sealed%', 'a clear hint, got ' || coalesce(v_hint, 'null');
    end;
  end loop;
  -- an SOS event carrying the flag is refused too
  begin
    perform private.emit_event('sos.raised', '{"alert_id": "00000000-0000-4000-8000-000000000001", "non_punitive": true}'::jsonb,
                               'seal:sos:1', 'user', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op'));
    raise exception 'a sealed SOS event was accepted';
  exception when raise_exception then
    if sqlerrm <> 'validation' then raise; end if;
  end;
  -- the table backstop
  assert exists (select 1 from pg_constraint where conname = 'incidents_harm_never_sealed' and conrelid = 'public.incidents'::regclass),
    'incidents carries the never-sealed check';
  assert not exists (select 1 from public.events where idempotency_key like 'seal:%'), 'a refused event leaves no row';
end $$;

-- ── 2. near miss + non_punitive: sealed as before; injury unsealed: reaches the supervisor ──────
do $$
declare n int;
begin
  perform private.emit_event('incident.reported',
    '{"incident_type": "near_miss", "severity": 2, "description": "near miss", "non_punitive": true}'::jsonb,
    'seal:nm:1', 'user', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op'));
  perform private.emit_event('incident.reported',
    '{"incident_type": "first_aid", "severity": 4, "description": "cut hand", "non_punitive": false}'::jsonb,
    'seal:fa:1', 'user', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op'));
  perform private.emit_event('incident.reported',
    '{"incident_type": "first_aid", "severity": 4, "description": "bruise"}'::jsonb,        -- flag absent: default is not sealed
    'seal:fa:2', 'user', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op'));
  n := private.ledger_drain();
  assert n = 3, 'three entries written, got ' || n;
  assert (select non_punitive from public.incidents where incident_type = 'near_miss' and site_id = pg_temp.id('site')), 'near miss is sealed';
  assert (select count(*) from public.incidents where incident_type = 'first_aid' and site_id = pg_temp.id('site') and not non_punitive) = 2,
    'injuries are not sealed';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_anita'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.incidents where incident_type = 'first_aid') = 2, 'the supervisor reads both injuries';
  assert (select count(*) from public.events where type = 'incident.reported' and payload ->> 'incident_type' = 'first_aid') = 2,
    'the supervisor receives both injury events';
  assert (select count(*) from public.incidents where incident_type = 'near_miss') = 0, 'positive control: the sealed near miss stays hidden';
  assert not exists (select 1 from public.events where idempotency_key = 'seal:nm:1'), 'positive control: the near-miss event stays hidden';
end $$;
reset role;

-- ── 3. lesson seeds: the diagram pictograms are present ──────────────────────────────────────────
do $$
declare c jsonb;
begin
  select content into c from public.lessons where code = 'seatbelt_slopes';
  assert jsonb_array_length(c -> 'cards') = 4 and jsonb_array_length(c -> 'quiz') = 3, 'seatbelt lesson: 4 cards, 3 questions';
  assert (select array_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(c -> 'cards') x) = array['k1', 'k2', 'k3', 'k4'], 'card ids k1-k4';
  assert exists (select 1 from jsonb_array_elements(c -> 'cards') x where x ->> 'pictogram' = 'rollover'), 'rollover card';
  assert exists (select 1 from jsonb_array_elements(c -> 'cards') x where x ->> 'pictogram' = 'belt_compare'), 'belt_compare card';
  select content into c from public.lessons where code = 'faulty_machine_nearby';
  assert exists (select 1 from jsonb_array_elements(c -> 'cards') x where x ->> 'pictogram' = 'blindspot'), 'blindspot card';
  assert c -> 'title' ->> 'hi' is not null and c -> 'cards' -> 0 -> 'body' ->> 'hi' is not null, 'hi text present';
  assert (select topic_event_types from public.lessons where code = 'faulty_machine_nearby') = array['safety.proximity'], 'topic event kept';
end $$;
