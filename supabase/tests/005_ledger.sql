-- B5: the ledger. Golden vectors 1-3 in SQL, the canonical-v1 validator, the queue drain and the chain,
-- append-only enforcement, export/verify/recompute, the checkpoint witness line, both tamper modes and
-- the advisory lock 4210001 that every mutator and the verify snapshot take. Runs inside begin … rollback.

-- ── 1. Golden vector 1 (data-model §4.3): canonical bytes, length and hash ────────────────────────
create temp table gv (k text primary key, j jsonb, t text) on commit drop;
insert into gv (k, j) values ('v1_input', '{"v":"1","seq":"1","prev_hash":"0000000000000000000000000000000000000000000000000000000000000000","run_id":null,"occurred_at":"2026-09-23T08:15:02.123456Z","recorded_at":"2026-09-23T08:15:03.000001Z","incident_type":"seatbelt_breach","severity":"4","site_id":"11111111-1111-4111-8111-111111111111","operator_id":"22222222-2222-4222-8222-222222222222","machine_id":"33333333-3333-4333-8333-333333333333","lat":"21.146300","lon":"79.088200","description":"सीटबेल्ट नहीं लगा, ढलान 17.4° \"B3\"","context":{"speed_kmh":"6.2","pitch_deg":"17.4","zone":{"name":"Bench 3","max_slope_deg":"15"},"ppe":["helmet","vest"]},"reported_by":null,"reporter_kind":"detector","source_event_id":"44444444-4444-4444-8444-444444444444","supersedes_seq":null,"non_punitive":false}'::jsonb);
insert into gv (k, t) values ('v1_canonical', '{"context":{"pitch_deg":"17.4","ppe":["helmet","vest"],"speed_kmh":"6.2","zone":{"max_slope_deg":"15","name":"Bench 3"}},"description":"सीटबेल्ट नहीं लगा, ढलान 17.4° \"B3\"","incident_type":"seatbelt_breach","lat":"21.146300","lon":"79.088200","machine_id":"33333333-3333-4333-8333-333333333333","non_punitive":false,"occurred_at":"2026-09-23T08:15:02.123456Z","operator_id":"22222222-2222-4222-8222-222222222222","prev_hash":"0000000000000000000000000000000000000000000000000000000000000000","recorded_at":"2026-09-23T08:15:03.000001Z","reported_by":null,"reporter_kind":"detector","run_id":null,"seq":"1","severity":"4","site_id":"11111111-1111-4111-8111-111111111111","source_event_id":"44444444-4444-4444-8444-444444444444","supersedes_seq":null,"v":"1"}');

do $$
declare v1 jsonb; canon text; expected text; h1 text; v2 jsonb; h2 text; root text;
begin
  select j into v1 from gv where k = 'v1_input';
  select t into expected from gv where k = 'v1_canonical';
  canon := private.ledger_canonical_text(v1);
  assert canon = expected, 'golden vector 1 canonical text differs';
  assert octet_length(canon) = 797, 'golden vector 1 is 797 UTF-8 bytes, got ' || octet_length(canon);
  perform private.ledger_validate_entry(v1);                      -- the vector is inside the restricted domain
  h1 := private.ledger_hash(v1);
  assert h1 = 'b04bf3cbe21a368128e2f5eb4d7d0d8a3b3a8491f84998aa2869e3cb88b51181', 'golden vector 1 hash: ' || h1;

  -- vector 2: the chain link
  v2 := v1 || jsonb_build_object('seq', '2', 'prev_hash', h1, 'incident_type', 'sos', 'severity', '5',
                                 'description', 'SOS', 'context', '{}'::jsonb);
  perform private.ledger_validate_entry(v2);
  h2 := private.ledger_hash(v2);
  assert h2 = 'db5217f0823bfc42c5c14ca00414c2c24da4dae60819589d7f63db77f03e065f', 'golden vector 2 hash: ' || h2;

  -- vector 3: Merkle over the RAW 32-byte hashes (never the hex text)
  root := encode(private.ledger_merkle_of(array[h1, h2]), 'hex');
  assert root = '603286c8575192d014b33463f312267d7dc8e7ab398b163959a91438e69b3574', 'golden vector 3 root: ' || root;
  -- the tree's edges: empty = sha256(''), one leaf = the leaf itself, odd node carried up
  assert encode(private.ledger_merkle_of('{}'::text[]), 'hex') = encode(sha256(''::bytea), 'hex'), 'empty tree';
  assert private.ledger_merkle_of(array[h1]) = sha256('\x00'::bytea || decode(h1, 'hex')), 'single leaf';
  assert private.ledger_merkle_of(array[h1, h2, h1])
       = sha256('\x01'::bytea || private.ledger_merkle_of(array[h1, h2]) || sha256('\x00'::bytea || decode(h1, 'hex'))),
    'odd node carried up unchanged';
