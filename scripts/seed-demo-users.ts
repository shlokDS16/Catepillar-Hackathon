/**
 * B8 (auth part) + D18 thin live path: re-runnable seed for the two demo logins.
 *
 *   pnpm exec tsx scripts/seed-demo-users.ts [--also-env <path-to-another-.env>]
 *
 * 1. Reference rows (site, zone, machine, operator Ravi, one seatbelt-breach scenario, a paused, non-current run)
 *    only when the project holds none: keyed by code, never duplicated. The breach is applied once with
 *    `private.apply_frame` and `private.step_loop` builds Ravi's lesson assignment and replay. Alert
 *    dispatches are always 'dry_run' (007); nothing here calls sos_raise or sends a message.
 * 2. Auth users for the operator (Ravi) and the fleet manager (Anita): created or updated through the
 *    Auth admin API with email_confirm; profiles bound to the seeded site / operator. This script never changes auth settings (confirm sign-up is off in the dashboard).
 * 3. Credentials go ONLY to the git-ignored .env as DEMO_OPERATOR_EMAIL / DEMO_OPERATOR_PASSWORD /
 *    DEMO_FM_EMAIL / DEMO_FM_PASSWORD (existing values are reused, so a re-run keeps the logins). Never printed.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connect } from "./lib/db.ts";
import { loadEnv, repoRoot, requireEnv } from "./lib/env.ts";

const SITE_CODE = "DEMO-LIVE";
const KEYS = ["DEMO_OPERATOR_EMAIL", "DEMO_OPERATOR_PASSWORD", "DEMO_FM_EMAIL", "DEMO_FM_PASSWORD"] as const;

/** Only throwaway demo addresses may be created or overwritten; a real account in .env is refused. */
export const isDemoEmail = (e: string) => /^[a-z0-9._-]+@spotter-demo\.test$/i.test(e);

/** A credentials file must be git-ignored (never write passwords to a tracked path). */
function gitIgnored(file: string): boolean {
  return spawnSync("git", ["check-ignore", "-q", basename(file)], { cwd: dirname(file) }).status === 0;
}

export const newPassword = () => randomBytes(18).toString("base64url");

/** Replace or append KEY=value lines, keep everything else byte for byte. */
export function upsertEnv(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}\\s*=.*$`, "m");
    out = re.test(out) ? out.replace(re, () => `${k}=${v}`) : `${out}${out.endsWith("\n") || out === "" ? "" : "\n"}${k}=${v}\n`;
  }
  return out;
}

async function seedReference(sql: ReturnType<typeof connect>): Promise<{ siteId: string; operatorId: string }> {
  const existing = await sql`select s.id from public.sites s where s.code = ${SITE_CODE}`;
  let siteId = existing[0]?.id as string | undefined;
  if (!siteId) {
    await sql.begin(async (tx) => {
      const [site] = await tx`insert into public.sites (code, name, site_type, location)
        values (${SITE_CODE}, 'Demo quarry (simulated)', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography)
        returning id`;
      siteId = site!.id as string;
      await tx`insert into public.zones (site_id, name, zone_type, boundary, max_speed_kmh, max_slope_deg)
        values (${siteId}, 'Bench 3', 'work', extensions.ST_GeogFromText('POLYGON((79.0875 21.1458, 79.0895 21.1458, 79.0895 21.1475, 79.0875 21.1475, 79.0875 21.1458))'), 25, 15)`;
      const [model] = await tx`insert into public.machine_models (code, name, machine_type, idle_fuel_lph, baseline_idle_pct)
        values ('DEMO-EXC', 'Demo excavator (simulated)', 'excavator', 28, 25) on conflict (code) do update set name = excluded.name returning id`;
      const [machine] = await tx`insert into public.machines (code, model_id, home_site_id) values ('EXC-007', ${model!.id}, ${siteId}) returning id`;
      const [op] = await tx`insert into public.operators (employee_code, display_name, skill_level, site_id, pseudonym, preferred_language)
        values ('OP-DEMO-RAVI', 'Ravi', 'novice', ${siteId}, 'Operator-R7V', 'hi') returning id`;
      const [scn] = await tx`insert into public.scenarios (code, seed, site_id, shift_start_sim, duration, generator_version)
        values ('demo-live-1', 7, ${siteId}, date_trunc('second', now()) - interval '10 hours', interval '10 hours', 'seed-demo-users') returning id, shift_start_sim`;
      const scenarioId = scn!.id as string;
      await tx`insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, machine_id, payload)
        select ${scenarioId}, n, 600000 + 60000 * (n - 1), 'telemetry', ${machine!.id},
               jsonb_build_object('speed_kmh', 5, 'seatbelt_fastened', n < 11, 'pitch_deg', case when n < 11 then 3 else 17.4 end,
                                  'lat', 21.1463 + n * 0.00002, 'lon', 79.0882 + n * 0.00002)
          from generate_series(1, 15) n`;
      await tx`insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, operator_id, payload)
        select ${scenarioId}, 100 + n, 600000 + 120000 * (n - 1), 'gps', ${op!.id},
               jsonb_build_object('lat', 21.1462 + n * 0.00001, 'lon', 79.0881 + n * 0.00001) from generate_series(1, 8) n`;
      await tx`insert into public.scenario_frames (scenario_id, seq, sim_offset_ms, kind, payload)
        values (${scenarioId}, 201, 0, 'weather', '{"temperature_c": 38.5, "wind_kmh": 12, "wind_from_deg": 250, "wbgt_c": 31.2}')`;
      // A paused, NOT current run: it never advances, and the unique current-run slot stays free for the sqltests.
      const [run] = await tx`insert into public.scenario_runs (scenario_id, status, speed, sim_anchor, wall_anchor, cursor_seq, is_current, rehearsal)
        values (${scenarioId}, 'paused', 1, ${scn!.shift_start_sim}, now(), 0, false, true) returning id`;
      await tx`insert into public.operator_pairings (run_id, operator_id, machine_id) values (${run!.id}, ${op!.id}, ${machine!.id})`;
    });
  }
  const [op] = await sql`select id from public.operators where employee_code = 'OP-DEMO-RAVI'`;
  if (!op) throw new Error("the demo site exists but operator OP-DEMO-RAVI does not; fix the data by hand");

  // The seatbelt breach is applied once (frame 11), then the Loop worker step builds the lesson and the replay.
  const [done] = await sql`select count(*)::int n from public.events e join public.scenario_runs r on r.id = e.run_id
    join public.scenarios s on s.id = r.scenario_id where s.code = 'demo-live-1' and e.type = 'safety.seatbelt_breach'`;
  if (!done || done.n === 0) {
    await sql`do $$
      declare r public.scenario_runs; sc public.scenarios; f public.scenario_frames; c public.app_config;
      begin
        select * into sc from public.scenarios where code = 'demo-live-1';
        select * into r from public.scenario_runs where scenario_id = sc.id order by created_at limit 1;
        select * into f from public.scenario_frames where scenario_id = sc.id and seq = 11;
        select * into c from public.app_config where id;
        perform private.apply_frame(r, sc, f, c, sc.shift_start_sim + make_interval(secs => f.sim_offset_ms / 1000.0), false);
      end $$`;
  }
  for (let i = 0; i < 5; i++) {
    const [rs] = await sql`select count(*)::int n from public.replay_scenarios where operator_id = ${op.id}`;
    if (rs && rs.n > 0) break;
    await sql`select private.step_loop(20)`;
  }
  const [built] = await sql`select count(*)::int n from public.replay_scenarios where operator_id = ${op.id}`;
  if (!built || built.n === 0) throw new Error("no replay was built for the demo operator (check private.loop_queue errors)");
  return { siteId: siteId ?? (await sql`select id from public.sites where code = ${SITE_CODE}`)[0]!.id, operatorId: op.id as string };
}

async function ensureUser(admin: SupabaseClient, email: string, password: string): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      const { error: e2 } = await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
      if (e2) throw new Error(`updateUser failed: ${e2.message}`);
      return found.id;
    }
    if (data.users.length < 200) break;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? "no user"}`);
  return data.user.id;
}

