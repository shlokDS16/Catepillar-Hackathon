-- Migration 003b — findings from the backend review of B5. 003 is applied, so this is additive.
--
--  1. MAJOR: `service_role` kept INSERT on `public.incidents`, and the append-only trigger trusts
--     the custom GUC `spotter.ledger_write`, which ANY role may set (measured: `set_config` returns
--     'on' as `anon` and as `authenticated`). The service key alone could therefore forge a chain
--     entry — exactly what the ledger exists to make impossible. data-model §4.1 requires revokes
--     AND triggers; the revoke was missing. The GUC stays as the in-function handshake, but it is
--     no longer the only thing standing between a client role and the chain.
--  2. MINOR: `set local lock_timeout` inside `ledger_verify` leaked into the caller's transaction
--     (measured before=0, after=10s), so B9's worker would inherit it. Pinned to the function.
--  3. MINOR: `ledger_recompute` had no row cap while `ledger_export` caps at 5 000; a caller could
--     ask for (1, 10000000) and hold a core for minutes.

-- ── 1. no client role may insert into the chain, service_role included ─────────────────────────
revoke insert on public.incidents from service_role;
comment on table public.incidents is
  'The canonical ledger chain. Written only by private.ledger_write_one (owner), which the drain
   calls; every other role — anon, authenticated and service_role — is revoked from insert, update
   and delete. The append-only trigger is the second lock, not the only one: its GUC handshake is
   settable by any role, so the privilege revoke is what actually holds.';

-- ── 2. lock_timeout stays inside ledger_verify ────────────────────────────────────────────────
alter function public.ledger_verify(bigint, bigint) set lock_timeout = '10s';

-- ── 3. ledger_recompute gets ledger_export's bound ────────────────────────────────────────────
-- Body reproduced from 003 unchanged except the range cap; same signature, same return shape, same
-- `validation` errcode, so nothing that calls it has to learn a new contract.
create or replace function public.ledger_recompute(p_first_seq bigint, p_last_seq bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_root text; v_head text;
begin
  if not private.ledger_reader_ok() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_first_seq is null or p_last_seq is null or p_first_seq < 1 or p_last_seq < p_first_seq then
    raise exception 'validation' using errcode = 'P0001';
  end if;
  -- Same 5 000-leaf ceiling as ledger_export: this is a read the caller waits on, and an unbounded
  -- range (1, 10000000) was accepted, which lets one request hold a core for minutes.
  if p_last_seq - p_first_seq + 1 > 5000 then
    raise exception 'validation' using errcode = 'P0001';
  end if;
  select count(*) into v_n from public.incidents i where i.seq between p_first_seq and p_last_seq;
  v_root := encode(private.ledger_merkle_root(p_first_seq, p_last_seq), 'hex');
  select i.entry_hash::text into v_head from public.incidents i where i.seq = p_last_seq;
  return jsonb_build_object('first_seq', p_first_seq, 'last_seq', p_last_seq, 'leaf_count', v_n,
    'root_hex', v_root, 'head_hash', coalesce(v_head, repeat('0', 64)));
end $$;
