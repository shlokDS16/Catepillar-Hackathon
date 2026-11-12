-- B10: the six P0 rule detectors (pure), the explanation and cost goldens, apply_findings (edge-triggered,
-- idempotent), and the seatbelt acceptance through the real engine (step_tick → apply_frame → detect_frame).
-- Runs inside begin … rollback and calls STEP FUNCTIONS only (R2-1). No dispatch can happen: nothing here
-- creates a dispatches row, and app_config.dry_run_external stays true.

-- ── 0. helpers ───────────────────────────────────────────────────────────────────────────────────
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

-- the base frame is a healthy, moving machine in a 20 km/h, 15° zone; each test overrides one thing
create or replace function pg_temp.fr(p text default '{}') returns jsonb language sql as $$
  select '{"machine_id":"00000000-0000-4000-8000-0000000000a1","machine_code":"EXC-P","operator_id":"00000000-0000-4000-8000-0000000000b1","frame_seq":7,"speed_kmh":6.2,"pitch_deg":2.0,"roll_deg":1.0,"seatbelt_fastened":true,"lat":21.1463,"lon":79.0882}'::jsonb || p::jsonb $$;
create or replace function pg_temp.st(p text default '{}') returns jsonb language sql as $$
  select '{"zone":{"id":"00000000-0000-4000-8000-0000000000c1","max_speed_kmh":20,"max_slope_deg":15}}'::jsonb || p::jsonb $$;
create or replace function pg_temp.cfg() returns jsonb language sql as $$
  select '{"motion_speed_kmh":0.5,"default_max_slope_deg":15,"idle_caution_pct":40,"idle_warning_pct":50,"idle_min_window_min":30,"fuel_price_inr_per_l":92,"fault_grace_min":5,"danger_radius_m":15,"warning_radius_m":30}'::jsonb $$;
create or replace function pg_temp.rules(f jsonb, s jsonb) returns text language sql as $$
  select coalesce(string_agg(r.rule, ',' order by r.rule), '') from private.detect_rules(f, s, pg_temp.cfg()) r $$;
create or replace function pg_temp.idle(idle_h numeric, engine_h numeric, elapsed numeric, base numeric default 25, lph numeric default 28)
returns jsonb language sql as $$
  select pg_temp.st(jsonb_build_object('idle', jsonb_build_object('idle_h', idle_h, 'engine_h', engine_h,
           'elapsed_min', elapsed, 'baseline_idle_pct', base, 'idle_fuel_lph', lph))::text) $$;

-- ── 1. seatbelt_off_moving: fire / no-fire boundary ──────────────────────────────────────────────
do $$
begin
  assert pg_temp.rules(pg_temp.fr('{"seatbelt_fastened":false}'), pg_temp.st()) = 'seatbelt_off_moving', 'belt off + moving fires';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st()) = '', 'belt on: no finding';
  assert pg_temp.rules(pg_temp.fr('{"seatbelt_fastened":null}'), pg_temp.st()) = '', 'belt unknown (null) never fires';
  assert pg_temp.rules(pg_temp.fr('{"seatbelt_fastened":false,"speed_kmh":0.5}'), pg_temp.st()) = '',
    'speed exactly at the motion threshold is not moving';
  assert pg_temp.rules(pg_temp.fr('{"seatbelt_fastened":false,"speed_kmh":0.6}'), pg_temp.st()) = 'seatbelt_off_moving', 'just above fires';
  assert pg_temp.rules(pg_temp.fr('{"seatbelt_fastened":false,"speed_kmh":null}'), pg_temp.st()) = '', 'null speed never fires';
  -- tier: critical only strictly over the zone limit (15), warning at or under it
  assert (select tier from private.detect_rules(pg_temp.fr('{"seatbelt_fastened":false,"pitch_deg":15.0}'), pg_temp.st(), pg_temp.cfg())) = 'warning',
    'pitch == zone limit is warning';
  assert (select tier from private.detect_rules(pg_temp.fr('{"seatbelt_fastened":false,"pitch_deg":15.1}'), pg_temp.st(), pg_temp.cfg())) = 'critical',
    'pitch just over the zone limit is critical';
  assert (select tier from private.detect_rules(pg_temp.fr('{"seatbelt_fastened":false,"pitch_deg":2,"roll_deg":-16}'), pg_temp.st(), pg_temp.cfg())) = 'critical',
    'roll counts, by magnitude';
  assert (select tier from private.detect_rules(pg_temp.fr('{"seatbelt_fastened":false,"pitch_deg":15.1}'), '{}'::jsonb, pg_temp.cfg())) = 'critical',
    'no zone: the 15° default applies';
  assert (select severity_score from private.detect_rules(pg_temp.fr('{"seatbelt_fastened":false,"pitch_deg":17.4}'), pg_temp.st(), pg_temp.cfg())) = 85
     and (select tier from private.detect_rules(pg_temp.fr('{"seatbelt_fastened":false,"pitch_deg":17.4}'), pg_temp.st(), pg_temp.cfg())) = 'critical',
    'the demo frame (17.4 > 15) scores 85 = critical';
end $$;

-- ── 2. overspeed ─────────────────────────────────────────────────────────────────────────────────
do $$
begin
  assert pg_temp.rules(pg_temp.fr('{"speed_kmh":20.0}'), pg_temp.st()) = '', 'at the limit: no finding';
  assert pg_temp.rules(pg_temp.fr('{"speed_kmh":20.1}'), pg_temp.st()) = 'overspeed', 'just over fires';
  assert pg_temp.rules(pg_temp.fr('{"speed_kmh":60}'), '{}'::jsonb) = '', 'no zone, no limit, no finding';
  assert pg_temp.rules(pg_temp.fr('{"speed_kmh":60}'), '{"zone":{"max_speed_kmh":0}}'::jsonb) = '', 'a zero limit never divides';
  assert pg_temp.rules(pg_temp.fr('{"speed_kmh":60}'), '{"zone":{"max_speed_kmh":null}}'::jsonb) = '', 'a null limit never fires';
  assert (select tier from private.detect_rules(pg_temp.fr('{"speed_kmh":20.1}'), pg_temp.st(), pg_temp.cfg())) = 'caution', 'barely over is caution';
  assert (select tier from private.detect_rules(pg_temp.fr('{"speed_kmh":30}'), pg_temp.st(), pg_temp.cfg())) = 'warning', '50 % over is warning';
  assert (select alert_kind from private.detect_rules(pg_temp.fr('{"speed_kmh":30}'), pg_temp.st(), pg_temp.cfg())) is null, 'overspeed is event-only in P0';
