/**
 * Writes the contract-derived SQL (scripts/lib/contracts-sql.ts):
 *   supabase/migrations/20260923000000_contracts_enums.sql   the enums (first migration, B1)
 *   supabase/seed/contracts_registry.sql                      event_types + alert_policies + templates
 *   --into <migration.sql>                                    also embed the seed between markers (B4)
 * Re-run after any registry change; `scripts/gen-sql-seed.test.ts` fails when the committed files are stale.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "./lib/env.ts";
import { embedSeed, enumsSql, registrySeedSql } from "./lib/contracts-sql.ts";

export const ENUMS_MIGRATION = "supabase/migrations/20260923000000_contracts_enums.sql";
export const REGISTRY_SEED = "supabase/seed/contracts_registry.sql";

const root = repoRoot();
const write = (rel: string, text: string) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, "utf8");
  console.log(`wrote ${rel} (${text.length} chars)`);
};
write(ENUMS_MIGRATION, enumsSql());
write(REGISTRY_SEED, registrySeedSql());

const into = process.argv.indexOf("--into");
if (into >= 0) {
  const rel = process.argv[into + 1];
  if (!rel) throw new Error("--into needs a migration path");
  const file = join(root, rel);
  writeFileSync(file, embedSeed(readFileSync(file, "utf8"), registrySeedSql()), "utf8");
  console.log(`embedded the seed into ${rel}`);
}
