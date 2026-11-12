-- 003e: finish the near-miss privacy work (data-model §2.10), after the 003d review.
--  1. ledger_export seals a non_punitive row down to the chain skeleton ONLY: {v, seq, prev_hash,
--     non_punitive, sealed}. 003d kept the other 18 fields and entry_hash, so the fleet manager could try
--     each operator id she can read and recover the reporter in a few hashes.
--  2. The same identity leaked through `events` (events_read RLS and the sup:/site: Realtime broadcast carry
--     operator_id for incident.reported and incident.logged). private.event_is_sealed() now hides sealed
--     events from the FM path on every route: RLS, broadcast. incident.logged gains `non_punitive`.
--  3. The witness line gains np=<sha256 of the ascending non_punitive seqs, comma separated> so the browser
--     can catch a hostile export that relabels an ordinary row as sealed.

-- ── 1. ledger_export: minimal sealed row ─────────────────────────────────────────────────────────
create or replace function public.ledger_export(p_first_seq bigint, p_last_seq bigint)
returns table (seq text, prev_hash text, entry_hash text, v text, canonical_fields jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_claims text := current_setting('request.jwt.claims', true); v_seal boolean;
begin
  if not private.ledger_reader_ok() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_first_seq is null or p_last_seq is null or p_first_seq < 1 or p_last_seq < p_first_seq
     or p_last_seq - p_first_seq + 1 > 5000 then raise exception 'validation' using errcode = 'P0001'; end if;
  -- fails closed: any request caller other than the service role is sealed
  v_seal := v_claims is not null and v_claims <> '' and (v_claims::jsonb ->> 'role') is distinct from 'service_role';
  return query
    select c.seq, c.prev_hash, c.entry_hash, c.v,
           case when v_seal and (c.canonical_fields ->> 'non_punitive')::boolean
                then jsonb_build_object('v', c.v, 'seq', c.seq, 'prev_hash', c.prev_hash,
                                        'non_punitive', true, 'sealed', true)
                else c.canonical_fields end
    from public.v_ledger_canonical_input c
    where c.seq::bigint between p_first_seq and p_last_seq
    order by c.seq::bigint;
end $$;
revoke execute on function public.ledger_export(bigint, bigint) from public, anon;
grant execute on function public.ledger_export(bigint, bigint) to authenticated, service_role;

-- ── 2. event_is_sealed and its three uses ────────────────────────────────────────────────────────
-- Mirrors private.ledger_fields_from_event: an event that becomes a non_punitive incident, and the
-- incident.logged row that announces such an incident (looked up inside the definer: the FM's RLS hides it).
create or replace function private.event_is_sealed(e public.events)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if e.type = 'incident.logged' then
    return coalesce((e.payload ->> 'non_punitive')::boolean, false)
        or exists (select 1 from public.incidents i
                   where i.id::text = e.payload ->> 'incident_id' and i.non_punitive);
  end if;
  if e.type in ('incident.reported', 'safety.seatbelt_breach', 'guardian.hazard_near_operator',
                'sos.raised', 'ppe.override_granted') then
    return coalesce((e.payload ->> 'non_punitive')::boolean,
                    e.type = 'incident.reported' and e.payload ->> 'incident_type' = 'near_miss');
  end if;
  return false;
end $$;
revoke execute on function private.event_is_sealed(public.events) from public, anon;
grant execute on function private.event_is_sealed(public.events) to authenticated, service_role;

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (
  ('site' = any (audiences) and site_id = (select private.my_site_id()) and not private.event_is_sealed(events))
  or ('operator' = any (audiences) and operator_id = (select private.my_operator_id()))
  or ((select private.is_fm()) and 'supervisor' = any (audiences) and site_id = (select private.my_site_id())
      and not private.event_is_sealed(events))
  or ((select private.app_role()) = 'trainer' and 'trainer' = any (audiences) and site_id = (select private.my_site_id()))
);
comment on policy events_read on public.events is
  'Mirror of the Realtime topics (api-contracts §7). A near-miss (sealed) event never reaches the site or supervisor routes: only the operator''s own op:{me} topic carries it (003e).';

create or replace function private.events_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare et public.event_types%rowtype; a public.audience; topic text; body jsonb; v_sealed boolean;
begin
  body := to_jsonb(new);
  v_sealed := private.event_is_sealed(new);
  foreach a in array new.audiences loop
    topic := case a
      when 'operator' then 'op:' || new.operator_id::text     -- null when the event has no operator: no topic
      when 'site' then case when v_sealed then null else 'site:' || new.site_id::text end
      when 'supervisor' then case when v_sealed then null else 'sup:' || new.site_id::text end
      when 'trainer' then 'train:' || new.site_id::text end;
    if topic is not null then
      perform realtime.send(body, 'event', topic, true);
    end if;
  end loop;
  select * into et from public.event_types where type = new.type;
  if et.ledger then
    insert into private.ledger_queue (idempotency_key, event_id, entry)
    values ('ledger:' || new.idempotency_key, new.id, jsonb_build_object('event_id', new.id, 'type', new.type))
    on conflict (idempotency_key) do nothing;
  end if;
  if et.lesson_code is not null or et.replay then
    insert into private.loop_queue (event_id) values (new.id) on conflict (event_id) do nothing;
  end if;
  return null;
end $$;

-- incident.logged now says whether the incident is non-punitive (event_is_sealed reads it).
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
                       'entry_hash', inc.entry_hash, 'ledger_queue_id', q.id, 'non_punitive', inc.non_punitive),
    'ledgerlog:' || q.idempotency_key, 'system', inc.site_id, inc.run_id, inc.machine_id, inc.operator_id,
    ev.task_id, null::uuid, ev.sim_ts, null::public.alert_tier, ev.correlation_id, ev.id);

  return inc;
end $$;

-- ── 3. witness line: np= ─────────────────────────────────────────────────────────────────────────
create or replace function private.ledger_np_hash(p_first bigint, p_last bigint)
returns text language sql stable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(string_agg(i.seq::text, ',' order by i.seq), ''), 'UTF8')), 'hex')
  from public.incidents i where i.seq between p_first and p_last and i.non_punitive
$$;

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
            || ' at=' || to_char(now() at time zone 'Asia/Kolkata', 'HH24:MI') || ' IST'
            || ' np=' || private.ledger_np_hash(v_first, v_last);

  insert into public.ledger_roots (first_seq, last_seq, leaf_count, root_hex, head_hash, sent_text, telegram_chat_ref)
  values (v_first, v_last, v_n, v_root, v_head, v_line, 'TELEGRAM_SUPERVISOR_CHAT_ID')
  returning id into v_root_id;

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
