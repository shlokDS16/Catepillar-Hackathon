/**
 * Canonical serialisation v1 (data-model §4.3, G2-12): the exact bytes that are hashed into
 * `incidents.entry_hash`. This file is the TypeScript mirror of `private.ledger_canonical_text()` in
 * migration 003; the two are proved byte-identical by golden vectors 1-3 (ledger.test.ts and
 * supabase/tests/005_ledger.sql).
 *
 * The domain is deliberately restricted, so that neither side ever has to make a formatting choice:
 *  1. keys are ASCII `[a-z0-9_]`, sorted by byte value at every level (never by JS iteration order);
 *  2. every non-null, non-boolean value is a JSON **string** — JSON numbers are rejected, so no float
 *     ever round-trips (timestamps, latitudes and counters arrive pre-formatted as text from SQL and
 *     are never parsed into `Date` or `number` here);
 *  3. strings may not contain a code point < U+0020; escaping is then only `"` → `\"` and `\` → `\\`,
 *     everything else (including Devanagari) is emitted raw as UTF-8;
 *  4. `null`, `true`, `false` are literals, arrays keep their stored order, and there is no whitespace.
 *
 * The validator throws rather than guessing: an input that cannot be canonicalised is a bug upstream,
 * never a differently-hashed entry.
 */

/** The only value shapes canonical v1 admits. */
export type CanonicalValue = string | boolean | null | CanonicalValue[] | { [key: string]: CanonicalValue };

export class CanonicalError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(`canonical v1 at ${path || "$"}: ${message}`);
    this.name = "CanonicalError";
    this.path = path;
  }
}

const KEY_RE = /^[a-z0-9_]+$/;
const CONTROL_RE = /[\u0000-\u001f]/;

/** Byte-value order. Keys are ASCII by rule 1, so code-unit order is byte order; compared explicitly. */
function byByteValue(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

function quote(s: string, path: string): string {
  if (CONTROL_RE.test(s)) throw new CanonicalError("string contains a control character (< U+0020)", path);
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function write(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return quote(value, path);
  if (typeof value === "number") throw new CanonicalError("JSON numbers are not allowed; format as a string", path);
  if (typeof value === "undefined") throw new CanonicalError("undefined is not a JSON value", path);
  if (Array.isArray(value)) return `[${value.map((v, i) => write(v, `${path}[${i}]`)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort(byByteValue);
    const parts = keys.map((k) => {
      if (!KEY_RE.test(k)) throw new CanonicalError(`key ${JSON.stringify(k)} is not ASCII [a-z0-9_]`, path);
      return `${quote(k, path)}:${write((value as Record<string, unknown>)[k], `${path}.${k}`)}`;
    });
    return `{${parts.join(",")}}`;
  }
  throw new CanonicalError(`unsupported value of type ${typeof value}`, path);
}

/** The canonical v1 text of one ledger entry. Throws `CanonicalError` on anything outside the domain. */
export function canonicalize(entry: unknown): string {
  return write(entry, "");
}

/** UTF-8 bytes of the canonical text — what SHA-256 is taken over. */
export function canonicalBytes(entry: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(entry));
}

/**
 * The 20 top-level fields of a canonical v1 entry, in canonical (byte) order. `ledger_export` returns
 * exactly these keys per row, as text; the verifier refuses a row with any other key set.
 */
export const CANONICAL_V1_FIELDS = [
  "context", "description", "incident_type", "lat", "lon", "machine_id", "non_punitive", "occurred_at",
  "operator_id", "prev_hash", "recorded_at", "reported_by", "reporter_kind", "run_id", "seq", "severity",
  "site_id", "source_event_id", "supersedes_seq", "v",
] as const;

export const ZERO_HASH = "0".repeat(64);

/**
 * Golden vectors 1-3 of data-model §4.3, computed 2026-09-23 and re-proved here, in SQL
 * (supabase/tests/005_ledger.sql) and in the browser verifier. Any change to them is a breaking
 * change to canonical v1 and needs a `v` bump, never an edit.
 */
export const GOLDEN_VECTOR_1 = {
  v: "1",
  seq: "1",
  prev_hash: ZERO_HASH,
  run_id: null,
  occurred_at: "2026-09-23T08:15:02.123456Z",
  recorded_at: "2026-09-23T08:15:03.000001Z",
  incident_type: "seatbelt_breach",
  severity: "4",
  site_id: "11111111-1111-4111-8111-111111111111",
  operator_id: "22222222-2222-4222-8222-222222222222",
  machine_id: "33333333-3333-4333-8333-333333333333",
  lat: "21.146300",
  lon: "79.088200",
  description: 'सीटबेल्ट नहीं लगा, ढलान 17.4° "B3"',
  context: {
    speed_kmh: "6.2",
    pitch_deg: "17.4",
    zone: { name: "Bench 3", max_slope_deg: "15" },
    ppe: ["helmet", "vest"],
  },
  reported_by: null,
  reporter_kind: "detector",
  source_event_id: "44444444-4444-4444-8444-444444444444",
  supersedes_seq: null,
  non_punitive: false,
} satisfies CanonicalValue;

export const GOLDEN_VECTOR_1_HASH = "b04bf3cbe21a368128e2f5eb4d7d0d8a3b3a8491f84998aa2869e3cb88b51181";
export const GOLDEN_VECTOR_1_BYTES = 797;

export const GOLDEN_VECTOR_2 = {
  ...GOLDEN_VECTOR_1,
  seq: "2",
  prev_hash: GOLDEN_VECTOR_1_HASH,
  incident_type: "sos",
  severity: "5",
  description: "SOS",
  context: {},
} satisfies CanonicalValue;

export const GOLDEN_VECTOR_2_HASH = "db5217f0823bfc42c5c14ca00414c2c24da4dae60819589d7f63db77f03e065f";

/** Merkle root of leaves [vector 1, vector 2] (data-model §4.5: raw 32-byte hashes, not the hex text). */
export const GOLDEN_VECTOR_3_ROOT = "603286c8575192d014b33463f312267d7dc8e7ab398b163959a91438e69b3574";
