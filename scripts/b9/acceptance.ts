/**
 * B9 acceptance (backend-tasks B9): "60× plays 8 h in 8 min with zero `catch_up` suppressions; a poison
 * frame is logged and skipped".
 *
 * It builds a throw-away scenario of its own (B8's `review1` seed does not exist yet), starts a
 * **rehearsal** run on it and then lets the real `worker` pg_cron job drive it — nothing here ticks the
 * engine by hand, so what is measured is the shipped spine, not a test harness.
 *
 * Everything it creates is removed afterwards: `private.purge_run` for the run's data (which keeps the
 * ledger, by design), then the scenario, frames and fixtures. Nothing outside its own `B9ACC-` rows is
 * touched, and it refuses to start if somebody else's run is the current one.
 *
 *   pnpm exec tsx scripts/b9/acceptance.ts                 # 8 simulated hours at 60× ≈ 8 min
 *   pnpm exec tsx scripts/b9/acceptance.ts --sim-min 10    # a 10-simulated-minute smoke run (≈ 10 s)
 *   pnpm exec tsx scripts/b9/acceptance.ts --keep          # leave the data behind for inspection
 */
import { connect } from "../lib/db.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const SIM_MIN = flag("sim-min", 8 * 60);          // simulated minutes to play
const SPEED = flag("speed", 60);                  // 1 | 10 | 60
const TELEMETRY_EVERY_S = flag("telemetry-every", 3);
const KEEP = args.includes("--keep");

const SIM_MS = SIM_MIN * 60_000;
const sql = connect({ quiet: true, warnings: true });
const tag = `B9ACC`;
let runId: string | null = null;
let scenarioId: string | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) =>
  xs.length === 0 ? 0 : xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * p) - 1)];