end $$;

-- ── 3. slope_exceeded (and its subsumption by a seatbelt breach) ─────────────────────────────────
do $$
begin
  assert pg_temp.rules(pg_temp.fr('{"pitch_deg":15.0}'), pg_temp.st()) = '', 'at the limit: no finding';
  assert pg_temp.rules(pg_temp.fr('{"pitch_deg":15.1}'), pg_temp.st()) = 'slope_exceeded', 'just over fires';
  assert pg_temp.rules(pg_temp.fr('{"pitch_deg":-15.1}'), pg_temp.st()) = 'slope_exceeded', 'negative pitch counts by magnitude';
  assert pg_temp.rules(pg_temp.fr('{"pitch_deg":2,"roll_deg":15.1}'), pg_temp.st()) = 'slope_exceeded', 'roll counts';
  assert pg_temp.rules(pg_temp.fr('{"pitch_deg":20,"speed_kmh":0}'), pg_temp.st()) = '', 'a parked machine is not working the slope';
  assert pg_temp.rules(pg_temp.fr('{"pitch_deg":null,"roll_deg":null}'), pg_temp.st()) = '', 'no slope reading never fires';
  assert pg_temp.rules(pg_temp.fr('{"pitch_deg":17.4,"seatbelt_fastened":false}'), pg_temp.st()) = 'seatbelt_off_moving',
    'the breach subsumes slope_exceeded: one breach is exactly one finding';
  assert pg_temp.rules(pg_temp.fr('{"pitch_deg":17.4,"seatbelt_fastened":true}'), pg_temp.st()) = 'slope_exceeded', 'belt on: the slope finding stands';
end $$;

-- ── 4. idle_excess: boundaries, the §12 cost formula, the golden row ─────────────────────────────
do $$
declare r private.finding;
begin
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.399, 1.0, 60)) = '', '39.9 % idle: below caution';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.400, 1.0, 60)) = 'idle_excess', 'exactly 40 % fires';
  assert (select tier from private.detect_rules(pg_temp.fr(), pg_temp.idle(0.400, 1.0, 60), pg_temp.cfg())) = 'caution', '40 % is caution';
  assert (select tier from private.detect_rules(pg_temp.fr(), pg_temp.idle(0.499, 1.0, 60), pg_temp.cfg())) = 'caution', '49.9 % is caution';
  assert (select tier from private.detect_rules(pg_temp.fr(), pg_temp.idle(0.500, 1.0, 60), pg_temp.cfg())) = 'warning', 'exactly 50 % is warning';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.9, 1.0, 29.9)) = '', 'a window under 30 min is not judged';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.9, 1.0, 30)) = 'idle_excess', 'a 30 min window is';
  -- nulls and zeros never raise (sd = 0 analogue)
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.9, 0, 60)) = '', 'zero engine hours: no division';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.9, 1.0, 60, 0)) = '', 'zero baseline: no division';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.9, 1.0, 60, 25, 0)) = '', 'zero idle burn: no cost, no finding';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.9, 1.0, 60, null)) = '', 'null baseline never fires';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.9, 1.0, 60, 25, null)) = '', 'null idle burn never fires';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(null, 1.0, 60)) = '', 'null idle hours never fires';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"idle":null}')) = '', 'no idle window never fires';
  assert pg_temp.rules(pg_temp.fr(), '{}'::jsonb) = '', 'empty state never raises';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(0.45, 1.0, 60, 60)) = '', 'idle at or under its own normal: no excess, no finding';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.idle(-1, 1.0, 60)) = '', 'a negative window (counter reset) never fires';
  -- golden (api-contracts §12): 1.00 engine h, 0.75 idle h, baseline 25 %, 28 L/h → excess 0.5 h → 14.0 L → ₹1,288 → ₹1,290
  select * into r from private.detect_rules(pg_temp.fr('{"machine_code":"EXC-007"}'), pg_temp.idle(0.75, 1.0, 60), pg_temp.cfg());
  assert r.fuel_l = 14.0, 'fuel_l = round(0.5 × 28, 1) = 14.0, got ' || coalesce(r.fuel_l::text, 'null');
  assert r.cost_inr = 1290, 'cost_inr = round(14.0 × 92, -1) = 1290, got ' || coalesce(r.cost_inr::text, 'null');
  assert (r.features ->> 'ratio_to_normal')::numeric = 3.00, 'ratio_to_normal = idle_pct ÷ baseline = 75 ÷ 25';
  assert r.severity_score = 60 and r.tier = 'warning', '75 % idle is warning';
  assert private.render_explanation('idle_excess', r.slots || '{"machine":"EXC-007"}'::jsonb)
         = jsonb_build_object('en', 'EXC-007 idled 75% of the last hour, 3× its normal. About 14 L of diesel (≈ ₹1,290).',
                              'hi', 'EXC-007 पिछले एक घंटे में 75% समय खाली चली, सामान्य से 3 गुना। लगभग 14 लीटर डीज़ल (≈ ₹1,290)।'),
    'EN and HI sentences match the golden row: ' || private.render_explanation('idle_excess', r.slots || '{"machine":"EXC-007"}'::jsonb)::text;
  -- rounding: 0.6 idle h of 1.0 at base 25 → excess 0.35 h × 28 = 9.8 L → ₹901.6 → ₹900
  select * into r from private.detect_rules(pg_temp.fr(), pg_temp.idle(0.6, 1.0, 60), pg_temp.cfg());
  assert r.fuel_l = 9.8 and r.cost_inr = 900, 'rounding: 9.8 L, ₹900, got ' || r.fuel_l::text || ' / ' || r.cost_inr::text;
  assert (select count(*) from private.detect_rules(pg_temp.fr(), pg_temp.idle(0.6, 1.0, 60), '{"fuel_price_inr_per_l":null}'::jsonb)) = 0,
    'no fuel price: never fires';
end $$;

