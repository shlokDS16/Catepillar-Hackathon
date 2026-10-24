-- Migration 003c — B5 review follow-up: a dropped ledger write must stop being invisible.
--
-- The finding. `private.ledger_drain` writes each queue row in its own subtransaction and, when that
-- subtransaction raises, marks the row `error = <sqlerrm>` and moves on. `ledger_queue_pending_idx` is
-- `where written_incident_id is null and error is null`, and the drain's own predicate matches it, so
-- that row is never looked at again: nothing retries it and nothing says a word. Meanwhile
-- `public.ledger_verify` keeps answering `ok`, because the rows that *were* written still link
-- perfectly. An incident can therefore disappear from the ledger while the console shows a green tick —
-- the one failure mode the ledger exists to make impossible to hide.
--
-- The fix, in three parts:
--   1. `private.ledger_queue_health()` — how many queue rows are errored, how many are still pending and
--      how old the oldest of each is. The staleness bound is data-model §4.2's lag bound (an entry
--      normally exists 1-3 s after its event commits; `demo-check` fails above 5 s).
--   2. `public.ledger_verify` reports that under a new `queue` key and refuses to answer `ok` while the
--      queue is unhealthy. A queue failure is deliberately NOT one of the four chain verdicts
--      (`seq_gap`, `link_broken`, `hash_mismatch`, `anchor_mismatch`): those mean "the rows that exist
--      disagree with each other", which is what tampering looks like. A dropped write means "a row that
--      should exist is missing", which is a pipeline fault with a different cause and a different fix.
--      It gets its own name, `queue_incomplete`, and its own `first_bad_seq is null` (there is no bad
--      seq: the missing entry never got one).
--   3. The event the check emits follows the same split. A chain verdict still emits
--      `ledger.tamper_detected` (critical, raises the `ledger_tamper` alert). A queue-only failure emits
--      `ledger.verified` with `ok = false, reason = 'queue_incomplete'` **plus** one `system.warning`
--      (`code = 'ledger_queue_stalled'`, `value` = the errored count) to the supervisor, so the fleet
--      manager is told without the tamper alarm crying wolf.
--
-- 003 and 003b are applied, so nothing above is edited. `ledger_verify` is replaced with
-- `create or replace` keeping its signature, return type, `forbidden` and `ledger_busy` behaviour and
-- every result key it already had; `queue` is added. 003b's `lock_timeout` is re-stated as a function
-- SET clause here, because `create or replace function` rewrites the whole proconfig (an `alter function
-- … set` made earlier would otherwise be dropped).

-- ════ 1. Queue health ═════════════════════════════════════════════════════════════════════════════

-- Unwritten queue rows, split by whether the drain gave up on them. `stuck` is the single boolean the
-- verify verdict hangs on: an errored row is stuck by definition (nothing will retry it), and a pending
-- row older than the lag bound means the drain is not keeping up or is not running at all.
create or replace function private.ledger_queue_health(p_stale_after_s int default 5)
returns jsonb language sql stable security definer set search_path = '' as $$
  with unwritten as (
    select l.error, l.enqueued_at
    from private.ledger_queue l
    where l.written_incident_id is null
  ), agg as (
    select
      count(*) filter (where u.error is not null)::int as errored,
      count(*) filter (where u.error is null)::int     as pending,
      max(extract(epoch from (now() - u.enqueued_at))) filter (where u.error is null)     as oldest_pending_age_s,
      max(extract(epoch from (now() - u.enqueued_at))) filter (where u.error is not null) as oldest_errored_age_s
    from unwritten u
  )
  select jsonb_build_object(
    'errored',              a.errored,
    'pending',              a.pending,
    'oldest_pending_age_s', round(a.oldest_pending_age_s::numeric, 3),
    'oldest_errored_age_s', round(a.oldest_errored_age_s::numeric, 3),
    'stale_after_s',        p_stale_after_s,
    'stuck',                a.errored > 0 or coalesce(a.oldest_pending_age_s, 0) > p_stale_after_s)
  from agg a
$$;

comment on function private.ledger_queue_health(int) is
  'Health of private.ledger_queue: errored rows (the drain gave up and nothing retries them), still-pending rows and the age of the oldest of each. `stuck` = any errored row, or a pending row older than the data-model §4.2 lag bound. Read by ledger_verify and by demo-check (B21).';