try {
  // ── 0. the worker must be the thing driving this, and nobody else's run may be current ──
  const [job] = await sql`select jobname, schedule, command, active from cron.job where jobname = 'worker'`;
  if (!job?.active) throw new Error("the `worker` pg_cron job is not active: migration 004 schedules it");
  console.log(`worker job: ${job.schedule} → ${job.command}`);
  const [current] = await sql`
    select r.id, s.code from public.scenario_runs r join public.scenarios s on s.id = r.scenario_id
     where r.is_current`;
  if (current && !String(current.code).startsWith(tag)) {
    throw new Error(`another run is current (scenario ${current.code}); refusing to take over`);
  }

  // ── 1. fixtures and a scenario of SIM_MS simulated milliseconds ──
  console.log(`building a ${SIM_MIN}-simulated-minute scenario …`);
  const [site] = await sql`
    insert into public.sites (code, name, site_type, location)
    values (${tag + "-S"}, 'B9 acceptance quarry', 'quarry',
            extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography)
    on conflict (code) do update set name = excluded.name returning id`;
  const machines: string[] = [];
  for (const code of [`${tag}-M1`, `${tag}-M2`, `${tag}-M3`]) {
    const [m] = await sql`
      insert into public.machines (code, home_site_id) values (${code}, ${site.id})
      on conflict (code) do update set home_site_id = excluded.home_site_id returning id`;
    machines.push(m.id);
  }
  const [op] = await sql`
    insert into public.operators (employee_code, display_name, skill_level, site_id, pseudonym)
    values (${tag + "-OP1"}, 'B9 acceptance operator', 'intermediate', ${site.id}, ${tag + "-P1"})
    on conflict (employee_code) do update set site_id = excluded.site_id returning id`;

  const [scn] = await sql`
    insert into public.scenarios (code, seed, site_id, shift_start_sim, duration, generator_version)
    values (${tag + "-" + Date.now()}, 9, ${site.id}, date_trunc('second', now()),
            make_interval(secs => ${SIM_MS / 1000}), 'b9-acceptance')
    returning id, shift_start_sim`;
  scenarioId = scn.id;

  // Frames: three machines every TELEMETRY_EVERY_S simulated seconds, one gps every 30 s, weather every
  // 30 min, and ONE poison frame (a telemetry frame with no machine) a quarter of the way in. Generated
  // in the database so 30,000 rows cost one statement.
  const poisonAt = Math.floor(SIM_MS / 4);
  await sql`
    insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, operator_id, payload)
    select ${scenarioId}::uuid, row_number() over (order by f.off, f.ord), f.off, f.kind::public.frame_kind,
           f.machine_id, f.operator_id, f.payload
    from (
      select g.off, m.ord, 'telemetry' as kind, m.id as machine_id, null::uuid as operator_id,
             jsonb_build_object(
               'speed_kmh', round((2 + 4 * sin(g.off / 600000.0 + m.ord))::numeric, 1),
               'seatbelt_fastened', true,
               'pitch_deg', round((3 + 2 * cos(g.off / 900000.0))::numeric, 1),
               'roll_deg', 1.0,
               'parking_brake', false,
               'load_cycles', (g.off / 120000)::int + m.ord,
               'engine_hours', round((4000 + g.off / 3600000.0)::numeric, 2),
               'fuel_used_l', round((g.off / 400000.0)::numeric, 2),
               'idle_hours', round((g.off / 14400000.0)::numeric, 2),
               'hydraulic_temp_c', round((68 + 4 * sin(g.off / 1200000.0))::numeric, 1),
               'coolant_temp_c', round((86 + 2 * cos(g.off / 1200000.0))::numeric, 1),
               'lat', round((21.1463 + 0.0004 * sin(g.off / 300000.0 + m.ord))::numeric, 6),
               'lon', round((79.0882 + 0.0004 * cos(g.off / 300000.0 + m.ord))::numeric, 6)) as payload
        from generate_series(0, ${SIM_MS}, ${TELEMETRY_EVERY_S * 1000}) as g(off)
        cross join (select unnest(${machines}::uuid[]) as id, generate_series(1, 3) as ord) m
       where m.ord = (array_position(${machines}::uuid[], m.id))
      union all
      select g.off, 4, 'gps', null::uuid, ${op.id}::uuid,
             jsonb_build_object('lat', round((21.1463 + 0.0002 * sin(g.off / 300000.0))::numeric, 6),
                                'lon', round((79.0882 + 0.0002 * cos(g.off / 300000.0))::numeric, 6),
                                'speed_kmh', 0.0, 'accuracy_m', 4.0)
        from generate_series(0, ${SIM_MS}, 30000) as g(off)
      union all
      select g.off, 5, 'weather', null::uuid, null::uuid,
             jsonb_build_object('temperature_c', round((34 + 8 * sin(g.off / 28800000.0))::numeric, 1),
                                'wind_kmh', 11.0, 'humidity_pct', 44.0, 'wbgt_c', 30.5)
        from generate_series(0, ${SIM_MS}, 1800000) as g(off)
      union all
      select ${poisonAt}::bigint, 0, 'telemetry', null::uuid, null::uuid, '{"speed_kmh": 3.0}'::jsonb
    ) f`;
  const [{ n: frameCount }] = await sql`
    select count(*)::int n from public.scenario_frames where scenario_id = ${scenarioId}`;
  const [poison] = await sql`
    select seq from public.scenario_frames
     where scenario_id = ${scenarioId} and kind = 'telemetry' and machine_id is null`;
  await sql`update public.scenarios set frame_count = ${frameCount} where id = ${scenarioId}`;
  console.log(`${frameCount} frames, poison frame at seq ${poison.seq}`);

  // ── 2. start a rehearsal run and let the worker play it ──
  await sql`update public.scenario_runs set is_current = false where is_current`;
  const [run] = await sql`
    insert into public.scenario_runs (scenario_id, status, speed, sim_anchor, wall_anchor, cursor_seq,
                                      is_current, rehearsal, dry_run_external)
    values (${scenarioId}, 'playing', ${SPEED}, ${scn.shift_start_sim}, now(), 0, true, true, true)
    returning id`;
  runId = run.id;
  await sql`
    insert into public.operator_pairings (run_id, operator_id, machine_id)
    values (${runId}, ${op.id}, ${machines[0]})`;

  const t0 = Date.now();
  const expectedWallS = (SIM_MS / 1000) / SPEED;
  console.log(`run ${runId} playing at ${SPEED}× — ${(SIM_MS / 3_600_000).toFixed(2)} simulated hours, ` +
    `expected ${(expectedWallS / 60).toFixed(2)} wall minutes`);

  let status = "playing";
  while (status === "playing" && Date.now() - t0 < expectedWallS * 1000 * 3 + 60_000) {
    await sleep(5000);
    const [r] = await sql`select status, cursor_seq from public.scenario_runs where id = ${runId}`;
    const [agg] = await sql`
      select coalesce(sum(frames), 0)::int frames, coalesce(sum(catchups), 0)::int catchups,
             coalesce(sum(errors), 0)::int errors, coalesce(max(lag_sim_ms), 0)::bigint max_lag
        from private.tick_log where run_id = ${runId}`;
    status = r.status;
    process.stdout.write(
      `  ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  cursor ${String(r.cursor_seq).padStart(6)}/${frameCount}` +
      `  frames ${agg.frames}  catch-ups ${agg.catchups}  errors ${agg.errors}  max lag ${agg.max_lag} sim-ms\n`);
  }
  const wallS = (Date.now() - t0) / 1000;

  // ── 3. the verdict ──
  const [m] = await sql`
    select count(*)::int ticks, coalesce(sum(frames), 0)::int frames, coalesce(sum(catchups), 0)::int catchups,
           coalesce(sum(errors), 0)::int errors, coalesce(max(lag_sim_ms), 0)::bigint max_lag
      from private.tick_log where run_id = ${runId}`;
  const durations = (await sql`
    select duration_ms from private.tick_log where run_id = ${runId}`).map((r) => Number(r.duration_ms));
  const [tickErrors] = await sql`
    select count(*)::int n, coalesce(min(frame_seq), 0)::int first_seq
      from private.tick_errors where run_id = ${runId}`;
  const [workerErrors] = await sql`
    select count(*)::int n from private.worker_errors where at > ${new Date(t0)}`;
  const [jobRuns] = await sql`
    select count(*)::int n, count(*) filter (where status <> 'succeeded')::int failed
      from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'worker')
        and start_time > ${new Date(t0)}`;
  const [applied] = await sql`
    select count(*)::int n from public.telemetry_readings where run_id = ${runId}`;

  const results = [
    [`run finished`, status === "finished", status],
    [`${(SIM_MS / 3_600_000).toFixed(2)} simulated hours in ${(wallS / 60).toFixed(2)} wall minutes`,
      wallS <= expectedWallS * 1.1 + 10, `${wallS.toFixed(1)}s vs ${expectedWallS.toFixed(0)}s expected`],
    [`zero catch_up suppressions`, m.catchups === 0, `${m.catchups}`],
    [`every frame attempted`, m.frames === frameCount, `${m.frames}/${frameCount}`],
    [`the poison frame was logged and skipped`,
      tickErrors.n === 1 && tickErrors.first_seq === Number(poison.seq), `${tickErrors.n} tick_errors, seq ${tickErrors.first_seq}`],
    [`every other frame applied`, m.errors === 1, `${m.errors} frame errors`],
    [`no worker step failed`, workerErrors.n === 0, `${workerErrors.n} worker_errors`],
    [`no cron run failed`, jobRuns.failed === 0, `${jobRuns.failed}/${jobRuns.n} job runs failed`],
  ] as const;

  console.log(`\n── acceptance ──`);
  for (const [name, ok, detail] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`);
  console.log(`\n  ticks ${m.ticks}  telemetry rows ${applied.n}  max lag ${m.max_lag} sim-ms` +
    `  (${(m.frames / Math.max(1, m.ticks)).toFixed(0)} frames per tick, cap ${await sql`select max_frames_per_tick from public.app_config where id`.then((r) => r[0].max_frames_per_tick)})`);
  console.log(`  tick duration ms: p50 ${pct(durations, 0.5)}  p95 ${pct(durations, 0.95)}  max ${Math.max(0, ...durations)}`);
  console.log(`  (B11 owns the p95 ≤ 250 ms / max ≤ 800 ms budget; this is the same measurement, taken early)`);

  process.exitCode = results.every(([, ok]) => ok) ? 0 : 1;
} catch (err) {
  console.error(String(err));
  process.exitCode = 2;
} finally {
  if (!KEEP) {
    console.log(`\ncleaning up …`);
    try {
      if (runId) {
        await sql`update public.scenario_runs set is_current = false, status = 'finished' where id = ${runId}`;
        console.log(`  purge_run: ${JSON.stringify(await sql`select private.purge_run(${runId}) p`.then((r) => r[0].p))}`);
        await sql`delete from public.operator_pairings where run_id = ${runId}`;
        await sql`delete from public.scenario_runs where id = ${runId}`;
      }
      if (scenarioId) {
        await sql`delete from public.scenario_frames where scenario_id = ${scenarioId}`;
        await sql`delete from public.scenarios where id = ${scenarioId}`;
      }
      await sql`delete from public.operators where employee_code like ${tag + "-%"}`;
      await sql`delete from public.machines where code like ${tag + "-%"}`;
      await sql`delete from public.sites where code like ${tag + "-%"}`;
      console.log(`  fixtures removed`);
    } catch (err) {
      console.error(`  cleanup failed (inspect ${tag}- rows by hand): ${String(err)}`);
    }
  }
  await sql.end();
}