-- ── 5. fault_continued_operation ─────────────────────────────────────────────────────────────────
do $$
declare r private.finding;
begin
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"fault":{"code":"SPN110-FMI16","severity":"derate","minutes":4}}')) = '', '4 min: still inside the grace';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"fault":{"code":"SPN110-FMI16","severity":"derate","minutes":5}}')) = 'fault_continued_operation', '5 min fires';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"fault":{"code":"SPN110-FMI16","severity":"info","minutes":60}}')) = '', 'an info fault never fires';
  assert pg_temp.rules(pg_temp.fr('{"speed_kmh":0}'), pg_temp.st('{"fault":{"code":"SPN110-FMI16","severity":"derate","minutes":60}}')) = '', 'a stopped machine did not "keep working"';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"fault":null}')) = '', 'no fault: nothing';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"fault":{"code":"X","severity":"derate","minutes":null}}')) = '', 'null duration never fires';
  assert (select tier from private.detect_rules(pg_temp.fr(), pg_temp.st('{"fault":{"code":"X","severity":"caution","minutes":9}}'), pg_temp.cfg())) = 'caution', 'caution fault → caution';
  assert (select tier from private.detect_rules(pg_temp.fr(), pg_temp.st('{"fault":{"code":"X","severity":"derate","minutes":9}}'), pg_temp.cfg())) = 'warning', 'derate → warning';
  assert (select tier from private.detect_rules(pg_temp.fr(), pg_temp.st('{"fault":{"code":"X","severity":"shutdown","minutes":9}}'), pg_temp.cfg())) = 'critical', 'shutdown → critical';
  select * into r from private.detect_rules(pg_temp.fr('{"machine_code":"EXC-014"}'), pg_temp.st('{"fault":{"code":"SPN110-FMI16","severity":"derate","minutes":12.7}}'), pg_temp.cfg());
  assert private.render_explanation('fault_continued_operation', r.slots || '{"machine":"EXC-014"}'::jsonb) ->> 'en'
         = 'EXC-014 kept working for 12 min with fault SPN110-FMI16 active.', 'fault sentence';
end $$;

-- ── 6. proximity_person_machine rings ────────────────────────────────────────────────────────────
do $$
declare p text := '"operator_id":"00000000-0000-4000-8000-0000000000b2"';
begin
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"people":[{' || p || ',"distance_m":15.0}]}')) = 'proximity_person_machine', '15 m is the danger ring';
  assert (select tier from private.detect_rules(pg_temp.fr(), pg_temp.st('{"people":[{' || p || ',"distance_m":15.0}]}'), pg_temp.cfg())) = 'warning', 'danger → warning tier';
  assert (select event_payload ->> 'zone' from private.detect_rules(pg_temp.fr(), pg_temp.st('{"people":[{' || p || ',"distance_m":15.0}]}'), pg_temp.cfg())) = 'danger', 'danger zone in the payload';
  assert (select event_payload ->> 'zone' from private.detect_rules(pg_temp.fr(), pg_temp.st('{"people":[{' || p || ',"distance_m":15.1}]}'), pg_temp.cfg())) = 'warning', '15.1 m is the warning ring';
  assert (select tier from private.detect_rules(pg_temp.fr(), pg_temp.st('{"people":[{' || p || ',"distance_m":30.0}]}'), pg_temp.cfg())) = 'caution', '30 m is the edge of the warning ring';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"people":[{' || p || ',"distance_m":30.1}]}')) = '', '30.1 m is awareness: no finding';
  assert pg_temp.rules(pg_temp.fr('{"speed_kmh":0.5}'), pg_temp.st('{"people":[{' || p || ',"distance_m":5}]}')) = '', 'a machine at the motion threshold is not moving';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"people":[]}')) = '', 'nobody near: nothing';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"people":[{' || p || ',"distance_m":null}]}')) = '', 'a null distance never fires';
  assert pg_temp.rules(pg_temp.fr(), pg_temp.st('{"people":null}')) = '', 'null people never raises';
  assert (select count(*) from private.detect_rules(pg_temp.fr(),
            pg_temp.st('{"people":[{' || p || ',"distance_m":5},{"operator_id":"00000000-0000-4000-8000-0000000000b3","distance_m":20}]}'), pg_temp.cfg())) = 2,
    'one finding per person';
  assert (select operator_id from private.detect_rules(pg_temp.fr(), pg_temp.st('{"people":[{' || p || ',"distance_m":5}]}'), pg_temp.cfg()))
         = '00000000-0000-4000-8000-0000000000b2', 'the person at risk is the subject operator';
end $$;

