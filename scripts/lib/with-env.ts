/**
 * Runs a command with the root `.env` injected into its environment, for CLIs that read env vars
 * (used for `supabase link`, which needs SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD):
 *   pnpm exec tsx scripts/lib/with-env.ts supabase link --project-ref <ref>
 * No shell: arguments are passed through verbatim.
 */
import { spawnSync } from "node:child_process";
import { loadEnv } from "./env.ts";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: with-env <command> [args...]");
  process.exit(2);
}
const r = spawnSync(cmd, args, { stdio: "inherit", env: loadEnv() });
if (r.error) {
  console.error(r.error.message);
  process.exit(1);
}
process.exit(r.status ?? 1);