end $$;

-- ── 2. The restricted domain is enforced, not guessed ────────────────────────────────────────────
do $$
declare v1 jsonb;
begin
  select j into v1 from gv where k = 'v1_input';
  begin
    perform private.ledger_canonical_text('{"a": 1}'::jsonb);
    raise exception 'a JSON number was canonicalised';
  exception when raise_exception then
    if sqlerrm not like '%numbers are not allowed%' then raise; end if;
  end;
  begin
    perform private.ledger_canonical_text(jsonb_build_object('a', 'x' || chr(9) || 'y'));
    raise exception 'a control character was canonicalised';
  exception when raise_exception then
    if sqlerrm not like '%control character%' then raise; end if;
  end;
  begin
    perform private.ledger_canonical_text('{"Speed": "1"}'::jsonb);
    raise exception 'an upper-case key was canonicalised';
  exception when raise_exception then
    if sqlerrm not like '%is not ASCII%' then raise; end if;
  end;
  begin
    perform private.ledger_validate_entry(v1 - 'lat');
    raise exception 'a 19-field entry validated';
  exception when raise_exception then
    if sqlerrm not like '%exactly the 20 fields%' then raise; end if;
  end;
  begin
    perform private.ledger_validate_entry(v1 || jsonb_build_object('lat', '21.1463'));
    raise exception 'a 4-decimal lat validated';
  exception when raise_exception then
    if sqlerrm not like '%numeric(9,6) text%' then raise; end if;
  end;
  begin
    perform private.ledger_validate_entry(v1 || jsonb_build_object('occurred_at', '2026-09-23T08:15:02Z'));
    raise exception 'a second-precision timestamp validated';
  exception when raise_exception then
    if sqlerrm not like '%ssssssZ text%' then raise; end if;
  end;
  -- escaping: only " and \ are escaped; everything else stays raw UTF-8
  assert private.ledger_canonical_text(jsonb_build_object('a', 'q"\z°')) = '{"a":"q\"\\z°"}', 'escaping rule 4';
end $$;

-- ── 3. Fixtures ──────────────────────────────────────────────────────────────────────────────────
create temp table t (k text primary key, v uuid not null) on commit drop;
insert into t values
  ('site', gen_random_uuid()), ('op_ravi', gen_random_uuid()), ('op_other', gen_random_uuid()),
  ('u_ravi', gen_random_uuid()), ('u_anita', gen_random_uuid()), ('u_trainer', gen_random_uuid()),
  ('machine', gen_random_uuid()), ('scenario', gen_random_uuid()), ('run', gen_random_uuid());
create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from t where k = $1 $$;
grant select on t to authenticated;
grant execute on function pg_temp.id(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(k), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', k || '@sqltest.local', '', now(), '{}', '{}', now(), now()
from t where k like 'u\_%';
insert into public.sites (id, code, name, site_type, location) values
  (pg_temp.id('site'), 'SQLTESL', 'sqltest ledger quarry', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography);
insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values
  (pg_temp.id('op_ravi'), 'OP-L001', 'Ravi (ledger test)', 'novice', pg_temp.id('site'), 'Operator-L01'),
  (pg_temp.id('op_other'), 'OP-L002', 'Other (ledger test)', 'expert', pg_temp.id('site'), 'Operator-L02');
insert into public.profiles (user_id, role, operator_id, site_id, display_name) values
  (pg_temp.id('u_ravi'), 'operator', pg_temp.id('op_ravi'), pg_temp.id('site'), 'Ravi'),
  (pg_temp.id('u_anita'), 'fleet_manager', null, pg_temp.id('site'), 'Anita'),
  (pg_temp.id('u_trainer'), 'trainer', null, pg_temp.id('site'), 'Trainer');
insert into public.machines (id, code, home_site_id) values (pg_temp.id('machine'), 'EXC-L01', pg_temp.id('site'));
insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version) values
  (pg_temp.id('scenario'), 'sqltest-ledger', 1, pg_temp.id('site'), now(), interval '8 hours', 'test');
insert into public.scenario_runs (id, scenario_id, sim_anchor, is_current, status) values
  (pg_temp.id('run'), pg_temp.id('scenario'), now(), true, 'playing');

