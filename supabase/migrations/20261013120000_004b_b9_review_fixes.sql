-- Migration 004b — findings from the backend review of B9 + 003c. Everything before this is
-- applied, so this is additive: no applied migration is edited.
--
--  1. BLOCKER: `purge_run` deleted a rehearsal run's events but left its un-drained
--     `private.ledger_queue` rows behind (there is no FK — the ledger deliberately depends on
--     nothing purgeable). The drain then errors them ("event has disappeared"), the pending index
--     excludes errored rows so nothing retries, and 003c — correctly — turns that into
--     `ok = false` forever plus a `system.warning` every minute. Two features that are each right
--     on their own combined into a permanently red ledger. Reproduced by the reviewer.
--  2. MAJOR: `can_call_operator` aged out `operator_state` but read `machine_state` at any age, so
--     a machine that went offline an hour ago while parked still authorised a voice call and
--     unlocked the cockpit. Default-deny has to mean default-deny on BOTH rows.
--  3. MAJOR: `ledger_drain` takes a blocking `pg_advisory_xact_lock(4210001)` and is step 1 of a
--     job that runs every second, so anything holding that lock stalls the scenario tick behind
--     it — measured at 9.2-9.4 s per worker run during a concurrency test.
--  NOTE: section 2 below shipped with a wrong cooldown block (it referenced columns that do not
--  exist, so every frame that refreshed a cab lock raised). It is left exactly as applied, because
--  an applied migration is immutable; 004c replaces the function.
--  4. MINOR: the stuck-queue warning was suppressed whenever the chain verdict was also bad —
--     exactly the case where you want both signals.

-- ── 1. a purged run takes its un-drained queue rows with it ───────────────────────────────────
-- Body as applied in 004, with one delete added at the top. Everything else is unchanged.
create or replace function private.purge_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run public.scenario_runs%rowtype; v jsonb := '{}'::jsonb; n int;
        v_ledger_before int; v_ledger_after int;
begin
  select * into v_run from public.scenario_runs r where r.id = p_run_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not v_run.rehearsal then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select count(*) into v_ledger_before from public.incidents i where i.run_id = p_run_id;

  -- BEFORE the events go. A queue row is a promise that an incident will be written; if its event
  -- is about to vanish, the promise must be withdrawn rather than left to fail forever. Only rows
  -- still unwritten are touched — anything already in the chain is immutable and stays, which is
  -- what the ledger check at the end of this function proves.
  delete from private.ledger_queue lq
    where lq.written_incident_id is null
      and lq.event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('ledger_queue', n);

  delete from public.replay_attempts ra
    where ra.replay_id in (select rs.id from public.replay_scenarios rs
                           where rs.source_event_id in (select e.id from public.events e where e.run_id = p_run_id));
  get diagnostics n = row_count; v := v || jsonb_build_object('replay_attempts', n);

  delete from public.replay_scenarios rs
    where rs.source_event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('replay_scenarios', n);

  delete from public.lesson_assignments la
    where la.because_event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('lesson_assignments', n);

  delete from private.loop_queue lq
    where lq.event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('loop_queue', n);

  delete from public.dispatches d
    where d.alert_id in (select a.id from public.alerts a where a.run_id = p_run_id)
       or d.subject_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('dispatches', n);

  -- `alerts.origin_event_id → events` and `events.alert_id → alerts` point at each other, so neither
  -- table can go first. Both deletes therefore live in ONE statement: a non-deferrable foreign key is
  -- checked when the whole statement (data-modifying CTEs included) has finished, by which time both
  -- sides are gone. Splitting this in two would fail on whichever half ran first.
  with d_alerts as (delete from public.alerts a where a.run_id = p_run_id returning a.id)
  delete from public.events e where e.run_id = p_run_id;
  get diagnostics n = row_count; v := v || jsonb_build_object('events', n);

  -- B10/B11 tables: they do not exist yet, and purge_run must not wait for them to be written.
  if to_regclass('public.anomalies') is not null then
    execute 'delete from public.anomalies where run_id = $1' using p_run_id;
  end if;
  if to_regclass('private.detector_state') is not null then
    execute 'delete from private.detector_state where run_id = $1' using p_run_id;
  end if;

  delete from public.machine_state where run_id = p_run_id;
  delete from public.operator_state where run_id = p_run_id;
  delete from private.machine_broadcast where run_id = p_run_id;
  delete from public.operator_gps_trail where run_id = p_run_id;
  delete from public.telemetry_readings where run_id = p_run_id;
  get diagnostics n = row_count; v := v || jsonb_build_object('telemetry_readings', n);
  delete from public.weather_snapshots where run_id = p_run_id;
  delete from public.fault_codes where run_id = p_run_id;
  delete from private.tick_errors where run_id = p_run_id;
  delete from private.tick_log where run_id = p_run_id;

  select count(*) into v_ledger_after from public.incidents i where i.run_id = p_run_id;
  if v_ledger_after <> v_ledger_before then
    raise exception 'purge_run touched the ledger (% → %)', v_ledger_before, v_ledger_after using errcode = 'P0001';
  end if;

  return v || jsonb_build_object('run_id', p_run_id, 'incidents_kept', v_ledger_after);