-- ── 7. purity, explanation templates, privileges ─────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from pg_proc where pronamespace = 'private'::regnamespace and provolatile <> 'i'
            and proname in ('detect_seatbelt', 'detect_overspeed', 'detect_slope', 'detect_idle', 'detect_fault',
                            'detect_proximity', 'detect_rules', 'severity_tier')) = 0, 'every pure detector is immutable';
  assert (select count(*) from pg_proc where pronamespace = 'private'::regnamespace
            and proname in ('detect_seatbelt', 'detect_overspeed', 'detect_slope', 'detect_idle', 'detect_fault',
                            'detect_proximity', 'detect_rules', 'severity_tier')) = 8, 'all eight pure functions exist';
  assert (select count(*) from private.detect_rules('{}'::jsonb, '{}'::jsonb, '{}'::jsonb)) = 0, 'empty inputs raise nothing and find nothing';
  assert (select count(*) from private.detect_rules(null, null, null)) = 0, 'null inputs raise nothing and find nothing';
  assert private.severity_tier(24) = 'info' and private.severity_tier(25) = 'caution' and private.severity_tier(49) = 'caution'
     and private.severity_tier(50) = 'warning' and private.severity_tier(74) = 'warning' and private.severity_tier(75) = 'critical'
     and private.severity_tier(100) = 'critical', 'severity bands: info < 25 ≤ caution < 50 ≤ warning < 75 ≤ critical';

  -- every template renders from its slots (named-slot replace), and a missing slot is loud
  assert private.render_explanation('seatbelt_off_moving', '{"machine":"EXC-007","speed_kmh":6.2,"pitch_deg":17.4}') ->> 'en'
         = 'EXC-007 moved at 6.2 km/h with the seatbelt off on a 17.4° slope.', 'seatbelt sentence';
  assert private.render_explanation('seatbelt_off_moving', '{"machine":"EXC-007","speed_kmh":6.2,"pitch_deg":17.4}') ->> 'hi'
         = 'EXC-007 17.4° ढलान पर बिना सीटबेल्ट 6.2 किमी/घंटा चली।', 'seatbelt sentence (hi)';
  assert private.render_explanation('overspeed', '{"machine":"DOZ-1","speed_kmh":24,"limit_kmh":20}') ->> 'en'
         = 'DOZ-1 ran at 24 km/h in a 20 km/h zone.', 'overspeed sentence';
  assert private.render_explanation('slope_exceeded', '{"machine":"DOZ-1","pitch_deg":16.5,"limit_deg":15}') ->> 'en'
         = 'DOZ-1 worked on a 16.5° slope; the limit is 15°.', 'slope sentence';
  assert private.render_explanation('hydraulic_temp_drift', '{"machine":"EXC-014","value":86,"mean":71}') ->> 'hi'
         = 'EXC-014 का हाइड्रोलिक तेल 86°C है, सामान्य 71°C से ऊपर।', 'hydraulic sentence (hi)';
  assert private.render_explanation('coolant_temp_drift', '{"machine":"EXC-014","value":101,"mean":88}') ->> 'en'
         = 'EXC-014 coolant is at 101°C, above its normal 88°C.', 'coolant sentence';
  assert private.render_explanation('idle_excess', '{"machine":"M","idle_pct":60,"ratio":2.4,"fuel_l":1234.5,"cost_inr":113574}') ->> 'en'
         like '%≈ ₹113,574%', 'cost_inr gets thousands separators';
  begin
    perform private.render_explanation('overspeed', '{"machine":"DOZ-1","speed_kmh":24}');
    raise exception 'an unfilled slot must raise';
  exception when sqlstate 'P0001' then
    assert sqlerrm like '%unfilled slot%', 'the error names the unfilled slot: ' || sqlerrm;
  end;
  assert not has_function_privilege('authenticated', 'private.apply_findings(uuid,int,timestamptz,boolean,private.finding[],uuid,uuid)', 'execute')
     and not has_function_privilege('anon', 'private.detect_rules(jsonb,jsonb,jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'private.raise_alert(uuid,text,text,public.alert_tier,uuid,uuid,uuid,boolean,text)', 'execute')
     and not has_function_privilege('authenticated', 'private.detect_frame(uuid,public.scenario_frames,timestamptz,boolean)', 'execute'),
    'no client role may execute the detector layer';
  assert (select relrowsecurity from pg_class where oid = 'public.anomalies'::regclass), 'anomalies has RLS';
  assert not has_table_privilege('anon', 'public.anomalies', 'select'), 'anon cannot read anomalies';
  assert not has_table_privilege('authenticated', 'public.anomalies', 'insert'), 'clients never write anomalies';
end $$;

-- ── 8. fixtures for the engine tests ─────────────────────────────────────────────────────────────
create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t values
  ('site', gen_random_uuid()), ('op_ravi', gen_random_uuid()), ('op_other', gen_random_uuid()),
  ('u_ravi', gen_random_uuid()), ('u_other', gen_random_uuid()), ('model', gen_random_uuid()),
  ('exc', gen_random_uuid()), ('doz', gen_random_uuid()), ('grd', gen_random_uuid()), ('ldr', gen_random_uuid()),
  ('cu', gen_random_uuid()), ('nul', gen_random_uuid()), ('zone', gen_random_uuid()),
  ('scenario', gen_random_uuid()), ('run', gen_random_uuid());
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;                            -- the impersonated roles read the fixture ids
grant execute on function pg_temp.id(text) to authenticated;
create temp table s (shift_start timestamptz not null) on commit drop;
insert into s values (date_trunc('second', now()) - interval '10 hours');
create or replace function pg_temp.s() returns timestamptz language sql as $$ select shift_start from s $$;
create or replace function pg_temp.sim(bigint) returns timestamptz language sql as $$
  select pg_temp.s() + make_interval(secs => $1 / 1000.0) $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('u_ravi'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b10ravi@sqltest.local', '', now(), '{}', '{}', now(), now()),
       (pg_temp.id('u_other'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b10other@sqltest.local', '', now(), '{}', '{}', now(), now());
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site'), 'SQLTESB10', 'sqltest B10 quarry', 'quarry',
   extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.zones (id, site_id, name, zone_type, boundary, max_speed_kmh, max_slope_deg) values
  (pg_temp.id('zone'), pg_temp.id('site'), 'Bench B10', 'work',
   extensions.ST_GeogFromText('SRID=4326;POLYGON((79.0862 21.1443, 79.0902 21.1443, 79.0902 21.1483, 79.0862 21.1483, 79.0862 21.1443))'), 20, 15);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op_ravi'), 'OP-B1001', 'Ravi Teli B10', 'novice', pg_temp.id('site'), 'Operator-B101'),
  (pg_temp.id('op_other'), 'OP-B1002', 'Other Person B10', 'expert', pg_temp.id('site'), 'Operator-B102');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_ravi'), 'operator', pg_temp.id('op_ravi'), pg_temp.id('site'), 'Ravi'),
  (pg_temp.id('u_other'), 'operator', pg_temp.id('op_other'), pg_temp.id('site'), 'Other');
insert into public.machine_models (id, code, name, machine_type, idle_fuel_lph, baseline_idle_pct) values
  (pg_temp.id('model'), 'SQLTEST-B10', 'sqltest B10 model', 'excavator', 28, 25);
insert into public.machines (id, code, model_id, home_site_id) values
  (pg_temp.id('exc'), 'EXC-B10', pg_temp.id('model'), pg_temp.id('site')),
  (pg_temp.id('doz'), 'DOZ-B10', pg_temp.id('model'), pg_temp.id('site')),
  (pg_temp.id('grd'), 'GRD-B10', pg_temp.id('model'), pg_temp.id('site')),
  (pg_temp.id('ldr'), 'LDR-B10', pg_temp.id('model'), pg_temp.id('site')),
  (pg_temp.id('cu'), 'CU-B10', pg_temp.id('model'), pg_temp.id('site')),
  (pg_temp.id('nul'), 'NUL-B10', pg_temp.id('model'), pg_temp.id('site'));
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version) values
  (pg_temp.id('scenario'), 'sqltest-b10', 10, pg_temp.id('site'), pg_temp.s(), interval '10 hours', 'test');
update public.scenario_runs set is_current = false where is_current;
insert into public.scenario_runs (id, scenario_id, status, speed, sim_anchor, wall_anchor, cursor_seq, is_current, rehearsal)
values (pg_temp.id('run'), pg_temp.id('scenario'), 'playing', 1, pg_temp.sim(18000), now(), 0, true, true);
insert into public.operator_pairings (run_id, operator_id, machine_id) values
  (pg_temp.id('run'), pg_temp.id('op_ravi'), pg_temp.id('exc'));

-- frames. Section 9 (ticks): seq 1-5, within 5 s of each tick so nothing is a catch-up.
insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, operator_id, payload) values
  (pg_temp.id('scenario'), 1, 16000, 'operator_state', pg_temp.id('exc'), pg_temp.id('op_ravi'), '{"on_foot": false, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'), 2, 17000, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 6.2, "seatbelt_fastened": false, "pitch_deg": 17.4, "roll_deg": 2.0, "parking_brake": false, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'), 3, 18000, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 6.2, "seatbelt_fastened": false, "pitch_deg": 17.4, "roll_deg": 2.0, "parking_brake": false, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'), 4, 19000, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 6.2, "seatbelt_fastened": true, "pitch_deg": 3.0, "roll_deg": 2.0, "parking_brake": false, "lat": 21.1463, "lon": 79.0882}'),
  (pg_temp.id('scenario'), 5, 20000, 'telemetry', pg_temp.id('exc'), null,
   '{"speed_kmh": 6.2, "seatbelt_fastened": false, "pitch_deg": 17.4, "roll_deg": 2.0, "parking_brake": false, "lat": 21.1463, "lon": 79.0882}'),
  -- section 10 (idle, applied directly): an hour apart
  (pg_temp.id('scenario'), 301, 100000, 'telemetry', pg_temp.id('doz'), null,
   '{"speed_kmh": 0.0, "seatbelt_fastened": true, "pitch_deg": 1.0, "engine_hours": 1000.0, "idle_hours": 100.0, "lat": 21.1470, "lon": 79.0870}'),
  (pg_temp.id('scenario'), 302, 3700000, 'telemetry', pg_temp.id('doz'), null,
   '{"speed_kmh": 0.0, "seatbelt_fastened": true, "pitch_deg": 1.0, "engine_hours": 1001.0, "idle_hours": 100.75, "lat": 21.1470, "lon": 79.0870}'),
  (pg_temp.id('scenario'), 303, 3760000, 'telemetry', pg_temp.id('doz'), null,
   '{"speed_kmh": 0.0, "seatbelt_fastened": true, "pitch_deg": 1.0, "engine_hours": 1001.05, "idle_hours": 100.8, "lat": 21.1470, "lon": 79.0870}'),
  (pg_temp.id('scenario'), 304, 7300000, 'telemetry', pg_temp.id('doz'), null,
   '{"speed_kmh": 0.0, "seatbelt_fastened": true, "pitch_deg": 1.0, "engine_hours": 1002.0, "idle_hours": 100.8, "lat": 21.1470, "lon": 79.0870}'),
  -- section 11 (fault): derate fault, then the machine keeps moving 5 minutes later, then the fault clears
  (pg_temp.id('scenario'), 401, 11000000, 'fault', pg_temp.id('grd'), null,
   '{"code_type": "j1939_spn_fmi", "spn": 110, "fmi": 16, "severity": "derate", "description_key": "fault.coolant_high", "active": true}'),
  (pg_temp.id('scenario'), 402, 11300000, 'telemetry', pg_temp.id('grd'), null,
   '{"speed_kmh": 5.0, "seatbelt_fastened": true, "pitch_deg": 2.0, "lat": 21.1470, "lon": 79.0890}'),
  (pg_temp.id('scenario'), 403, 11330000, 'fault', pg_temp.id('grd'), null,
   '{"code_type": "j1939_spn_fmi", "spn": 110, "fmi": 16, "severity": "derate", "description_key": "fault.coolant_high", "active": false}'),
  (pg_temp.id('scenario'), 404, 11340000, 'telemetry', pg_temp.id('grd'), null,
   '{"speed_kmh": 5.0, "seatbelt_fastened": true, "pitch_deg": 2.0, "lat": 21.1470, "lon": 79.0890}'),
  -- section 12 (proximity): a person on foot, a moving loader ≈ 10 m away, the person walks away, then back
  (pg_temp.id('scenario'), 501, 12000000, 'operator_state', null, pg_temp.id('op_other'), '{"on_foot": true, "lat": 21.14630, "lon": 79.08820}'),
  (pg_temp.id('scenario'), 502, 12001000, 'telemetry', pg_temp.id('ldr'), null,
   '{"speed_kmh": 4.0, "seatbelt_fastened": true, "pitch_deg": 2.0, "lat": 21.14639, "lon": 79.08820}'),
  (pg_temp.id('scenario'), 503, 12002000, 'gps', null, pg_temp.id('op_other'), '{"lat": 21.14680, "lon": 79.08820, "speed_kmh": 1.0, "accuracy_m": 4.0}'),
  (pg_temp.id('scenario'), 504, 12003000, 'gps', null, pg_temp.id('op_other'), '{"lat": 21.14660, "lon": 79.08820, "speed_kmh": 1.0, "accuracy_m": 4.0}'),
  -- section 13 (catch-up, partial frame)
  (pg_temp.id('scenario'), 601, 13000000, 'telemetry', pg_temp.id('cu'), null,
   '{"speed_kmh": 5.0, "seatbelt_fastened": false, "pitch_deg": 3.0, "lat": 21.1465, "lon": 79.0885}'),
  (pg_temp.id('scenario'), 701, 14000000, 'telemetry', pg_temp.id('nul'), null, '{"speed_kmh": 1.0}');