-- ── 4. The single write path: events → queue → drain → chain (data-model §4.2) ───────────────────
do $$
declare n int;
begin
  perform private.emit_event('safety.seatbelt_breach',
    '{"frame_seq": 1812, "speed_kmh": 6.2, "pitch_deg": 17.4, "roll_deg": 2, "slope_limit_deg": 15, "zone_id": null}'::jsonb,
    'det:ledger:seatbelt:1', 'detector.rule', pg_temp.id('site'), pg_temp.id('run'), pg_temp.id('machine'),
    pg_temp.id('op_ravi'), null::uuid, null::uuid, now());
  perform private.emit_event('sos.raised',
    ('{"alert_id": "' || gen_random_uuid() || '", "lat": 21.1463, "lon": 79.0882, "abuse_suspected": false}')::jsonb,
    'sos:ledger:1', 'user', pg_temp.id('site'), pg_temp.id('run'), pg_temp.id('machine'), pg_temp.id('op_ravi'));
  perform private.emit_event('incident.reported',
    '{"incident_type": "near_miss", "severity": 2, "description": "ढलान पर फिसलन, कोई चोट नहीं", "non_punitive": true, "lat": 21.1464, "lon": 79.0883}'::jsonb,
    'inc:ledger:1', 'user', pg_temp.id('site'), pg_temp.id('run'), null::uuid, pg_temp.id('op_other'));
  assert (select count(*) from private.ledger_queue where written_incident_id is null and error is null) = 3, 'three queue rows';

  n := private.ledger_drain();
  assert n = 3, 'drain wrote three entries, got ' || n;
  -- the drain holds advisory lock 4210001 for the whole transaction (N3)
  assert exists (select 1 from pg_locks where locktype = 'advisory' and classid = 0 and objid = 4210001
                   and objsubid = 1 and pid = pg_backend_pid()), 'drain takes lock 4210001';
  assert (select count(*) from private.ledger_queue where written_incident_id is null) = 0, 'every queue row written';
  assert (select count(*) from private.ledger_queue where error is not null) = 0, 'no drain errors';
  assert private.ledger_drain() = 0, 'a second drain writes nothing (idempotent)';
  assert (select count(*) from public.events where type = 'incident.logged') = 3, 'one incident.logged per entry';
end $$;

-- chain shape: gap-free seq, genesis anchored at 64 zeros, every link and every hash recomputes
do $$
declare r public.incidents%rowtype; v_prev text := repeat('0', 64); v_expect bigint; v_first bigint;
begin
  select min(seq) into v_first from public.incidents;
  v_expect := v_first;
  for r in select * from public.incidents order by seq loop
    assert r.seq = v_expect, 'seq is gap-free';
    if r.seq = 1 then assert r.prev_hash = repeat('0', 64), 'genesis prev_hash is 64 zeros'; end if;
    if r.seq > v_first then assert r.prev_hash::text = v_prev, 'link at seq ' || r.seq; end if;
    assert private.ledger_hash(private.ledger_entry_of(r)) = r.entry_hash::text, 'hash at seq ' || r.seq;
    assert r.canon_version = 1, 'canon_version 1';
    v_prev := r.entry_hash::text;
    v_expect := r.seq + 1;
  end loop;
  -- the fields the drain derived
  assert (select incident_type from public.incidents where idempotency_key = 'ledger:det:ledger:seatbelt:1') = 'seatbelt_breach', 'seatbelt mapping';
  assert (select severity from public.incidents where idempotency_key = 'ledger:det:ledger:seatbelt:1') = 4, 'warning → severity 4';
  assert (select reporter_kind from public.incidents where idempotency_key = 'ledger:det:ledger:seatbelt:1') = 'detector', 'detector reporter';
  assert (select severity from public.incidents where idempotency_key = 'ledger:sos:ledger:1') = 5, 'critical → severity 5';
  assert (select lat from public.incidents where idempotency_key = 'ledger:sos:ledger:1') = 21.146300, 'lat from the payload';
  assert (select non_punitive from public.incidents where idempotency_key = 'ledger:inc:ledger:1'), 'near miss is non-punitive';
  assert (select description from public.incidents where idempotency_key = 'ledger:inc:ledger:1') = 'ढलान पर फिसलन, कोई चोट नहीं', 'Devanagari survives the round trip';
  -- context numbers are stored as text, so nothing is ever re-formatted at hash time
  assert (select context -> 'speed_kmh' from public.incidents where idempotency_key = 'ledger:det:ledger:seatbelt:1') = '"6.2"'::jsonb, 'context numbers become text';
end $$;