end $$;

-- ── 2. the cab's state ages out exactly like the operator's ───────────────────────────────────
create or replace function private.can_call_operator(p_run_id uuid, p_operator_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare os public.operator_state%rowtype; ms public.machine_state%rowtype; cfg public.app_config%rowtype;
        v_state text; v_locked boolean; v_allowed boolean; v_reason text; v_stale interval;
begin
  select * into cfg from public.app_config where id;
  v_stale := make_interval(secs => coalesce(cfg.state_stale_s, 10));
  select * into os from public.operator_state o
    where o.run_id is not distinct from p_run_id and o.operator_id = p_operator_id;

  if not found or os.updated_at < now() - v_stale then
    return jsonb_build_object('allowed', false, 'reason', 'state_unknown',
                              'motion_locked', true, 'state', 'state_unknown');
  end if;

  if coalesce(os.on_foot, false) then
    v_state := 'on_foot';
  elsif os.in_cab_machine_id is not null then
    select * into ms from public.machine_state m
      where m.run_id is not distinct from p_run_id and m.machine_id = os.in_cab_machine_id;
    -- Staleness on updated_at (wall clock), never ts (simulated): at 60× a sim timestamp runs an
    -- hour ahead of the wall and would call a dead feed fresh. A cab we stopped hearing from is
    -- a cab we know nothing about, so it denies like any other unknown state.
    if not found or ms.updated_at < now() - v_stale then
      v_state := 'state_unknown';
    elsif coalesce(ms.speed_kmh, 999) <= coalesce(cfg.motion_speed_kmh, 0.5) and coalesce(ms.parking_brake, false) then
      v_state := 'parked';
    else
      v_state := 'moving';
    end if;
  else
    v_state := 'state_unknown';
  end if;

  v_locked := v_state not in ('on_foot', 'parked');
  v_allowed := not v_locked;
  v_reason := case v_state when 'moving' then 'motion_lock' when 'state_unknown' then 'state_unknown' end;

  if v_allowed and os.last_call_at is not null
     and os.last_call_at > now() - make_interval(secs => coalesce(cfg.call_cooldown_s, 60)) then
    v_allowed := false;
    v_reason := 'cooldown';                       -- denies the call; never blanks the cockpit
  end if;

  return jsonb_build_object('allowed', v_allowed, 'reason', v_reason,
                            'motion_locked', v_locked, 'state', v_state);
end $$;

-- ── 3. the one-second worker never waits on the ledger lock ───────────────────────────────────
create or replace function private.ledger_drain(p_limit int default 50)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_written int := 0;
begin
  -- try-lock, not a blocking wait: this is step 1 of a job that runs every second, so a UI Verify
  -- or a checkpoint holding 4210001 stalls the scenario tick behind it. Skipping costs one second;
  -- waiting cost 9.2-9.4 s per run when the reviewer measured it.
  if not pg_try_advisory_xact_lock(4210001) then
    return 0;
  end if;
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

comment on function private.ledger_drain(int) is
  'Writes up to p_limit queued incidents. Takes advisory lock 4210001 with pg_try_advisory_xact_lock and returns 0 rather than waiting: it is step 1 of the one-second worker, so blocking here stalls the scenario tick behind whatever holds the lock. The next tick retries a second later.';

-- ── 4. a stuck queue is reported even when the chain verdict is also bad ──────────────────────
-- Body as applied in 003c, with the warning's `v_chain_ok and` guard removed. A tamper and a
-- dropped write are independent failures; the case where both are true is the one where a
-- supervisor most needs to hear about both, not whichever the code checked first.
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
    if v_queue_stuck then
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