create or replace function pg_temp.apply(p_seq int, p_catchup boolean default false) returns void language plpgsql as $$
declare r public.scenario_runs; s public.scenarios; f public.scenario_frames; c public.app_config;
begin
  select * into r from public.scenario_runs where id = pg_temp.id('run');
  select * into s from public.scenarios where id = r.scenario_id;
  select * into f from public.scenario_frames where scenario_id = s.id and seq = p_seq;
  select * into c from public.app_config where id;
  perform private.apply_frame(r, s, f, c, s.shift_start_sim + make_interval(secs => f.sim_offset_ms / 1000.0), p_catchup);
end $$;
create or replace function pg_temp.n_events(p_type text, p_machine text default null) returns bigint language sql as $$
  select count(*) from public.events e where e.run_id = pg_temp.id('run') and e.type = p_type
     and (p_machine is null or e.machine_id = pg_temp.id(p_machine)) $$;

-- ── 9. the seatbelt acceptance, through the real tick ────────────────────────────────────────────
do $$
declare r jsonb; ev public.events%rowtype; al public.alerts%rowtype; an public.anomalies%rowtype;
begin
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 3 and (r ->> 'errors')::int = 0 and (r ->> 'catchups')::int = 0, 'three on-time frames, no errors: ' || r::text;
  assert (select count(*) from private.tick_errors where run_id = pg_temp.id('run')) = 0, 'no poison frames';

  assert pg_temp.n_events('safety.seatbelt_breach') = 1, 'exactly ONE breach event for a breach that lasts two frames';
  assert pg_temp.n_events('safety.slope_exceeded') = 0, 'the slope finding is subsumed by the breach';
  select * into ev from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach';
  assert ev.source = 'detector.rule' and ev.tier = 'critical', 'rule source, critical tier (17.4° > 15° zone limit)';
  assert ev.idempotency_key = 'det:' || pg_temp.id('run')::text || ':EXC-B10:seatbelt_off_moving:2', 'det key, first frame of the breach: ' || ev.idempotency_key;
  assert ev.operator_id = pg_temp.id('op_ravi') and ev.machine_id = pg_temp.id('exc'), 'routed to the cab occupant';
  assert ev.sim_ts = pg_temp.sim(17000), 'carries the simulated time of the frame';
  assert (ev.payload ->> 'frame_seq')::int = 2 and (ev.payload ->> 'speed_kmh')::numeric = 6.2
     and (ev.payload ->> 'pitch_deg')::numeric = 17.4 and (ev.payload ->> 'slope_limit_deg')::numeric = 15
     and (ev.payload ->> 'zone_id')::uuid = pg_temp.id('zone'), 'payload satisfies SeatbeltBreach: ' || ev.payload::text;

  assert (select count(*) from public.alerts where run_id = pg_temp.id('run') and kind = 'seatbelt_off_moving') = 1, 'exactly one alert';
  select * into al from public.alerts where run_id = pg_temp.id('run') and kind = 'seatbelt_off_moving';
  assert al.status = 'open' and al.tier = 'critical' and al.needs_ack and al.occurrences = 1, 'open, critical, needs ack';
  assert al.hazard_key = 'seatbelt:' || pg_temp.id('op_ravi')::text || ':EXC-B10', 'hazard_key = group:operator:machine';
  assert al.origin_event_id = ev.id and ev.alert_id = al.id, 'alert and event point at each other';
  assert al.escalate_at between now() + interval '19 seconds' and now() + interval '21 seconds', 'ack timeout 20 s (alert_policies)';
  assert al.operator_id = pg_temp.id('op_ravi') and al.machine_id = pg_temp.id('exc'), 'alert scoped to operator and machine';

  assert (select count(*) from private.ledger_queue where event_id = ev.id) = 1, 'exactly one ledger queue entry, written by the event trigger';
  assert (select idempotency_key from private.ledger_queue where event_id = ev.id) = 'ledger:' || ev.idempotency_key, 'queue key follows the event key';
  assert (select count(*) from private.loop_queue where event_id = ev.id) = 1, 'exactly one loop_queue row';
  assert (select count(*) from private.ledger_queue q join public.events e on e.id = q.event_id where e.run_id = pg_temp.id('run')
            and e.type like 'safety.%') = 1, 'no other safety event reached the ledger';

  assert (select count(*) from public.anomalies where run_id = pg_temp.id('run')) = 1, 'one anomaly row';
  select * into an from public.anomalies where run_id = pg_temp.id('run');
  assert an.anomaly_type = 'seatbelt_off_moving' and an.method = 'rule' and an.severity_score = 85 and an.severity_tier = 'critical', 'anomaly typed and scored';
  assert an.fuel_l is null and an.cost_inr is null, 'no fuel effect for a seatbelt breach';
  assert an.event_id = ev.id and an.ts_end is null and an.location is not null, 'linked to its event, open, with a location';
  assert an.explanation ->> 'en' = 'EXC-B10 moved at 6.2 km/h with the seatbelt off on a 17.4° slope.', 'EN sentence: ' || (an.explanation ->> 'en');
  assert an.explanation ->> 'hi' = 'EXC-B10 17.4° ढलान पर बिना सीटबेल्ट 6.2 किमी/घंटा चली।', 'HI sentence: ' || (an.explanation ->> 'hi');
  assert (ev.payload -> 'explanation') = an.explanation and (ev.payload ->> 'anomaly_id')::uuid = an.id, 'the explanation is copied into the event payload';
  assert (select an.id = any (active_anomaly_ids) from public.machine_state where run_id = pg_temp.id('run') and machine_id = pg_temp.id('exc')),
    'machine_state lists the active anomaly';

  -- privacy: nothing the FM reads names the operator
  assert not (ev.payload::text ilike '%ravi%' or ev.payload::text ilike '%OP-B1001%') and not (an.explanation::text ilike '%ravi%'),
    'no operator name or employee code in the payload or the explanation';
