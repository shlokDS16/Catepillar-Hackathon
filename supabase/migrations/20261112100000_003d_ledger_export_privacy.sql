-- 003d: ledger_export privacy (data-model §2.10). The fleet manager must not be able to attribute a
-- near-miss (non_punitive) row, but `ledger_export` returned operator_id / reported_by in clear for every
-- row. The canonical v1 hash covers both ids and applied rows cannot be re-hashed, so the ids cannot be
-- swapped for a salted ref (that would change every stored entry_hash). Instead, for a request caller that
-- is not the service role (only the fleet manager passes the reader gate), a non_punitive row is exported
-- SEALED: operator_id and reported_by are null and the extra field `sealed: true` is added. The browser
-- verifier cannot recompute a sealed row's own hash (it lacks the ids), so it takes that row's entry_hash
-- as given, still checks seq, the prev_hash link and the Merkle root (built from entry_hash values and
-- compared with the Telegram witness), and reports how many rows were sealed. The service role and a direct
-- owner connection (scripts/verify-ledger.ts, SQL tests) still receive every byte and verify every row in
-- full. ledger_verify (server side) is unchanged.
create or replace function public.ledger_export(p_first_seq bigint, p_last_seq bigint)
returns table (seq text, prev_hash text, entry_hash text, v text, canonical_fields jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_claims text := current_setting('request.jwt.claims', true); v_seal boolean := false;
begin
  if not private.ledger_reader_ok() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_first_seq is null or p_last_seq is null or p_first_seq < 1 or p_last_seq < p_first_seq then
    raise exception 'validation' using errcode = 'P0001';
  end if;
  if p_last_seq - p_first_seq + 1 > 5000 then raise exception 'validation' using errcode = 'P0001'; end if;
  if v_claims is not null and v_claims <> '' and v_claims::jsonb ->> 'role' is distinct from 'service_role' then
    v_seal := true;
  end if;
  return query
    select c.seq, c.prev_hash, c.entry_hash, c.v,
           case when v_seal and (c.canonical_fields ->> 'non_punitive')::boolean
                then c.canonical_fields || jsonb_build_object('operator_id', null, 'reported_by', null, 'sealed', true)
                else c.canonical_fields end
    from public.v_ledger_canonical_input c
    where c.seq::bigint between p_first_seq and p_last_seq
    order by c.seq::bigint;
end $$;
