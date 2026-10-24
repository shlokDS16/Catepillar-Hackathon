/**
 * B9 timeout probe (N4, data-model §6): "a step sleeping 10 s is cancelled by the role backstop, or the
 * gap is recorded in the track log".
 *
 * `set local statement_timeout` inside a function does not bound the statement already running, so the
 * design's backstop was a role-level `statement_timeout` applied through
 * `cron.schedule_in_database(name, schedule, command, database, username)`. B0 measured that this is
 * **unavailable on this project** (`postgres` is not superuser, decision D13). This probe shows exactly
 * what is and is not in place, on the real pg_cron path:
 *
 *   1. what statement_timeout the worker actually runs under (role setting, then database, then server);
 *   2. whether `postgres` can create the `spotter_worker` role and schedule as it;
 *   3. a one-off 1-second cron job calling a procedure whose SECOND step sleeps 10 s. If a backstop
 *      exists, the run ends `failed` with a cancel and the step-2 marker is missing. If it does not, the
 *      run ends `succeeded` after ~10 s and both markers are there — the gap, measured.
 *
 * It creates `private.b9_probe_*` objects and the job `b9-timeout-probe`, and removes all of them.
 *
 *   pnpm exec tsx scripts/b9/timeout-probe.ts
 */
import { connect } from "../lib/db.ts";

const sql = connect({ quiet: true, warnings: true });
const JOB = "b9-timeout-probe";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  // ── 1. the timeout the worker runs under ──
  const settings = await sql`
    select 'role' as scope, s.setconfig::text as config from pg_db_role_setting s
      join pg_roles r on r.oid = s.setrole where r.rolname = 'postgres'
    union all
    select 'database', s.setconfig::text from pg_db_role_setting s
      join pg_database d on d.oid = s.setdatabase where s.setrole = 0 and d.datname = current_database()`;
  const [server] = await sql`select setting, source from pg_settings where name = 'statement_timeout'`;
  console.log(`statement_timeout now: ${server.setting} ms (source ${server.source})`);
  for (const s of settings) console.log(`  ${s.scope} setconfig: ${s.config}`);
  const [su] = await sql`select rolsuper, rolcreaterole from pg_roles where rolname = current_user`;
  console.log(`current_user superuser=${su.rolsuper} createrole=${su.rolcreaterole}`);

  // ── 2. can we schedule the job as a dedicated, timeout-capped role at all? ──
  // Two separate questions, and only the second one is the blocker: creating `spotter_worker` and
  // capping it is allowed, but pg_cron will not let a non-superuser schedule a job FOR another role.
  try {
    await sql`create role spotter_worker nologin`;
    await sql`alter role spotter_worker set statement_timeout = '8s'`;
    console.log("role-level backstop, step 1: role spotter_worker created and capped at 8s — ALLOWED");
  } catch (err) {
    console.log(`role-level backstop, step 1 REFUSED: ${String(err).split("\n")[0].slice(0, 160)}`);
  }
  try {
    await sql`select cron.schedule_in_database('b9-su-probe', '1 seconds', 'select 1;', current_database(), 'spotter_worker')`;
    await sql`select cron.unschedule('b9-su-probe')`;
    console.log("role-level backstop, step 2: schedule_in_database(..., username) — ALLOWED (D13 can be revisited)");
  } catch (err) {
    console.log(`role-level backstop, step 2 REFUSED: ${String(err).split("\n")[0].slice(0, 200)}`);
    console.log("  → this is the N4 backstop, and it is unavailable (D13). Step 3 measures what that costs.");
  }

  // ── 3. the real thing: a 1-second cron job whose second step sleeps 10 s ──
  await sql`create table if not exists private.b9_probe_marks (step text primary key, at timestamptz not null default now())`;
  await sql`truncate private.b9_probe_marks`;
  await sql.unsafe(`
    create or replace procedure private.b9_probe_sleep()
    language plpgsql as $probe$
    begin
      insert into private.b9_probe_marks (step) values ('before') on conflict (step) do nothing;
      commit;
      perform pg_sleep(10);                 -- the step the backstop is supposed to cancel
      insert into private.b9_probe_marks (step) values ('after') on conflict (step) do nothing;
      commit;
    end $probe$;`);

  await sql`select cron.unschedule(${JOB}) where exists (select 1 from cron.job where jobname = ${JOB})`;
  const t0 = new Date();
  await sql`select cron.schedule(${JOB}, '1 seconds', 'call private.b9_probe_sleep();')`;
  console.log(`scheduled ${JOB}; waiting for one run …`);

  type RunDetail = { status: string; seconds: number; message: string | null };
  let detail: RunDetail | null = null;
  for (let i = 0; i < 20 && !detail; i++) {
    await sleep(2000);
    const [d] = await sql`
      select status, extract(epoch from (end_time - start_time))::numeric(6,2) as seconds, return_message as message
        from cron.job_run_details
       where jobid = (select jobid from cron.job where jobname = ${JOB})
         and start_time >= ${t0} and end_time is not null
       order by start_time limit 1`;
    if (d) detail = d as unknown as RunDetail;
  }
  await sql`select cron.unschedule(${JOB}) where exists (select 1 from cron.job where jobname = ${JOB})`;

  const marks = (await sql`select step from private.b9_probe_marks order by at`).map((r) => r.step);
  console.log(`\n── probe ──`);
  if (!detail) {
    console.log("  INCONCLUSIVE: no completed job run was recorded within 40 s");
  } else {
    console.log(`  job run: status=${detail.status} seconds=${detail.seconds} message=${detail.message ?? ""}`);
    console.log(`  markers: [${marks.join(", ")}]`);
    const cancelled = detail.status !== "succeeded" && !marks.includes("after");
    if (cancelled) {
      console.log(`  VERDICT: the 10 s step WAS cancelled — a backstop is in place.`);
    } else {
      console.log(`  VERDICT: the 10 s step ran to completion (${detail.seconds}s). The role-level backstop of`);
      console.log(`           data-model §6 is NOT in place on this project (B0/D13: postgres is not superuser,`);
      console.log(`           so cron.schedule_in_database(..., username) cannot be used). THE GAP IS LOGGED:`);
      console.log(`           the only backstop left is the postgres role's ${server.setting} ms statement cap,`);
      console.log(`           and the guarantee is bounded work per step (≤ 200 frames, ≤ 50 ledger rows,`);
      console.log(`           ≤ 20 Loop items, ≤ 50 requeues), measured by private.tick_log in B11.`);
      console.log(`           Note the committed steps survived: the 'before' marker is present, which is`);
      console.log(`           the COMMIT-per-step property the design relies on after a cancel.`);
    }
  }
} catch (err) {
  console.error(String(err));
  process.exitCode = 2;
} finally {
  try {
    await sql`select cron.unschedule(${JOB}) where exists (select 1 from cron.job where jobname = ${JOB})`;
    await sql`drop procedure if exists private.b9_probe_sleep()`;
    await sql`drop table if exists private.b9_probe_marks`;
    await sql`drop role if exists spotter_worker`;
    console.log("\nprobe objects removed");
  } catch (err) {
    console.error(`cleanup: ${String(err).split("\n")[0]}`);
  }
  await sql.end();
}
