/**
 * Runs one of a fixed set of Supabase CLI tasks with the root `.env` injected, for the commands
 * that read env vars rather than flags (`link` needs SUPABASE_ACCESS_TOKEN and
 * SUPABASE_DB_PASSWORD):
 *
 *   pnpm exec tsx scripts/lib/with-env.ts link            # project ref comes from .env
 *   pnpm exec tsx scripts/lib/with-env.ts migration-list
 *   pnpm exec tsx scripts/lib/with-env.ts gen-types
 *
 * This wrapper hands the project's secrets to the process it starts, so nothing about that process
 * is taken from the command line: the program is a literal, each task spawns its own literal
 * argument vector, and the single dynamic value (the project ref) is pattern-checked first. Add a
 * task here rather than making the wrapper general.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { loadEnv, projectRef } from "./env.ts";

const env = loadEnv();
const opts = { stdio: "inherit", env, shell: false } as const;

const task = process.argv[2];
let r: SpawnSyncReturns<Buffer>;

if (task === "link") {
  const ref = projectRef(env);
  // Supabase project refs are 20 lowercase letters; refuse anything else rather than pass it on.
  if (!/^[a-z]{20}$/.test(ref)) {
    console.error("SUPABASE_PROJECT_REF is not a valid project ref");
    process.exit(2);
  }
  r = spawnSync("supabase", ["link", "--project-ref", ref], opts);
} else if (task === "migration-list") {
  r = spawnSync("supabase", ["migration", "list", "--linked"], opts);
} else if (task === "gen-types") {
  r = spawnSync("supabase", ["gen", "types", "typescript", "--linked"], opts);
} else {
  console.error("usage: with-env <link | migration-list | gen-types>");
  process.exit(2);
}

if (r.error) {
  console.error(r.error.message);
  process.exit(1);
}
process.exit(r.status ?? 1);