end $$;

-- a second tick with nothing new due, and a re-applied frame, change nothing (EP §8)
do $$
declare r jsonb; v_events bigint; v_alerts bigint; v_ledger bigint; v_loop bigint; v_anom bigint;
begin
  select count(*) into v_events from public.events where run_id = pg_temp.id('run');
  select count(*) into v_alerts from public.alerts where run_id = pg_temp.id('run');
  select count(*) into v_anom from public.anomalies where run_id = pg_temp.id('run');
  select count(*) into v_ledger from private.ledger_queue;
  select count(*) into v_loop from private.loop_queue;
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 0, 'nothing new is due: ' || r::text;
  perform pg_temp.apply(2);
  perform pg_temp.apply(3);
  assert (select count(*) from public.events where run_id = pg_temp.id('run')) = v_events, 're-applied frames create no event';
  assert (select count(*) from public.alerts where run_id = pg_temp.id('run')) = v_alerts, 'no second alert';
  assert (select occurrences from public.alerts where run_id = pg_temp.id('run') and kind = 'seatbelt_off_moving') = 1, 'a replay never bumps occurrences';
  assert (select count(*) from public.anomalies where run_id = pg_temp.id('run')) = v_anom, 'no second anomaly';
  assert (select count(*) from private.ledger_queue) = v_ledger, 'no second ledger queue entry';
  assert (select count(*) from private.loop_queue) = v_loop, 'no second loop_queue row';
