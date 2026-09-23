/**
 * B0 database probes (data-model §6, backend-tasks B0):
 *  1. pg_cron / pg_net / vault extensions present (enables them if missing; PostGIS is B2's migration)
 *  2. cron.use_background_workers (N5), cron.log_statement (G2-21), superuser
 *  3. role-level statement_timeout + cron.schedule_in_database(…, username) allowed? (N4)
 *  4. COMMIT probe (R2-1): procedure inserts A, COMMITs, inserts B, raises → A kept, B absent, run failed
 * Cleanup runs in `finally`, so a failing step never leaves a 1-second job behind. The probe's
 * `cron.job_run_details` rows are kept as evidence (housekeeping deletes rows older than 1 h). Prints facts only.
 */
import { connect } from "../lib/db.ts";

const sql = connect();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out: Record<string, unknown> = {};

async function cleanup() {
  await sql`select cron.unschedule(jobid) from cron.job where jobname in ('b0-role-probe', 'b0-commit-probe')`;
  await sql`drop procedure if exists private.probe()`;
  await sql`drop table if exists private.probe_log`;
  await sql`drop role if exists spotter_probe_role`;
}

try {
  const ext = await sql`select name, installed_version, default_version from pg_available_extensions
    where name in ('pg_cron', 'pg_net', 'supabase_vault', 'postgis', 'pgtap') order by 1`;
  out.extensions_before = ext.map((e) => `${e.name}:${e.installed_version ?? "-"}/${e.default_version}`);
  await sql`create extension if not exists pg_cron with schema pg_catalog`;
  await sql`grant usage on schema cron to postgres`;
  await sql`create extension if not exists pg_net with schema extensions`;
  await sql`create extension if not exists supabase_vault`;

  const settings = await sql`select name, setting, context from pg_settings where name like 'cron.%' or name = 'statement_timeout' order by 1`;
  out.settings = Object.fromEntries(settings.map((r) => [r.name, `${r.setting} (${r.context})`]));
  const who = await sql`select current_user, current_setting('is_superuser') su,
    (select rolcreaterole from pg_roles where rolname = current_user) createrole`;
  out.who = who[0];

  // 3. role-level timeout + schedule_in_database as that role
  await sql`create schema if not exists private`;
  await sql`revoke all on schema private from public, anon, authenticated`;
  try {
    await sql`do $$ begin if not exists (select 1 from pg_roles where rolname = 'spotter_probe_role')
      then create role spotter_probe_role nologin; end if; end $$`;
    await sql`alter role spotter_probe_role set statement_timeout = '3s'`;
    out.role_timeout = "alter role … set statement_timeout: OK";
  } catch (e) { out.role_timeout = `FAILED: ${(e as Error).message}`; }
  try {
    await sql`select cron.schedule_in_database('b0-role-probe', '1 seconds', 'select pg_sleep(10)', 'postgres', 'spotter_probe_role')`;
    out.schedule_in_database = "OK";
    await sleep(6000);
    out.role_probe_runs = await sql`select status, left(coalesce(return_message, ''), 120) msg,
      extract(epoch from (coalesce(end_time, now()) - start_time))::int secs
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'b0-role-probe'
      order by start_time desc limit 3`;
  } catch (e) { out.schedule_in_database = `FAILED: ${(e as Error).message}`; }
  await sql`select cron.unschedule(jobid) from cron.job where jobname = 'b0-role-probe'`;

  // 4. COMMIT probe
  await sql`create table if not exists private.probe_log (id serial primary key, label text not null, at timestamptz not null default now())`;
  await sql`delete from private.probe_log`;
  await sql.unsafe(`create or replace procedure private.probe() language plpgsql security invoker as $$
    begin
      insert into private.probe_log(label) values ('A');
      commit;
      insert into private.probe_log(label) values ('B');
      raise exception 'b0 probe: intentional failure after commit';
    end $$`);
  await sql`select cron.schedule('b0-commit-probe', '1 seconds', 'call private.probe();')`;
  await sleep(4000);
  await sql`select cron.unschedule('b0-commit-probe')`;
  await sleep(1500);
  const rows = await sql`select label, count(*)::int n from private.probe_log group by 1 order by 1`;
  const runs = await sql`select status, left(coalesce(return_message, ''), 100) msg from cron.job_run_details
    where command = 'call private.probe();' order by start_time desc limit 5`;
  const pass = rows.some((r) => r.label === "A") && !rows.some((r) => r.label === "B") && runs.some((r) => r.status === "failed");
  out.commit_probe = { rows, runs, verdict: pass ? "PASS" : "FAIL" };

  const size = await sql`select pg_size_pretty(pg_database_size(current_database())) db_size`;
  out.db_size = size[0].db_size;
  const ext2 = await sql`select extname, extversion from pg_extension where extname in ('pg_cron', 'pg_net', 'supabase_vault', 'postgis') order by 1`;
  out.extensions_after = ext2.map((e) => `${e.extname}:${e.extversion}`);
} finally {
  await cleanup();
  await sql.end();
}
console.log(JSON.stringify(out, null, 2));
