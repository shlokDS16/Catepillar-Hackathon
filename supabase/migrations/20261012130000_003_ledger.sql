-- Migration 003 — B5, the incident ledger (data-model §4, event-pipeline §5, ADR-001 decision 1).
--
-- 001/001b/001c/001d/002/002b/002c/002d are already applied to the shared project, so everything here is
-- additive and nothing above is edited.
--
-- Blocks, in order:
--   1. `public.incidents`      the append-only chain; `public.ledger_roots` the published checkpoints.
--   2. canonical v1            `ledger_canonical_text` + the validator, byte-identical to
--                              `packages/shared/src/ledger/canonical.ts` (golden vectors 1-3).
--   3. write path              `ledger_write_one` (validator + hash + insert) and `ledger_drain`
--                              (≤ 50 queue rows under advisory lock 4210001, one subtransaction each).
--   4. append-only             insert/update/delete triggers; only `ledger_write_one` inserts.
--   5. Merkle                  over the RAW 32-byte hashes, never the hex text (re-check (c)).
--   6. read paths              `v_ledger_canonical_input`, `ledger_export` (NO lock: one SELECT is
--                              snapshot-consistent), `ledger_verify` (internal only, 10 s lock timeout
--                              → `ledger_busy`), `ledger_recompute` ("server says", convenience only).
--   7. demo                    `ledger_checkpoint` (queues the Telegram witness line) and `demo_tamper`.
--   8. RLS, grants, comments.
--
-- Locking (N3): `ledger_drain`, `ledger_checkpoint`, `demo_tamper` and `ledger_verify` all take
-- `pg_advisory_xact_lock(4210001)` and hold it until their transaction commits. `ledger_export` and
-- `ledger_recompute` take no lock — a single SELECT already sees one snapshot — so a checkpoint can
-- never mix a root over 1..N with a head of N+1, and Verify never blocks the writer for longer than
-- its own short transaction.
--
-- pg_net: nothing here puts a credential into `net.http_request_queue`. The only outbound request is
-- the checkpoint dispatch, kicked by `private.dispatch_kick` (002d), whose body is the dispatch id alone.

-- ════ 1. Tables ═══════════════════════════════════════════════════════════════════════════════════

-- data-model §4.1. `run_id` and `source_event_id` carry NO foreign key: `purge_run` may delete a
-- rehearsal run and its events, and the ledger is never purged (§4.7, re-check #15 residual). A cascade
-- or `on delete set null` there would mutate a hashed row and break the chain.
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  seq bigint not null unique,                   -- assigned by the drain under lock 4210001, gap-free
  idempotency_key text not null unique,         -- 'ledger:' || events.idempotency_key
  run_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null,
  incident_type public.incident_type not null,
  severity smallint not null check (severity between 1 and 5),
  site_id uuid not null references public.sites(id),
  operator_id uuid references public.operators(id),
  machine_id uuid references public.machines(id),
  lat numeric(9,6),
  lon numeric(9,6),
  description text not null,
  context jsonb not null default '{}' check (jsonb_typeof(context) = 'object'),
  reported_by uuid,
  reporter_kind text not null check (reporter_kind in ('detector', 'operator', 'supervisor', 'system')),
  source_event_id uuid,
  supersedes_seq bigint,
  non_punitive boolean not null default false,
  prev_hash char(64) not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  entry_hash char(64) not null check (entry_hash ~ '^[0-9a-f]{64}$'),
  canon_version smallint not null default 1
);
create index if not exists incidents_operator_idx on public.incidents (operator_id, seq desc);
create index if not exists incidents_site_idx on public.incidents (site_id, seq desc);
create index if not exists incidents_run_idx on public.incidents (run_id);
create index if not exists incidents_type_idx on public.incidents (incident_type);
create index if not exists incidents_occurred_idx on public.incidents (occurred_at);

-- data-model §4.5: what was sent to Telegram, for display and for the server-side anchor check only.
-- `sent_text` is deliberately never rewritten by `demo_tamper`: the human's copy is the witness.
create table if not exists public.ledger_roots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_seq bigint not null,
  last_seq bigint not null,
  leaf_count int not null,
  root_hex char(64) not null check (root_hex ~ '^[0-9a-f]{64}$'),
  head_hash char(64) not null check (head_hash ~ '^[0-9a-f]{64}$'),
  sent_text text not null,
  dispatch_id uuid references public.dispatches(id),
  telegram_chat_ref text,                       -- name of an Edge Function secret, never a chat number
  telegram_message_id bigint                    -- filled by the dispatch function; display only (N1)
);
create index if not exists ledger_roots_created_idx on public.ledger_roots (created_at desc);

-- ════ 2. Canonical serialisation v1 (data-model §4.3) ═════════════════════════════════════════════

