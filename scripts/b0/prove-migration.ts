/**
 * Proves a NEW migration together with the SQL tests in ONE transaction that is always rolled back, so
 * nothing reaches the shared project (L1 rule: prove before `supabase db push`).
 *
 *   pnpm exec tsx scripts/b0/prove-migration.ts 20261112190000_007_alert_engine.sql [test filter]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { connect } from "../lib/db.ts";
import { repoRoot } from "../lib/env.ts";

class Rollback extends Error {}
const mig = process.argv[2];
const filter = process.argv[3] ?? "";
if (!mig) { console.error("usage: prove-migration.ts <migration file> [test filter]"); process.exit(2); }
const root = repoRoot();
const sql = connect({ quiet: true, warnings: true });
const tests = readdirSync(join(root, "supabase", "tests")).filter((f) => f.endsWith(".sql") && f.includes(filter)).sort();
let failed = 0;
for (const f of tests) {
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(root, "supabase", "migrations", mig), "utf8"));
      await tx.unsafe(readFileSync(join(root, "supabase", "tests", f), "utf8"));
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) { failed++; console.log(`FAIL ${f}\n  ${(e as Error).message}`); continue; }
  }
  console.log(`ok   ${f}`);
}
await sql.end();
process.exitCode = failed ? 1 : 0;
