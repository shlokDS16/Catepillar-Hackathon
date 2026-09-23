import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALERT_POLICIES, EVENT_REGISTRY, SQL_ENUMS } from "../packages/shared/src/index.ts";
import { embedSeed, enumsSql, registrySeedSql, sqlLiteral, BEGIN_MARK, END_MARK } from "./lib/contracts-sql.ts";
import { repoRoot } from "./lib/env.ts";

const read = (rel: string) => readFileSync(join(repoRoot(), rel), "utf8").replace(/\r\n/g, "\n");

describe("generated SQL matches the committed files (re-run scripts/gen-sql-seed.ts after a registry change)", () => {
  it("enums migration", () => {
    expect(read("supabase/migrations/20260923000000_contracts_enums.sql")).toBe(enumsSql());
  });
  it("registry seed", () => {
    expect(read("supabase/seed/contracts_registry.sql")).toBe(registrySeedSql());
  });
});

describe("registry → SQL seed", () => {
  it("has one create type per SQL enum and one row per event type and policy", () => {
    const enums = enumsSql();
    for (const name of Object.keys(SQL_ENUMS)) expect(enums).toContain(`create type public.${name} as enum`);
    const seed = registrySeedSql();
    for (const type of Object.keys(EVENT_REGISTRY)) expect(seed).toContain(`('${type}',`);
    for (const kind of Object.keys(ALERT_POLICIES)) expect(seed).toContain(`('${kind}',`);
    expect(seed).toContain("insert into public.explanation_templates");
  });
  it("adds every enum value with `add value if not exists`, so later additions reach an existing database", () => {
    const enums = enumsSql();
    for (const [name, schema] of Object.entries(SQL_ENUMS)) {
      for (const v of schema.options) expect(enums).toContain(`alter type public.${name} add value if not exists '${v}';`);
    }
  });
  it("quotes literals: single quotes doubled, Devanagari raw", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral("ढलान")).toBe("'ढलान'");
    expect(registrySeedSql()).toContain("पिछले एक घंटे");
  });
  it("embeds between markers idempotently", () => {
    const once = embedSeed("-- migration\ncreate table x();\n", "insert 1;");
    expect(once).toContain(`${BEGIN_MARK}\ninsert 1;\n${END_MARK}`);
    const twice = embedSeed(once, "insert 2;");
    expect(twice).toContain("insert 2;");
    expect(twice).not.toContain("insert 1;");
    expect(twice.split(BEGIN_MARK).length).toBe(2);
  });
});