-- Rule 4: reject any code point < U+0020, then escape only `"` and `\`. Everything else, Devanagari
-- included, is emitted raw as UTF-8. The scan is explicit rather than a regex class so that "code point
-- below 32" means exactly that, in any collation.
create or replace function private.ledger_canonical_string(p_text text)
returns text language plpgsql immutable strict set search_path = '' as $$
begin
  if exists (select 1 from generate_series(1, length(p_text)) as g(i)
             where ascii(substr(p_text, g.i, 1)) < 32) then
    raise exception 'canonical v1: string contains a control character (< U+0020)' using errcode = 'P0001';
  end if;
  return '"' || replace(replace(p_text, '\', '\\'), '"', '\"') || '"';
end $$;

-- The canonical text of any canonical-v1 value. Keys are sorted by byte value (`collate "C"`) at every
-- level; JSON numbers are refused outright, so no float formatting decision ever exists.
create or replace function private.ledger_canonical_text(p_value jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare v_type text; v_parts text[] := '{}'; v_key text; v_child jsonb;
begin
  if p_value is null then
    raise exception 'canonical v1: SQL NULL is not a JSON value' using errcode = 'P0001';
  end if;
  v_type := jsonb_typeof(p_value);
  if v_type = 'null' then
    return 'null';
  elsif v_type = 'boolean' then
    return case when p_value = 'true'::jsonb then 'true' else 'false' end;
  elsif v_type = 'number' then
    raise exception 'canonical v1: JSON numbers are not allowed (format the value as a string)' using errcode = 'P0001';
  elsif v_type = 'string' then
    return private.ledger_canonical_string(p_value #>> '{}');
  elsif v_type = 'array' then
    select coalesce(array_agg(private.ledger_canonical_text(e.value) order by e.ord), '{}')
      into v_parts
      from jsonb_array_elements(p_value) with ordinality as e(value, ord);
    return '[' || array_to_string(v_parts, ',') || ']';
  elsif v_type = 'object' then
    for v_key, v_child in
      select o.key, o.value from jsonb_each(p_value) as o order by o.key collate "C"
    loop
      if v_key !~ '^[a-z0-9_]+$' then
        raise exception 'canonical v1: key % is not ASCII [a-z0-9_]', v_key using errcode = 'P0001';
      end if;
      v_parts := v_parts || (private.ledger_canonical_string(v_key) || ':' || private.ledger_canonical_text(v_child));
    end loop;
    return '{' || array_to_string(v_parts, ',') || '}';
  end if;
  raise exception 'canonical v1: unsupported JSON type %', v_type using errcode = 'P0001';
end $$;

-- `entry_hash = lower-hex(sha256(utf8(canonical)))` (rule 6).
create or replace function private.ledger_hash(p_entry jsonb)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(private.ledger_canonical_text(p_entry), 'UTF8')), 'hex')
$$;

-- Rule 2: the context snapshot is taken with every JSON number already rendered as `numeric::text`
-- (never `to_char`, which would add a leading space). Event payloads are built by TypeScript, so the
-- drain runs them through this on the way in; by the time anything is hashed there are no numbers left.
create or replace function private.ledger_numbers_to_text(p_value jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_type text; v_out jsonb;
begin
  if p_value is null then return null; end if;
  v_type := jsonb_typeof(p_value);
  if v_type = 'number' then
    return to_jsonb((p_value #>> '{}')::numeric::text);
  elsif v_type = 'array' then
    select coalesce(jsonb_agg(private.ledger_numbers_to_text(e.value) order by e.ord), '[]'::jsonb)
      into v_out from jsonb_array_elements(p_value) with ordinality as e(value, ord);
    return v_out;
  elsif v_type = 'object' then
    select coalesce(jsonb_object_agg(o.key, private.ledger_numbers_to_text(o.value)), '{}'::jsonb)
      into v_out from jsonb_each(p_value) as o;
    return v_out;
  end if;
  return p_value;
end $$;

-- The canonical input of one stored row: the 20 top-level fields of data-model §4.3 rule 3, as text.
-- This is also exactly what `ledger_export` hands the browser verifier.
create or replace function private.ledger_entry_of(p_row public.incidents)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'v',               p_row.canon_version::text,
    'seq',             p_row.seq::text,
    'prev_hash',       p_row.prev_hash::text,
    'run_id',          p_row.run_id::text,
    'occurred_at',     to_char(p_row.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'recorded_at',     to_char(p_row.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'incident_type',   p_row.incident_type::text,
    'severity',        p_row.severity::text,
    'site_id',         p_row.site_id::text,
    'operator_id',     p_row.operator_id::text,
    'machine_id',      p_row.machine_id::text,
    'lat',             p_row.lat::numeric(9,6)::text,
    'lon',             p_row.lon::numeric(9,6)::text,
    'description',     p_row.description,
    'context',         coalesce(p_row.context, '{}'::jsonb),
    'reported_by',     p_row.reported_by::text,
    'reporter_kind',   p_row.reporter_kind,
    'source_event_id', p_row.source_event_id::text,
    'supersedes_seq',  p_row.supersedes_seq::text,
    'non_punitive',    p_row.non_punitive)
$$;

-- The validator of data-model §4.3 ("every rule is enforced before hashing, so both implementations only
-- ever see the restricted domain"). It runs inside `ledger_write_one`; a row that fails never reaches the
-- table, so a stored row can always be re-canonicalised.
create or replace function private.ledger_validate_entry(p_entry jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare v_keys text[]; v_expect text[] := array[
  'context', 'description', 'incident_type', 'lat', 'lon', 'machine_id', 'non_punitive', 'occurred_at',
  'operator_id', 'prev_hash', 'recorded_at', 'reported_by', 'reporter_kind', 'run_id', 'seq', 'severity',
  'site_id', 'source_event_id', 'supersedes_seq', 'v'];
  v_uuid text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_ts text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$';
  v_key text;
begin
  if jsonb_typeof(p_entry) is distinct from 'object' then
    raise exception 'canonical v1: an entry must be a JSON object' using errcode = 'P0001';
  end if;
  select array_agg(t.k order by t.k collate "C") into v_keys from jsonb_object_keys(p_entry) as t(k);
  if v_keys is distinct from v_expect then
    raise exception 'canonical v1: an entry must carry exactly the 20 fields of data-model §4.3 (got %)',
      array_to_string(coalesce(v_keys, '{}'), ',') using errcode = 'P0001';
  end if;
  -- strings that must be non-null and shaped
  if p_entry ->> 'v' <> '1' then raise exception 'canonical v1: v must be "1"' using errcode = 'P0001'; end if;
  if (p_entry ->> 'seq') !~ '^[0-9]+$' then raise exception 'canonical v1: seq must be integer text' using errcode = 'P0001'; end if;
  if (p_entry ->> 'severity') !~ '^[1-5]$' then raise exception 'canonical v1: severity must be 1-5 as text' using errcode = 'P0001'; end if;
  if (p_entry ->> 'prev_hash') !~ '^[0-9a-f]{64}$' then raise exception 'canonical v1: prev_hash must be 64 lower-case hex' using errcode = 'P0001'; end if;
  if (p_entry ->> 'site_id') !~ v_uuid then raise exception 'canonical v1: site_id must be a lower-case uuid' using errcode = 'P0001'; end if;
  if (p_entry ->> 'occurred_at') !~ v_ts or (p_entry ->> 'recorded_at') !~ v_ts then
    raise exception 'canonical v1: timestamps must be YYYY-MM-DDTHH:MM:SS.ssssssZ text' using errcode = 'P0001';
  end if;
  if (p_entry ->> 'reporter_kind') not in ('detector', 'operator', 'supervisor', 'system') then
    raise exception 'canonical v1: unknown reporter_kind' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_entry -> 'non_punitive') <> 'boolean' then
    raise exception 'canonical v1: non_punitive must be a JSON boolean' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_entry -> 'context') <> 'object' then
    raise exception 'canonical v1: context must be a JSON object' using errcode = 'P0001';
  end if;
  -- nullable strings: null, or text of the right shape
  foreach v_key in array array['run_id', 'operator_id', 'machine_id', 'reported_by', 'source_event_id'] loop
    if jsonb_typeof(p_entry -> v_key) = 'string' and (p_entry ->> v_key) !~ v_uuid then
      raise exception 'canonical v1: % must be a lower-case uuid or null', v_key using errcode = 'P0001';
    elsif jsonb_typeof(p_entry -> v_key) not in ('string', 'null') then
      raise exception 'canonical v1: % must be a string or null', v_key using errcode = 'P0001';
    end if;
  end loop;
  foreach v_key in array array['lat', 'lon'] loop
    if jsonb_typeof(p_entry -> v_key) = 'string' and (p_entry ->> v_key) !~ '^-?[0-9]+\.[0-9]{6}$' then
      raise exception 'canonical v1: % must be numeric(9,6) text (6 decimals) or null', v_key using errcode = 'P0001';
    elsif jsonb_typeof(p_entry -> v_key) not in ('string', 'null') then
      raise exception 'canonical v1: % must be a string or null', v_key using errcode = 'P0001';
    end if;
  end loop;
  if jsonb_typeof(p_entry -> 'supersedes_seq') = 'string' and (p_entry ->> 'supersedes_seq') !~ '^[0-9]+$' then
    raise exception 'canonical v1: supersedes_seq must be integer text or null' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_entry -> 'description') <> 'string' then
    raise exception 'canonical v1: description must be a string' using errcode = 'P0001';
  end if;
  -- the remaining rules (key charset, no numbers, no control characters) are what the canonicaliser enforces
  perform private.ledger_canonical_text(p_entry);
end $$;

-- ════ 3. Write path: the drain (data-model §4.2) ══════════════════════════════════════════════════

-- `events` → canonical incident fields. One event type → one incident type; severity comes from the
-- event tier (critical 5, warning 4, caution 2, info/none 1) except for `incident.reported`, which
-- carries its own. Wording here is the ledger's own record, not the operator-facing alert text (B12).
create or replace function private.ledger_fields_from_event(p_event public.events)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_type public.incident_type; v_sev smallint; v_desc text; v_reporter text; v_non_punitive boolean;
begin
  case p_event.type
    when 'safety.seatbelt_breach'        then v_type := 'seatbelt_breach';
    when 'guardian.hazard_near_operator' then v_type := 'guardian_hazard';
    when 'sos.raised'                    then v_type := 'sos';
    when 'ppe.override_granted'          then v_type := 'ppe_override';
    when 'incident.reported'             then v_type := coalesce(p_event.payload ->> 'incident_type', 'manual')::public.incident_type;
    else raise exception 'ledger: event type % has no incident mapping', p_event.type using errcode = 'P0001';
  end case;

  v_sev := case
    when p_event.type = 'incident.reported' then coalesce((p_event.payload ->> 'severity')::smallint, 3)
    else case p_event.tier::text when 'critical' then 5 when 'warning' then 4 when 'caution' then 2 else 1 end
  end;

  v_desc := case p_event.type
    when 'safety.seatbelt_breach'        then 'Seatbelt not fastened while moving at ' || coalesce(p_event.payload ->> 'speed_kmh', '?') || ' km/h.'
    when 'guardian.hazard_near_operator' then 'Anomalous machine ' || coalesce(p_event.payload ->> 'machine_code', '?') || ' within ' || coalesce(p_event.payload ->> 'distance_m', '?') || ' m of the operator.'
    when 'sos.raised'                    then 'SOS raised by the operator.'
    when 'ppe.override_granted'          then 'PPE override granted: ' || coalesce(p_event.payload ->> 'reason', '')
    else coalesce(p_event.payload ->> 'description', '')
  end;

  v_reporter := case
    when p_event.type = 'ppe.override_granted' then 'supervisor'
    when p_event.source in ('detector.rule', 'detector.ewma', 'guardian') then 'detector'
    when p_event.source = 'user' then 'operator'
    else 'system' end;

  v_non_punitive := coalesce((p_event.payload ->> 'non_punitive')::boolean, v_type = 'near_miss');

  return jsonb_build_object(
    'incident_type', v_type::text,
    'severity', v_sev::text,
    'description', v_desc,
    'reporter_kind', v_reporter,
    'non_punitive', v_non_punitive,
    'lat', (p_event.payload ->> 'lat'),
    'lon', (p_event.payload ->> 'lon'),
    'context', private.ledger_numbers_to_text(p_event.payload));
end $$;

-- Writes exactly one queue row. Validates, hashes, inserts under the caller's advisory lock, marks the
-- queue row and emits `incident.logged`. Idempotent: a row already written returns its incident.
create or replace function private.ledger_write_one(p_queue_id bigint)
returns public.incidents language plpgsql security definer set search_path = '' as $$
declare q private.ledger_queue%rowtype; ev public.events%rowtype; inc public.incidents%rowtype;
        f jsonb; v_entry jsonb;
begin
  select * into q from private.ledger_queue where id = p_queue_id for update;
  if not found then raise exception 'ledger: queue row % not found', p_queue_id using errcode = 'P0001'; end if;
  if q.written_incident_id is not null then
    select * into inc from public.incidents where id = q.written_incident_id;
    return inc;
  end if;
  select * into ev from public.events where id = q.event_id;
  if not found then raise exception 'ledger: event % has disappeared', q.event_id using errcode = 'P0001'; end if;

  f := private.ledger_fields_from_event(ev);

  select i.seq, i.entry_hash into inc.seq, inc.prev_hash from public.incidents i order by i.seq desc limit 1;
  inc.seq := coalesce(inc.seq, 0) + 1;
  inc.prev_hash := coalesce(inc.prev_hash, repeat('0', 64));

  inc.id := gen_random_uuid();
  inc.idempotency_key := q.idempotency_key;
  inc.run_id := ev.run_id;
  inc.occurred_at := coalesce(ev.sim_ts, ev.recorded_at);
  inc.recorded_at := now();
  inc.incident_type := (f ->> 'incident_type')::public.incident_type;
  inc.severity := (f ->> 'severity')::smallint;
  inc.site_id := ev.site_id;
  inc.operator_id := ev.operator_id;
  inc.machine_id := ev.machine_id;
  inc.lat := (f ->> 'lat')::numeric(9,6);
  inc.lon := (f ->> 'lon')::numeric(9,6);
  inc.description := f ->> 'description';
  inc.context := f -> 'context';
  inc.reporter_kind := f ->> 'reporter_kind';
  inc.reported_by := case when inc.reporter_kind = 'operator' then ev.operator_id end;
  inc.source_event_id := ev.id;
  inc.supersedes_seq := null;
  inc.non_punitive := (f ->> 'non_punitive')::boolean;
  inc.canon_version := 1;

  v_entry := private.ledger_entry_of(inc);
  perform private.ledger_validate_entry(v_entry);
  inc.entry_hash := private.ledger_hash(v_entry);

  perform set_config('spotter.ledger_write', 'on', true);
  insert into public.incidents (id, seq, idempotency_key, run_id, occurred_at, recorded_at, incident_type,
    severity, site_id, operator_id, machine_id, lat, lon, description, context, reported_by, reporter_kind,
    source_event_id, supersedes_seq, non_punitive, prev_hash, entry_hash, canon_version)
  values (inc.id, inc.seq, inc.idempotency_key, inc.run_id, inc.occurred_at, inc.recorded_at, inc.incident_type,
    inc.severity, inc.site_id, inc.operator_id, inc.machine_id, inc.lat, inc.lon, inc.description, inc.context,
    inc.reported_by, inc.reporter_kind, inc.source_event_id, inc.supersedes_seq, inc.non_punitive,
    inc.prev_hash, inc.entry_hash, inc.canon_version);
  perform set_config('spotter.ledger_write', 'off', true);

  update private.ledger_queue set written_incident_id = inc.id, error = null where id = p_queue_id;

  perform private.emit_event('incident.logged',
    jsonb_build_object('incident_id', inc.id, 'seq', inc.seq, 'incident_type', inc.incident_type,
                                  'entry_hash', inc.entry_hash, 'ledger_queue_id', q.id),
    'ledgerlog:' || q.idempotency_key, 'system', inc.site_id, inc.run_id, inc.machine_id, inc.operator_id,
    ev.task_id, null::uuid, ev.sim_ts, null::public.alert_tier, ev.correlation_id, ev.id);

  return inc;
end $$;

-- The `worker` job's ledger step (event-pipeline §0 step 1), as a plain function so the SQL tests can run
-- it inside `begin … rollback` (R2-1). The procedure that COMMITs around it belongs to B9.
-- The advisory lock is taken once and held until this transaction commits: at most one drain at a time.
create or replace function private.ledger_drain(p_limit int default 50)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_written int := 0;
begin
  perform pg_advisory_xact_lock(4210001);
  for r in
    select id from private.ledger_queue
    where written_incident_id is null and error is null
    order by id limit least(greatest(p_limit, 0), 50)
  loop
    begin                                       -- its own subtransaction: one bad row never stops the drain
      perform private.ledger_write_one(r.id);
      v_written := v_written + 1;
    exception when others then
      update private.ledger_queue set error = left(sqlerrm, 500) where id = r.id;
    end;
  end loop;
  return v_written;
end $$;

-- ════ 4. Append-only ══════════════════════════════════════════════════════════════════════════════

create or replace function private.incidents_block_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('spotter.ledger_write', true), 'off') <> 'on' then
    raise exception 'incidents are written only by private.ledger_write_one' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.incidents_block_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- `private.demo_tamper` opens this window for its own transaction; nothing else ever sets the flag.
  if coalesce(current_setting('spotter.ledger_unlocked', true), 'off') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'incidents are append-only' using errcode = '42501';
end $$;

drop trigger if exists incidents_insert_guard on public.incidents;
create trigger incidents_insert_guard before insert on public.incidents
  for each row execute function private.incidents_block_insert();
drop trigger if exists incidents_no_mutation on public.incidents;
create trigger incidents_no_mutation before update or delete on public.incidents
  for each row execute function private.incidents_block_mutation();

-- ════ 5. Merkle over the RAW 32-byte hashes (data-model §4.5) ═════════════════════════════════════

-- leaf = sha256(0x00 ‖ hash bytes), parent = sha256(0x01 ‖ left ‖ right), an odd node is carried up
-- unchanged, an empty tree is sha256(''). The hex text is never hashed (re-check (c)).
create or replace function private.ledger_merkle_of(p_hashes text[])
returns bytea language plpgsql immutable set search_path = '' as $$
declare v_level bytea[] := '{}'; v_next bytea[]; v_i int; v_n int;
begin
  if p_hashes is null or cardinality(p_hashes) = 0 then
    return sha256(''::bytea);
  end if;
  for v_i in 1 .. cardinality(p_hashes) loop
    v_level := v_level || sha256('\x00'::bytea || decode(p_hashes[v_i], 'hex'));
  end loop;
  while cardinality(v_level) > 1 loop
    v_next := '{}';
    v_n := cardinality(v_level);
    v_i := 1;
    while v_i <= v_n loop
      if v_i = v_n then
        v_next := v_next || v_level[v_i];                                              -- odd node carried up
      else
        v_next := v_next || sha256('\x01'::bytea || v_level[v_i] || v_level[v_i + 1]);
      end if;
      v_i := v_i + 2;
    end loop;
    v_level := v_next;
  end loop;
  return v_level[1];
end $$;

create or replace function private.ledger_merkle_root(p_first_seq bigint, p_last_seq bigint)
returns bytea language sql stable set search_path = '' as $$
  select private.ledger_merkle_of(
    (select coalesce(array_agg(i.entry_hash::text order by i.seq), '{}'::text[])
       from public.incidents i where i.seq between p_first_seq and p_last_seq))
$$;

-- ════ 6. Read paths ═══════════════════════════════════════════════════════════════════════════════

-- Who may read the ledger's raw canonical fields: the fleet manager (she runs Verify), the service role,
-- and a direct owner connection with no request at all (scripts/verify-ledger.ts, the SQL tests, the SQL
-- editor). The owner branch is deliberately conditioned on the ABSENCE of JWT claims: PostgREST always
-- sets them, so no request — authenticated or anon — can take that branch, and the caller's role is read
-- from the claims rather than from `current_user`, which a security-definer body always reports as the
-- function owner.
create or replace function private.ledger_reader_ok()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_claims text := current_setting('request.jwt.claims', true);
begin
  if v_claims is null or v_claims = '' then return session_user in ('postgres', 'supabase_admin'); end if;
  if v_claims::jsonb ->> 'role' = 'service_role' then return true; end if;
  return coalesce(private.is_fm(), false);
end $$;

create or replace view public.v_ledger_canonical_input with (security_invoker = true) as
  select i.seq::text as seq, i.prev_hash::text as prev_hash, i.entry_hash::text as entry_hash,
         i.canon_version::text as v, private.ledger_entry_of(i::public.incidents) as canonical_fields
  from public.incidents i;

-- R2-2: the one call the browser verifier needs. NO advisory lock — a single SELECT is already
-- snapshot-consistent, so Verify never waits on the drain here (the lock only guards §6's internal check).
-- Privacy note: the canonical fields include `operator_id`, including for `non_punitive` rows that RLS
-- hides from the fleet manager elsewhere (§2.10). Integrity verification needs every byte of every row in
-- the range or the Merkle root cannot be reproduced, so no redaction is possible; the gate above is the
-- control. Raised for the reviewer.
create or replace function public.ledger_export(p_first_seq bigint, p_last_seq bigint)
returns table (seq text, prev_hash text, entry_hash text, v text, canonical_fields jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.ledger_reader_ok() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_first_seq is null or p_last_seq is null or p_first_seq < 1 or p_last_seq < p_first_seq then
    raise exception 'validation' using errcode = 'P0001';
  end if;
  if p_last_seq - p_first_seq + 1 > 5000 then raise exception 'validation' using errcode = 'P0001'; end if;
  return query
    select c.seq, c.prev_hash, c.entry_hash, c.v, c.canonical_fields
    from public.v_ledger_canonical_input c
    where c.seq::bigint between p_first_seq and p_last_seq
    order by c.seq::bigint;
end $$;

-- data-model §4.4: INTERNAL CONSISTENCY ONLY. It proves the database agrees with itself and with the
-- checkpoint row it stores; a database owner who rewrites every later hash *and* `ledger_roots` passes it.
-- The external check is the human comparison in §4.5, done in the browser.
create or replace function public.ledger_verify(p_from bigint default 1, p_to bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.incidents%rowtype; v_from bigint; v_to bigint; v_head_seq bigint; v_head_hash text;
        v_prev text; v_expect_seq bigint; v_checked int := 0; v_hash text;
        v_ok boolean := true; v_bad bigint; v_reason text; v_expected text; v_stored text;
        v_root public.ledger_roots%rowtype; v_recomputed text; v_site uuid;
begin
  if not private.ledger_reader_ok() then raise exception 'forbidden' using errcode = 'P0001'; end if;

  -- R2-5: wait at most 10 s for the drain (which writes ≤ 50 rows), then answer `ledger_busy`.
  set local lock_timeout = '10s';
  begin
    perform pg_advisory_xact_lock(4210001);
  exception when lock_not_available then
    raise exception 'ledger_busy' using errcode = 'P0001';
  end;

  select coalesce(max(i.seq), 0) into v_head_seq from public.incidents i;
  select i.entry_hash::text into v_head_hash from public.incidents i where i.seq = v_head_seq;
  v_head_hash := coalesce(v_head_hash, repeat('0', 64));
  v_from := greatest(coalesce(p_from, 1), 1);
  v_to := coalesce(p_to, v_head_seq);

  if v_from = 1 then
    v_prev := repeat('0', 64);
  else
    select i.entry_hash::text into v_prev from public.incidents i where i.seq = v_from - 1;
  end if;
  v_expect_seq := v_from;

  for r in select * from public.incidents i where i.seq between v_from and v_to order by i.seq loop
    v_checked := v_checked + 1;
    if r.seq <> v_expect_seq then
      v_ok := false; v_bad := v_expect_seq; v_reason := 'seq_gap';
      v_expected := null; v_stored := null;
      exit;
    end if;
    if v_prev is not null and r.prev_hash::text <> v_prev then
      v_ok := false; v_bad := r.seq; v_reason := 'link_broken';
      v_expected := v_prev; v_stored := r.prev_hash::text;
      exit;
    end if;
    v_hash := private.ledger_hash(private.ledger_entry_of(r));
    if v_hash <> r.entry_hash::text then
      v_ok := false; v_bad := r.seq; v_reason := 'hash_mismatch';
      v_expected := v_hash; v_stored := r.entry_hash::text;
      exit;
    end if;
    v_prev := r.entry_hash::text;
    v_expect_seq := r.seq + 1;
  end loop;

  -- a truncated tail: the range asked for rows that are not there
  if v_ok and v_to >= v_from and v_expect_seq <= least(v_to, v_head_seq) then
    v_ok := false; v_bad := v_expect_seq; v_reason := 'seq_gap';
  end if;

  -- anchor: the latest published checkpoint must still describe these rows
  if v_ok then
    select * into v_root from public.ledger_roots order by created_at desc, id desc limit 1;
    if v_root.id is not null then
      v_recomputed := encode(private.ledger_merkle_root(v_root.first_seq, v_root.last_seq), 'hex');
      if v_recomputed <> v_root.root_hex::text then
        v_ok := false; v_bad := v_root.last_seq; v_reason := 'anchor_mismatch';
        v_expected := v_recomputed; v_stored := v_root.root_hex::text;
      else
        select i.entry_hash::text into v_stored from public.incidents i where i.seq = v_root.last_seq;
        if v_stored is distinct from v_root.head_hash::text then
          v_ok := false; v_bad := v_root.last_seq; v_reason := 'anchor_mismatch';
          v_expected := v_stored; v_stored := v_root.head_hash::text;
        else
          v_expected := null; v_stored := null;
        end if;
      end if;
    end if;
  end if;

  -- event-pipeline §5 step 4: a failed check is itself an incident the supervisor must see.
  v_site := coalesce(private.my_site_id(), (select i.site_id from public.incidents i order by i.seq desc limit 1));
  if v_site is not null then
    perform private.emit_event(
      case when v_ok then 'ledger.verified' else 'ledger.tamper_detected' end,
      jsonb_build_object('ok', v_ok, 'checked', v_checked, 'first_bad_seq', v_bad, 'reason', v_reason),
      'ledgerverify:' || v_from || ':' || v_to || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
      'system', v_site);
  end if;

  return jsonb_build_object('ok', v_ok, 'checked', v_checked, 'first_bad_seq', v_bad,
    'reason', v_reason, 'expected', v_expected, 'stored', v_stored,
    'head_seq', v_head_seq, 'head_hash', v_head_hash);
end $$;

-- "Server says …" only (N1, R2-2). The browser never uses this number; it recomputes from
-- `ledger_export` with `@cat/shared/ledger`, so a redefined body here changes nothing it believes.
create or replace function public.ledger_recompute(p_first_seq bigint, p_last_seq bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_root text; v_head text;
begin
  if not private.ledger_reader_ok() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_first_seq is null or p_last_seq is null or p_first_seq < 1 or p_last_seq < p_first_seq then
    raise exception 'validation' using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.incidents i where i.seq between p_first_seq and p_last_seq;
  v_root := encode(private.ledger_merkle_root(p_first_seq, p_last_seq), 'hex');
  select i.entry_hash::text into v_head from public.incidents i where i.seq = p_last_seq;
  return jsonb_build_object('first_seq', p_first_seq, 'last_seq', p_last_seq, 'leaf_count', v_n,
    'root_hex', v_root, 'head_hash', coalesce(v_head, repeat('0', 64)));
end $$;

-- ════ 7. Checkpoint and the tamper demo ═══════════════════════════════════════════════════════════

-- Director command (and every `checkpoint_every_min` in demo mode, wired by B9). Takes lock 4210001, so
-- the root over 1..N and the head of N can never come from different moments (N3).
create or replace function private.ledger_checkpoint()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_first bigint; v_last bigint; v_n int; v_root text; v_head text; v_line text;
        v_root_id uuid; v_dispatch_id uuid; v_site uuid;
begin
  perform pg_advisory_xact_lock(4210001);
  select min(i.seq), max(i.seq), count(*) into v_first, v_last, v_n from public.incidents i;
  if coalesce(v_n, 0) = 0 then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_root := encode(private.ledger_merkle_root(v_first, v_last), 'hex');
  select i.entry_hash::text, i.site_id into v_head, v_site from public.incidents i where i.seq = v_last;
  v_line := 'SPOTTER-LEDGER v1 seq=' || v_first || '..' || v_last || ' n=' || v_n
            || ' root=' || v_root || ' head=' || v_head
            || ' at=' || to_char(now() at time zone 'Asia/Kolkata', 'HH24:MI') || ' IST';

  insert into public.ledger_roots (first_seq, last_seq, leaf_count, root_hex, head_hash, sent_text, telegram_chat_ref)
  values (v_first, v_last, v_n, v_root, v_head, v_line, 'TELEGRAM_SUPERVISOR_CHAT_ID')
  returning id into v_root_id;

  -- The kick (002d) posts only {dispatch_id} through pg_net: no secret transits the public queue.
  insert into public.dispatches (subject_id, site_id, purpose, channel, recipient_ref, recipient_role, body)
  values (v_root_id, null, 'ledger_checkpoint', 'telegram', 'TELEGRAM_SUPERVISOR_CHAT_ID', 'fleet_manager',
          jsonb_build_object('text', v_line, 'root_id', v_root_id))
  returning id into v_dispatch_id;
  update public.ledger_roots set dispatch_id = v_dispatch_id where id = v_root_id;

  perform private.emit_event('ledger.checkpoint_published',
    jsonb_build_object('root_id', v_root_id, 'root_hex', v_root, 'head_hash', v_head,
      'first_seq', v_first, 'last_seq', v_last, 'telegram_message_id', null),
    'ledgerckpt:' || v_root_id::text, 'system', v_site);

  return jsonb_build_object('root_id', v_root_id, 'root_hex', v_root, 'head_hash', v_head,
    'first_seq', v_first, 'last_seq', v_last, 'leaf_count', v_n, 'sent_text', v_line,
    'telegram_message_id', null, 'dispatch_id', v_dispatch_id);
end $$;

-- data-model §4.6. `edit` is the naive tamper (Verify fails with hash_mismatch). `rehash` is the
-- consistent one: every later hash is rewritten AND the latest checkpoint's `root_hex` AND `head_hash`
-- are rewritten with it, so the internal Verify says ✓ — and the only thing that still disagrees is the
-- line in Anita's Telegram chat (`sent_text` is never touched). That gap is the proof (re-check G2-4).
create or replace function private.demo_tamper(p_seq bigint, p_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.incidents%rowtype; v_prev text; v_hash text; v_rewritten int := 0; v_root_id uuid;
begin
  if not (select a.demo_mode from public.app_config a where a.id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_mode not in ('edit', 'rehash') then raise exception 'validation' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(4210001);
  if not exists (select 1 from public.incidents i where i.seq = p_seq) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  perform set_config('spotter.ledger_unlocked', 'on', true);
  update public.incidents set description = description || ' [DEMO TAMPER]' where seq = p_seq;

  if p_mode = 'rehash' then
    if p_seq <= 1 then
      v_prev := repeat('0', 64);
    else
      select i.entry_hash::text into v_prev from public.incidents i where i.seq = p_seq - 1;
    end if;
    for r in select * from public.incidents i where i.seq >= p_seq order by i.seq loop
      r.prev_hash := v_prev;
      v_hash := private.ledger_hash(private.ledger_entry_of(r));
      update public.incidents set prev_hash = v_prev, entry_hash = v_hash where seq = r.seq;
      v_prev := v_hash;
      v_rewritten := v_rewritten + 1;
    end loop;
    -- the stored anchor is rewritten too (root_hex AND head_hash); `sent_text` is deliberately not
    update public.ledger_roots lr
      set root_hex = encode(private.ledger_merkle_root(lr.first_seq, lr.last_seq), 'hex'),
          head_hash = (select i.entry_hash::text from public.incidents i where i.seq = lr.last_seq)
      where lr.id = (select l.id from public.ledger_roots l order by l.created_at desc, l.id desc limit 1)
      returning lr.id into v_root_id;
  end if;
  perform set_config('spotter.ledger_unlocked', 'off', true);

  return jsonb_build_object('seq', p_seq, 'mode', p_mode, 'rows_rehashed', v_rewritten,
    'root_rewritten', v_root_id);
end $$;

-- ════ 8. RLS, grants, comments ════════════════════════════════════════════════════════════════════

alter table public.incidents enable row level security;
alter table public.ledger_roots enable row level security;

-- data-model §4.1 / §2.10: operators see their own rows; the fleet manager sees her site except the
-- non-punitive ones; a trainer sees near misses only (and never the identity columns, see the grant).
drop policy if exists incidents_read on public.incidents;
create policy incidents_read on public.incidents for select to authenticated using (
  operator_id = (select private.my_operator_id())
  or ((select private.is_fm()) and site_id = (select private.my_site_id()) and not non_punitive)
  or ((select private.app_role()) = 'trainer' and incident_type = 'near_miss')
);
drop policy if exists ledger_roots_read on public.ledger_roots;
create policy ledger_roots_read on public.ledger_roots for select to authenticated using ((select private.is_fm()));

-- `operator_id` and `reported_by` are withheld from every client, exactly as on `operators` (001c §5):
-- a trainer must not be able to join a near miss back to a name. B15's `near_miss_list` returns the
-- pseudonym, and the FM's incident list gets identities through its own security-definer RPC.
grant select (id, seq, idempotency_key, run_id, occurred_at, recorded_at, incident_type, severity, site_id,
  machine_id, lat, lon, description, context, reporter_kind, source_event_id, supersedes_seq, non_punitive,
  prev_hash, entry_hash, canon_version) on public.incidents to authenticated;
grant select on public.ledger_roots to authenticated;
grant all on public.incidents, public.ledger_roots to service_role;
revoke insert, update, delete on public.incidents from anon, authenticated;
revoke update, delete on public.incidents from service_role;   -- the drain runs as the function owner

-- the three client-callable RPCs; everything in `private` stays uncallable (tests/003_privileges.sql)
revoke execute on function public.ledger_export(bigint, bigint), public.ledger_verify(bigint, bigint),
  public.ledger_recompute(bigint, bigint) from public, anon;
grant execute on function public.ledger_export(bigint, bigint), public.ledger_verify(bigint, bigint),
  public.ledger_recompute(bigint, bigint) to authenticated, service_role;

comment on table public.incidents is
  'The incident ledger (data-model §4). Append-only: inserted only by private.ledger_write_one under advisory lock 4210001, never updated or deleted except by private.demo_tamper in demo mode. seq is gap-free and assigned in drain order, which is commit order, not occurred_at order.';
comment on column public.incidents.run_id is
  'Scenario run, with NO foreign key on purpose: purge_run deletes rehearsal runs and the ledger is never purged (data-model §4.7, re-check #15).';
comment on column public.incidents.source_event_id is
  'The event this entry was written from. No foreign key, for the same reason as run_id.';
comment on column public.incidents.entry_hash is
  'lower-hex sha256 of the canonical v1 UTF-8 bytes (data-model §4.3). Reproduced byte for byte by packages/shared/src/ledger/canonical.ts.';
comment on table public.ledger_roots is
  'Published Merkle checkpoints. Display and internal anchor only: the real witness is the message in the fleet manager''s own Telegram chat (N1). sent_text is what was sent and is never rewritten.';
comment on function public.ledger_verify(bigint, bigint) is
  'INTERNAL CONSISTENCY ONLY (data-model §4.4): chain continuity, links, recomputed hashes and agreement with the latest ledger_roots row. An owner who rewrites every later hash and the root row passes it. The external check is the human comparison in §4.5, recomputed in the browser from ledger_export. Waits up to 10 s for lock 4210001 and otherwise raises ledger_busy (R2-5).';
comment on function public.ledger_export(bigint, bigint) is
  'The rows the browser verifier hashes itself (R2-2). Takes no advisory lock: one SELECT is snapshot-consistent. Fleet manager, service role or owner only; max 5,000 rows.';
comment on function public.ledger_recompute(bigint, bigint) is
  'Convenience "server says …" line only (N1). Nothing in the witness comparison depends on it.';
comment on function private.ledger_canonical_text(jsonb) is
  'Canonical serialisation v1 (data-model §4.3), byte-identical to packages/shared/src/ledger/canonical.ts. Proved against golden vectors 1-3 in supabase/tests/005_ledger.sql and packages/shared/src/ledger/ledger.test.ts.';
comment on function private.ledger_merkle_of(text[]) is
  'Merkle root over RAW 32-byte hashes: leaf sha256(0x00||h), parent sha256(0x01||l||r), odd node carried up, empty tree sha256('''') (data-model §4.5, re-check (c)).';
comment on function private.ledger_drain(int) is
  'The worker job''s ledger step: ≤ 50 queue rows in id order under pg_advisory_xact_lock(4210001), each in its own subtransaction. A plain function so the SQL tests can run it inside begin … rollback (R2-1).';
comment on function private.demo_tamper(bigint, text) is
  'Demo only, demo_mode required. ''edit'' breaks a hash; ''rehash'' rewrites every later hash AND the latest checkpoint''s root_hex AND head_hash, so the internal Verify passes and only the Telegram line still disagrees (data-model §4.6).';