async function main() {
  const env = requireEnv(loadEnv(), "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY");
  const creds: Record<(typeof KEYS)[number], string> = {
    DEMO_OPERATOR_EMAIL: env.DEMO_OPERATOR_EMAIL || "ravi.operator@spotter-demo.test",
    DEMO_OPERATOR_PASSWORD: env.DEMO_OPERATOR_PASSWORD || newPassword(),
    DEMO_FM_EMAIL: env.DEMO_FM_EMAIL || "anita.manager@spotter-demo.test",
    DEMO_FM_PASSWORD: env.DEMO_FM_PASSWORD || newPassword(),
  };
  for (const e of [creds.DEMO_OPERATOR_EMAIL, creds.DEMO_FM_EMAIL]) {
    if (!isDemoEmail(e)) throw new Error("demo emails must end in @spotter-demo.test; refusing to touch another account");
  }
  const targets = [join(repoRoot(), ".env")];
  const also = process.argv.indexOf("--also-env");
  if (also >= 0 && process.argv[also + 1]) targets.push(process.argv[also + 1]!);
  for (const file of targets) if (!gitIgnored(file)) throw new Error("a credentials file is not git-ignored; refusing to write passwords there");
  const sql = connect({ quiet: true });
  try {
    const { siteId, operatorId } = await seedReference(sql);
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const opId = await ensureUser(admin, creds.DEMO_OPERATOR_EMAIL, creds.DEMO_OPERATOR_PASSWORD);
    const fmId = await ensureUser(admin, creds.DEMO_FM_EMAIL, creds.DEMO_FM_PASSWORD);
    await sql`insert into public.profiles (user_id, role, operator_id, site_id, display_name, language)
      values (${opId}, 'operator', ${operatorId}, ${siteId}, 'Ravi', 'hi')
      on conflict (user_id) do update set role = 'operator', operator_id = excluded.operator_id, site_id = excluded.site_id, display_name = excluded.display_name`;
    await sql`insert into public.profiles (user_id, role, operator_id, site_id, display_name, language)
      values (${fmId}, 'fleet_manager', null, ${siteId}, 'Anita', 'en')
      on conflict (user_id) do update set role = 'fleet_manager', operator_id = null, site_id = excluded.site_id, display_name = excluded.display_name`;
  } finally {
    await sql.end();
  }

  for (const file of targets) {
    const text = existsSync(file) ? readFileSync(file, "utf8") : "";
    writeFileSync(file, upsertEnv(text, creds), "utf8");
  }
  console.log(`seeded: site ${SITE_CODE}, operator and fleet-manager logins ready; credentials written to ${targets.length} git-ignored .env file(s) (values not shown)`);
}

if (process.argv[1] && /seed-demo-users\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  main().catch((e) => {
    console.error(`seed failed: ${(e as Error).message}`);
    process.exit(1);
  });
}
