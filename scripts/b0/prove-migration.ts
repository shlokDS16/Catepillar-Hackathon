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
import { transactionControl } from "../lib/sql-guard.ts";

class Rollback extends Error {}
const mig = process.argv[2];
const filter = process.argv[3] ?? "";
if (!mig) { console.error("usage: prove-migration.ts <migration file> [test filter]"); process.exit(2); }
const root = repoRoot();
const sql = connect({ quiet: true, warnings: true });
const tests = readdirSync(join(root, "supabase", "tests")).filter((f) => f.endsWith(".sql") && f.includes(filter)).sort();
let failed = 0;
const migText = mig.split(",").map((m) => readFileSync(join(root, "supabase", "migrations", m), "utf8")).join(";\n");
const migControl = transactionControl(migText);
if (migControl) { console.log(`FAIL ${mig}
  refused: top-level "${migControl}" would escape the rollback`); process.exit(1); }
for (const f of tests) {
  const testText = readFileSync(join(root, "supabase", "tests", f), "utf8");
  const control = transactionControl(testText);
  if (control) { failed++; console.log(`FAIL ${f}
  refused: top-level "${control}" would escape the rollback`); continue; }
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(migText);
      await tx.unsafe(testText);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) { failed++; console.log(`FAIL ${f}\n  ${(e as Error).message}`); continue; }
  }
  console.log(`ok   ${f}`);
}
await sql.end();
process.exitCode = failed ? 1 : 0;