-- ── 5. Append-only ───────────────────────────────────────────────────────────────────────────────
do $$
declare v_id uuid;
begin
  select id into v_id from public.incidents order by seq limit 1;
  begin
    insert into public.incidents (seq, idempotency_key, occurred_at, recorded_at, incident_type, severity,
      site_id, description, reporter_kind, prev_hash, entry_hash)
    values (9999, 'ledger:hand-written', now(), now(), 'manual', 3, pg_temp.id('site'), 'x', 'system',
      repeat('0', 64), repeat('a', 64));
    raise exception 'a hand-written incident was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.incidents set description = 'tampered' where id = v_id;
    raise exception 'an incident was updatable';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.incidents where id = v_id;
    raise exception 'an incident was deletable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── 6. Export, verify, recompute ─────────────────────────────────────────────────────────────────
do $$
declare v_first bigint; v_last bigint; res jsonb; rec jsonb; n int; keys text[];
begin
  select min(seq), max(seq) into v_first, v_last from public.incidents;
  select count(*) into n from public.ledger_export(v_first, v_last);
  assert n = 3, 'export returns the range';
  select array_agg(k order by k collate "C") into keys
    from (select jsonb_object_keys(e.canonical_fields) as k from public.ledger_export(v_first, v_first) e) s;
  assert keys = array['context', 'description', 'incident_type', 'lat', 'lon', 'machine_id', 'non_punitive',
    'occurred_at', 'operator_id', 'prev_hash', 'recorded_at', 'reported_by', 'reporter_kind', 'run_id',
    'seq', 'severity', 'site_id', 'source_event_id', 'supersedes_seq', 'v'], 'export carries the 20 canonical fields';
  -- every exported row rehashes to its entry_hash with no server help (what the browser does)
  assert not exists (select 1 from public.ledger_export(v_first, v_last) e
                     where private.ledger_hash(e.canonical_fields) <> e.entry_hash), 'exported rows rehash';
  begin
    perform public.ledger_export(v_first, v_first + 5000);
    raise exception 'an over-long export was accepted';
  exception when raise_exception then
    if sqlerrm <> 'validation' then raise; end if;
  end;

  res := public.ledger_verify(1, null);
  assert (res ->> 'ok')::boolean, 'internal verify passes: ' || res::text;
  assert (res ->> 'checked')::int = 3, 'verify checked three rows';
  assert (res ->> 'head_seq')::bigint = v_last, 'head seq';
  assert exists (select 1 from pg_locks where locktype = 'advisory' and classid = 0 and objid = 4210001
                   and objsubid = 1 and pid = pg_backend_pid()), 'verify takes lock 4210001';
  assert (select count(*) from public.events where type = 'ledger.verified') = 1, 'verify emits ledger.verified';

  rec := public.ledger_recompute(v_first, v_last);
  assert rec ->> 'root_hex' = encode(private.ledger_merkle_root(v_first, v_last), 'hex'), 'recompute root';
  assert rec ->> 'head_hash' = (select entry_hash::text from public.incidents where seq = v_last), 'recompute head';
  assert (rec ->> 'leaf_count')::int = 3, 'recompute leaf count';
end $$;

-- ── 7. Checkpoint: the witness line, the dispatch and the anchor (data-model §4.5) ───────────────
do $$
declare ck jsonb; d public.dispatches%rowtype; v_line text;
begin
  ck := private.ledger_checkpoint();
  assert exists (select 1 from pg_locks where locktype = 'advisory' and classid = 0 and objid = 4210001
                   and objsubid = 1 and pid = pg_backend_pid()), 'checkpoint takes lock 4210001';
  select sent_text into v_line from public.ledger_roots where id = (ck ->> 'root_id')::uuid;
  assert v_line ~ ('^SPOTTER-LEDGER v1 seq=\d+\.\.\d+ n=\d+ root=[0-9a-f]{64} head=[0-9a-f]{64} at=\d{2}:\d{2} IST$'),
    'witness line shape: ' || v_line;
  assert v_line like '%root=' || (ck ->> 'root_hex') || '%', 'the line carries the root';
  assert v_line like '%head=' || (ck ->> 'head_hash') || '%', 'the line carries the head';
  assert (ck ->> 'root_hex') = encode(private.ledger_merkle_root((ck ->> 'first_seq')::bigint, (ck ->> 'last_seq')::bigint), 'hex'), 'checkpoint root';
  select * into d from public.dispatches where id = (ck ->> 'dispatch_id')::uuid;
  assert d.purpose = 'ledger_checkpoint' and d.channel = 'telegram' and d.site_id is null, 'site-less telegram dispatch';
  assert d.recipient_ref = 'TELEGRAM_SUPERVISOR_CHAT_ID', 'recipient is a secret NAME, never a chat number';
  assert d.body ->> 'text' = v_line, 'the dispatch carries the line';
  assert (select count(*) from public.events where type = 'ledger.checkpoint_published') = 1, 'checkpoint event emitted';
  -- the checkpoint kick must not park a credential in the world-readable pg_net queue (002d)
  assert not exists (select 1 from net.http_request_queue q
                     where q.url like '%/dispatch' and (q.headers ? 'apikey' or q.headers ? 'Authorization')),
    'the dispatch kick carries no credential';
  -- the anchor the internal verify compares against
  assert ((public.ledger_verify(1, null)) ->> 'ok')::boolean, 'verify still passes with an anchor present';
