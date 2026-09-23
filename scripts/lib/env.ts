/**
 * Loads the repo-root `.env`. Tolerates CRLF, `KEY = value` spacing, trailing `# comments` (quoted or
 * not) and `export KEY=`. Single-line values only (a multi-line quoted value is not supported).
 * Values are never logged; callers print only facts derived from them.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Env = Record<string, string>;

export function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

const LINE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const DOUBLE_QUOTED = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/;
const SINGLE_QUOTED = /^'([^']*)'\s*(?:#.*)?$/;

export function parseEnv(text: string): Env {
  const out: Env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(LINE);
    if (!m) continue;
    const rest = m[2].trim();
    const dq = rest.match(DOUBLE_QUOTED);
    const sq = rest.match(SINGLE_QUOTED);
    let value: string;
    if (dq) value = dq[1].replace(/\\(["\\])/g, "$1");
    else if (sq) value = sq[1];
    else value = rest.replace(/\s+#.*$/, "").trim(); // unquoted: an inline comment starts at " #"
    out[m[1]] = value;
  }
  return out;
}

/** `.env` values first, then the process environment overrides them (so `DRY_RUN=… tsx …` works). */
export function loadEnv(file = join(repoRoot(), ".env")): Env {
  const merged: Env = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && v !== "") merged[k] = v;
  return merged;
}

export function requireEnv(env: Env, ...keys: string[]): Env {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing env: ${missing.join(", ")}`);
  return env;
}

export function projectRef(env: Env): string {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF;
  const m = env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  if (!m) throw new Error("cannot derive the project ref: set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL");
  return m[1];
}