end $$;

-- the ledger accepts the event as emitted (additive payload keys do not break the canonical row)
do $$
declare q bigint;
begin
  select id into q from private.ledger_queue where event_id = (select id from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach');
  perform private.ledger_write_one(q);
  assert (select written_incident_id from private.ledger_queue where id = q) is not null, 'the seatbelt event drains into an incident';
end $$;

-- belt fastened: the rule clears, the anomaly closes; belt off again: a NEW breach, the same alert merges
do $$
declare r jsonb;
begin
  update public.scenario_runs set sim_anchor = pg_temp.sim(19000), wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 1 and (r ->> 'errors')::int = 0, 'frame 4: ' || r::text;
  assert (select count(*) from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach') = 1, 'belt on: no event';
  assert (select ts_end from public.anomalies where run_id = pg_temp.id('run')) = pg_temp.sim(19000), 'the anomaly closes at the clearing frame';
  assert (select not active from private.rule_state where run_id = pg_temp.id('run') and machine_id = pg_temp.id('exc') and rule = 'seatbelt_off_moving'),
    'rule_state inactive';
  assert (select cardinality(active_anomaly_ids) from public.machine_state where run_id = pg_temp.id('run') and machine_id = pg_temp.id('exc')) = 0,
    'machine_state no longer lists it';

  update public.scenario_runs set sim_anchor = pg_temp.sim(20000), wall_anchor = now() where id = pg_temp.id('run');
  r := pg_temp.tick();
  assert (r ->> 'frames')::int = 1 and (r ->> 'errors')::int = 0, 'frame 5: ' || r::text;
  assert (select count(*) from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach') = 2, 'a new breach after a clear is a new event';
  assert (select count(*) from public.alerts where run_id = pg_temp.id('run') and kind = 'seatbelt_off_moving') = 1, 'one active hazard, one alert';
  assert (select occurrences from public.alerts where run_id = pg_temp.id('run') and kind = 'seatbelt_off_moving') = 2, 'the second breach merged: occurrences = 2';
  assert (select count(*) from private.ledger_queue q join public.events e on e.id = q.event_id
           where e.run_id = pg_temp.id('run') and e.type = 'safety.seatbelt_breach') = 2, 'each breach has its own ledger entry';
  -- a lost rule_state does not duplicate the event either: the det: key is the second guard
  delete from private.rule_state where run_id = pg_temp.id('run');
  perform pg_temp.apply(5);
  assert (select count(*) from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach') = 2,
    'the idempotency key alone blocks a duplicate';
end $$;

-- ── 10. idle_excess through the engine ───────────────────────────────────────────────────────────
do $$
declare ev public.events%rowtype; al public.alerts%rowtype; an public.anomalies%rowtype;
begin
  perform pg_temp.apply(301);
  assert pg_temp.n_events('anomaly.detected', 'doz') = 0, 'the first reading has no window yet';
  perform pg_temp.apply(302);
  assert pg_temp.n_events('anomaly.detected', 'doz') = 1, 'idle 75 % over the hour: one anomaly.detected';
  select * into ev from public.events where run_id = pg_temp.id('run') and type = 'anomaly.detected' and machine_id = pg_temp.id('doz');
  select * into an from public.anomalies where run_id = pg_temp.id('run') and machine_id = pg_temp.id('doz');
  assert an.anomaly_type = 'idle_excess' and an.fuel_l = 14.0 and an.cost_inr = 1290, 'golden: 14 L, ₹1,290';
  assert an.explanation ->> 'en' = 'DOZ-B10 idled 75% of the last hour, 3× its normal. About 14 L of diesel (≈ ₹1,290).', 'EN: ' || (an.explanation ->> 'en');
  assert an.explanation ->> 'hi' = 'DOZ-B10 पिछले एक घंटे में 75% समय खाली चली, सामान्य से 3 गुना। लगभग 14 लीटर डीज़ल (≈ ₹1,290)।', 'HI: ' || (an.explanation ->> 'hi');
  assert (ev.payload ->> 'fuel_l')::numeric = 14.0 and (ev.payload ->> 'cost_inr')::numeric = 1290 and ev.payload ->> 'method' = 'rule'
     and (ev.payload ->> 'severity_tier') = 'warning' and ev.payload -> 'features' ? 'idle_pct'
     and (ev.payload ->> 'lat') is not null and (ev.payload ->> 'anomaly_id')::uuid = an.id, 'AnomalyDetected payload: ' || ev.payload::text;
  assert ev.operator_id is null, 'a site-audience event names no operator (data-model §2.10)';
  assert ev.tier = 'warning' and an.severity_tier = 'warning', 'warning at 75 %';
  select * into al from public.alerts where run_id = pg_temp.id('run') and machine_id = pg_temp.id('doz');
  assert al.kind = 'idle_excess' and al.tier = 'caution', 'alert tier is capped at the policy tier_max (caution)';
  assert al.hazard_key = 'idle:-:DOZ-B10' and not al.needs_ack and al.escalate_at is null, 'machine-scoped, no ack, no escalation';
  assert (select count(*) from private.ledger_queue where event_id = ev.id) = 0 and (select count(*) from private.loop_queue where event_id = ev.id) = 0,
    'idle_excess is neither ledgered nor a lesson trigger';

  perform pg_temp.apply(303);
  assert pg_temp.n_events('anomaly.detected', 'doz') = 1, 'still idle: still the same single anomaly';
  assert (select count(*) from public.alerts where run_id = pg_temp.id('run') and machine_id = pg_temp.id('doz')) = 1, 'still one alert';
  perform pg_temp.apply(302);
  assert pg_temp.n_events('anomaly.detected', 'doz') = 1, 'frame replay is a no-op';

  perform pg_temp.apply(304);
  assert (select ts_end from public.anomalies where run_id = pg_temp.id('run') and machine_id = pg_temp.id('doz')) = pg_temp.sim(7300000),
    'the window drops under 40 %: the anomaly closes';
  assert (select tier_history from public.alerts where id = al.id) = '[]'::jsonb, 'no upgrade happened';
end $$;

-- ── 11. fault_continued_operation through the engine ─────────────────────────────────────────────
do $$
declare an public.anomalies%rowtype;
begin
  perform pg_temp.apply(401);
  perform pg_temp.apply(402);
  assert pg_temp.n_events('anomaly.detected', 'grd') = 1, 'derate fault active for 5 min while moving: fires';
  select * into an from public.anomalies where run_id = pg_temp.id('run') and machine_id = pg_temp.id('grd');
  assert an.anomaly_type = 'fault_continued_operation' and an.severity_tier = 'warning', 'derate → warning';
  assert an.explanation ->> 'en' = 'GRD-B10 kept working for 5 min with fault SPN110-FMI16 active.', 'EN: ' || (an.explanation ->> 'en');
  assert an.explanation ->> 'hi' = 'GRD-B10 फ़ॉल्ट SPN110-FMI16 के साथ 5 मिनट चलती रही।', 'HI: ' || (an.explanation ->> 'hi');
  assert (select kind from public.alerts where run_id = pg_temp.id('run') and machine_id = pg_temp.id('grd')) = 'anomaly_machine', 'raises an anomaly_machine alert';
  perform pg_temp.apply(403);
  perform pg_temp.apply(404);
  assert (select ts_end from public.anomalies where id = an.id) = pg_temp.sim(11340000), 'a cleared fault closes the anomaly';
  assert pg_temp.n_events('anomaly.detected', 'grd') = 1, 'clearing is not an event of this type';
end $$;

-- ── 12. proximity through the engine, from both sides ────────────────────────────────────────────
do $$
declare ev public.events%rowtype; al public.alerts%rowtype;
begin
  perform pg_temp.apply(501);
  perform pg_temp.apply(502);
  assert pg_temp.n_events('safety.proximity', 'ldr') = 1, 'a person ≈ 10 m from a moving loader: one proximity event';
  select * into ev from public.events where run_id = pg_temp.id('run') and type = 'safety.proximity';
  assert ev.payload ->> 'zone' = 'danger' and ev.payload ->> 'other_kind' = 'machine' and (ev.payload ->> 'other_id')::uuid = pg_temp.id('ldr'), 'danger ring: ' || ev.payload::text;
  assert (ev.payload ->> 'distance_m')::numeric between 9 and 11, 'distance ≈ 10 m: ' || (ev.payload ->> 'distance_m');
  assert ev.operator_id = pg_temp.id('op_other') and ev.tier = 'warning', 'addressed to the person at risk';
  select * into al from public.alerts where run_id = pg_temp.id('run') and kind = 'proximity_zone';
  assert al.tier = 'warning' and al.operator_id = pg_temp.id('op_other') and al.machine_id = pg_temp.id('ldr')
     and al.hazard_key = 'proximity:' || pg_temp.id('op_other')::text || ':LDR-B10', 'alert: ' || al.hazard_key;

  perform pg_temp.apply(503);                       -- the person walks ≈ 45 m away: person-side frame clears the pair
  assert (select not active from private.rule_state where run_id = pg_temp.id('run') and rule = 'proximity_person_machine'),
    'the pair clears when the person leaves the ring';
  perform pg_temp.apply(504);                       -- and comes back to ≈ 23 m: the warning ring, a new event from the person side
  assert pg_temp.n_events('safety.proximity', 'ldr') = 2, 'a person-side frame can raise the event too';
  assert (select payload ->> 'zone' from public.events where run_id = pg_temp.id('run') and type = 'safety.proximity' order by seq desc limit 1) = 'warning',
    'warning ring';
  assert (select count(*) from public.alerts where run_id = pg_temp.id('run') and kind = 'proximity_zone') = 1, 'same hazard: one alert';
  assert (select occurrences from public.alerts where id = al.id) = 2, 'lower tier merges: occurrences = 2';
end $$;

-- ── 13. catch-up frames and partial frames ───────────────────────────────────────────────────────
do $$
declare al public.alerts%rowtype;
begin
  perform pg_temp.apply(601, true);
  assert pg_temp.n_events('safety.seatbelt_breach', 'cu') = 1, 'a catch-up frame still produces the event';
  assert (select count(*) from public.anomalies where run_id = pg_temp.id('run') and machine_id = pg_temp.id('cu')) = 1, 'and the anomaly';
  select * into al from public.alerts where run_id = pg_temp.id('run') and machine_id = pg_temp.id('cu');
  assert al.status = 'suppressed' and al.suppress_reason = 'catch_up' and al.escalate_at is null and not al.needs_ack,
    'its alert is stored suppressed (catch_up), never escalated: ' || al.status::text;
  assert al.hazard_key = 'seatbelt:-:CU-B10', 'unpaired machine: no operator in the key';

  perform pg_temp.apply(701);                       -- {"speed_kmh": 1.0} only: nothing else known
  assert (select count(*) from public.events where run_id = pg_temp.id('run') and machine_id = pg_temp.id('nul')) = 0, 'a partial frame fires nothing and raises nothing';
  assert (select count(*) from private.tick_errors where run_id = pg_temp.id('run')) = 0, 'no poison frames in the whole file';
end $$;

-- dispatches: the detector layer never creates one (B12/B13 own that), and external sending stays dry-run
do $$
begin
  assert (select count(*) from public.dispatches d join public.alerts a on a.id = d.alert_id where a.run_id = pg_temp.id('run')) = 0,
    'B10 creates no dispatch';
  assert (select dry_run_external from public.app_config where id), 'dry_run_external stays on';
end $$;

-- ── 14. RLS on anomalies ─────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.anomalies where operator_id = pg_temp.id('op_ravi')) = 2, 'an operator reads their own anomalies (2 breaches)';
  assert (select count(*) from public.anomalies where operator_id is not null and operator_id <> pg_temp.id('op_ravi')) = 0, 'and nobody else''s';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_other'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.anomalies where operator_id = pg_temp.id('op_ravi')) = 0, 'a colleague cannot read Ravi''s anomalies';
end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.anomalies;
  raise exception 'anon must not read anomalies';
exception when insufficient_privilege then null;
end $$;
reset role;
