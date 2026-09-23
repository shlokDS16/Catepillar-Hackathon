/**
 * SQL unit-test runner (backend-tasks §0 tooling): every `supabase/tests/*.sql` file runs inside one
 * transaction that is always rolled back, through the session pooler. A file passes when it raises no
 * error; assertions are `do $$ begin assert …; end $$` blocks or `raise exception`. Step functions only,
 * never the COMMITting procedures (R2-1). A file with a top-level `begin`, `commit` or `rollback`
 * statement is refused, because it would escape the rollback and change the shared project.
 *
 *   pnpm exec tsx scripts/sqltest.ts            # all files
 *   pnpm exec tsx scripts/sqltest.ts 003        # files whose name contains 003
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./lib/db.ts";
import { repoRoot } from "./lib/env.ts";
import { transactionControl } from "./lib/sql-guard.ts";

class Rollback extends Error {}

const dir = join(repoRoot(), "supabase", "tests");
const filter = process.argv[2] ?? "";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql") && f.includes(filter)).sort();
if (files.length === 0) {
  console.error(`no test files in ${dir} matching ${filter}`);
  process.exit(2);
}
const sql = connect({ quiet: true });
let failed = 0;
for (const file of files) {
  const text = readFileSync(join(dir, file), "utf8");
  const control = transactionControl(text);
  if (control) {
    failed++;
    console.log(`FAIL  ${file}\n      refused: top-level "${control}" would escape the rollback`);
    continue;
  }
  const t0 = Date.now();
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) {
      failed++;
      const e = err as Error & { hint?: string };
      const hint = e.hint ? `\n      hint: ${e.hint}` : "";
      console.log(`FAIL  ${file}  (${Date.now() - t0} ms)\n      ${e.message}${hint}`);
      continue;
    }
  }
  console.log(`ok    ${file}  (${Date.now() - t0} ms)`);
}
await sql.end();
console.log(`\n${files.length - failed}/${files.length} passed`);
process.exitCode = failed ? 1 : 0;