-- ════ 2. `ledger_verify` with the queue in its verdict ════════════════════════════════════════════

-- Body as in 003, with four changes, each marked `-- 003c` below:
--   the queue is measured, the verdict combines chain and queue, the reason vocabulary gains
--   `queue_incomplete` for the queue-only case, and the emitted event splits tamper from pipeline fault.
create or replace function public.ledger_verify(p_from bigint default 1, p_to bigint default null)
returns jsonb language plpgsql security definer
set search_path = '' set lock_timeout = '10s' as $$
declare r public.incidents%rowtype; v_from bigint; v_to bigint; v_head_seq bigint; v_head_hash text;
        v_prev text; v_expect_seq bigint; v_checked int := 0; v_hash text;
        v_ok boolean := true; v_bad bigint; v_reason text; v_expected text; v_stored text;
        v_root public.ledger_roots%rowtype; v_recomputed text; v_site uuid;
        v_queue jsonb; v_queue_stuck boolean; v_chain_ok boolean;        -- 003c
begin
  if not private.ledger_reader_ok() then raise exception 'forbidden' using errcode = 'P0001'; end if;

  -- R2-5: wait at most 10 s for the drain (which writes ≤ 50 rows), then answer `ledger_busy`.
  -- The 10 s comes from this function's own SET clause (003b), so it cannot leak into the caller.
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

  -- 003c: the chain verdict is now only half the answer. We hold lock 4210001, so no drain can be
  -- running: an unwritten row counted here is genuinely not being written, not merely in flight.
  -- The queue is global, not range-scoped — a dropped entry never received a seq, so there is no range
  -- it could be excluded from, and it would have landed after `head_seq` in any case.
  v_chain_ok := v_ok;
  v_queue := private.ledger_queue_health();
  v_queue_stuck := (v_queue ->> 'stuck')::boolean;
  if v_chain_ok and v_queue_stuck then
    v_ok := false; v_reason := 'queue_incomplete'; v_bad := null; v_expected := null; v_stored := null;
  end if;

  -- event-pipeline §5 step 4: a failed check is itself an incident the supervisor must see.
  -- 003c: only a CHAIN verdict is a tamper. A queue fault is a pipeline fault, reported as a plain
  -- `ledger.verified` (ok = false) plus one supervisor `system.warning`, bucketed by the minute so a
  -- console that re-verifies does not flood the inbox.
  v_site := coalesce(private.my_site_id(), (select i.site_id from public.incidents i order by i.seq desc limit 1));
  if v_site is not null then
    perform private.emit_event(
      case when v_chain_ok then 'ledger.verified' else 'ledger.tamper_detected' end,
      jsonb_build_object('ok', v_ok, 'checked', v_checked, 'first_bad_seq', v_bad, 'reason', v_reason,
                         'queue', v_queue),
      'ledgerverify:' || v_from || ':' || v_to || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
      'system', v_site);
    if v_chain_ok and v_queue_stuck then
      perform private.emit_event('system.warning',
        jsonb_build_object('code', 'ledger_queue_stalled', 'value', (v_queue ->> 'errored')::int,
                           'queue', v_queue),
        'sys:ledgerqueue:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'),
        'system', v_site);
    end if;
  end if;

  return jsonb_build_object('ok', v_ok, 'checked', v_checked, 'first_bad_seq', v_bad,
    'reason', v_reason, 'expected', v_expected, 'stored', v_stored,
    'head_seq', v_head_seq, 'head_hash', v_head_hash,
    'chain_ok', v_chain_ok, 'queue', v_queue);                            -- 003c
end $$;

comment on function public.ledger_verify(bigint, bigint) is
  'INTERNAL CONSISTENCY ONLY (data-model §4.4): chain continuity, links, recomputed hashes, agreement with the latest ledger_roots row, and (003c) the health of private.ledger_queue. An owner who rewrites every later hash and the root row passes the chain half; the external check is the human comparison in §4.5, recomputed in the browser from ledger_export. `chain_ok` is the chain verdict alone; `ok` is false as soon as the queue holds an errored or stale row, with reason `queue_incomplete`, because an entry that was never written is an incomplete chain even though the written rows agree. Waits up to 10 s for lock 4210001 and otherwise raises ledger_busy (R2-5).';