end $$;

-- ── 8. Tamper demo (data-model §4.6) ─────────────────────────────────────────────────────────────
-- 8a. naive edit: one row's bytes change, its hash does not → hash_mismatch at that seq
do $$
declare res jsonb; v_seq bigint;
begin
  select min(seq) into v_seq from public.incidents;
  perform private.demo_tamper(v_seq, 'edit');
  assert exists (select 1 from pg_locks where locktype = 'advisory' and classid = 0 and objid = 4210001
                   and objsubid = 1 and pid = pg_backend_pid()), 'demo_tamper takes lock 4210001';
  res := public.ledger_verify(1, null);
  assert not (res ->> 'ok')::boolean, 'an edited row must fail the internal verify';
  assert res ->> 'reason' = 'hash_mismatch', 'reason is hash_mismatch, got ' || coalesce(res ->> 'reason', 'null');
  assert (res ->> 'first_bad_seq')::bigint = v_seq, 'the first bad seq is the edited row';
  assert (res ->> 'expected') is not null and (res ->> 'stored') is not null, 'verify reports both hashes';
  assert (select count(*) from public.events where type = 'ledger.tamper_detected') = 1, 'a failed verify emits ledger.tamper_detected';
end $$;

-- 8b. consistent rewrite: every later hash AND the stored root AND head are rewritten, so the database
--     agrees with itself — and only the line already sent to Telegram still disagrees. That gap is the proof.
do $$
declare res jsonb; rec jsonb; v_seq bigint; v_first bigint; v_last bigint; v_sent text; v_sent_root text;
begin
  select min(seq), max(seq) into v_first, v_last from public.incidents;
  select sent_text into v_sent from public.ledger_roots order by created_at desc, id desc limit 1;
  v_sent_root := substring(v_sent from 'root=([0-9a-f]{64})');

  perform private.demo_tamper(v_first, 'rehash');

  res := public.ledger_verify(1, null);
  assert (res ->> 'ok')::boolean, 'after a consistent rewrite the internal verify passes: ' || res::text;
  rec := public.ledger_recompute(v_first, v_last);
  assert rec ->> 'root_hex' <> v_sent_root, 'the recomputed root must differ from the witnessed one';
  assert (select root_hex::text from public.ledger_roots order by created_at desc, id desc limit 1) = rec ->> 'root_hex',
    'demo_tamper rewrote ledger_roots.root_hex';
  assert (select head_hash::text from public.ledger_roots order by created_at desc, id desc limit 1) = rec ->> 'head_hash',
    'demo_tamper rewrote ledger_roots.head_hash';
  assert (select sent_text from public.ledger_roots order by created_at desc, id desc limit 1) = v_sent,
    'sent_text is never rewritten: it is what the fleet manager already has';
end $$;

-- ── 9. RLS, column grants and the export gate ────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_ravi'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.incidents) = 2, 'OP sees only own incidents';
  assert not has_column_privilege('authenticated', 'public.incidents', 'operator_id', 'SELECT'), 'operator_id is withheld from clients';
  assert not has_column_privilege('authenticated', 'public.incidents', 'reported_by', 'SELECT'), 'reported_by is withheld from clients';
  assert has_column_privilege('authenticated', 'public.incidents', 'entry_hash', 'SELECT'), 'hashes are readable';
  assert (select count(*) from public.ledger_roots) = 0, 'OP sees no checkpoints';
  begin
    perform public.ledger_export(1, 3);
    raise exception 'an operator exported the ledger';
  exception when raise_exception then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_anita'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.incidents) = 2, 'FM sees the site except the non-punitive row';
  assert (select count(*) from public.incidents where non_punitive) = 0, 'FM never sees a non-punitive row';
  assert (select count(*) from public.ledger_roots) = 1, 'FM sees the checkpoint';
  assert (select count(*) from public.ledger_export(1, 3)) = 3, 'FM may export the whole range';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u_trainer'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select count(*) from public.incidents) = 1, 'TR sees near misses only';
  assert (select count(*) from public.incidents where incident_type <> 'near_miss') = 0, 'TR sees nothing else';
end $$;
reset role;
