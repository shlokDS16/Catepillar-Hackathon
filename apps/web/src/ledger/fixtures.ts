import { DISPLAY_NAMES, IDS } from "@cat/shared/fixtures";
import { ZERO_HASH, entryHash, merkleRoot, npHash, verifyLedger } from "@cat/shared/ledger";
import type { ExportRow } from "@/ledger/witness";

/**
 * Ledger fixtures for the FixtureAdapter (F15). Real SHA-256 over canonical v1 rows, so the browser
 * verifier is exercised for real, not mocked:
 *  - intact:      214 rows, one of them a sealed near-miss; verifies and matches the witness line below
 *  - rewrite:     the same ledger with row 120 rewritten and every later hash recomputed (self-consistent,
 *                 so Internal check passes, but the Telegram comparison does not match)
 *  - chain_break: row 187's stored hash was altered, so the chain breaks at #187
 * The sealed row (#7) has the backend's 5-key shape; its content is not in the export at all.
 */
export type LedgerScenario = "intact" | "rewrite" | "chain_break";

export const LEDGER_ROWS = 214;
export const SEALED_SEQ = 7;
export const BREAK_SEQ = 187;
export const REWRITE_SEQ = 120;

/** Weighted so the mix looks like a shift's record, not a rota: seatbelt and PPE lead, a few rarer types. */
const TYPES = [
  "seatbelt_breach", "seatbelt_breach", "seatbelt_breach", "ppe_violation", "ppe_violation", "overspeed", "overspeed",
  "proximity", "proximity", "guardian_hazard", "first_aid", "property_damage", "ppe_override",
] as const;
const SITE = "11111111-1111-4111-8111-111111111111";
const OPERATOR_IDS = Object.keys(DISPLAY_NAMES).filter((k) => k.startsWith("2222222"));
const MACHINE_IDS = [IDS.machine, "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2", IDS.anomaly];
const SHIFT_START_MS = Date.parse("2026-09-23T05:41:00.000Z");

/** Deterministic pseudo-random in [0, 1) from the sequence number: the hashes must be stable across runs. */
function unit(seq: number, salt: number): number {
  const x = Math.sin(seq * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Irregular gaps of 1 to 8 minutes, so entries do not tick along at a fixed step. */
const OCCURRED_MS: number[] = (() => {
  const out: number[] = [];
  let t = SHIFT_START_MS;
  for (let seq = 1; seq <= LEDGER_ROWS; seq++) {
    t += Math.floor(60_000 + unit(seq, 1) * 7 * 60_000) + Math.floor(unit(seq, 2) * 59) * 1000;
    out.push(t);
  }
  return out;
})();

const iso = (ms: number) => new Date(ms).toISOString().replace("Z", "000Z");

function fieldsFor(seq: number, prev: string, tweak = false): Record<string, unknown> {
  const sealed = seq === SEALED_SEQ;
  const at = OCCURRED_MS[seq - 1]!;
  return {
    v: "1",
    seq: String(seq),
    prev_hash: prev,
    run_id: null,
    occurred_at: iso(at),
    recorded_at: iso(at + 1000 + Math.floor(unit(seq, 4) * 2000)),
    incident_type: sealed ? "near_miss" : TYPES[Math.floor(unit(seq, 5) * TYPES.length)],
    severity: String(1 + Math.floor(unit(seq, 6) * 4)),
    site_id: SITE,
    operator_id: sealed ? null : OPERATOR_IDS[Math.floor(unit(seq, 7) * OPERATOR_IDS.length)],
    machine_id: MACHINE_IDS[Math.floor(unit(seq, 3) * MACHINE_IDS.length)],
    lat: "21.146300",
    lon: "79.088200",
    description: tweak ? "edited after the checkpoint" : `Entry ${seq}`,
    context: { speed_kmh: String(Math.floor(unit(seq, 8) * 9)) },
    reported_by: null,
    reporter_kind: "detector",
    source_event_id: null,
    supersedes_seq: null,
    non_punitive: sealed,
  };
}

async function build(scenario: LedgerScenario): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  let prev = ZERO_HASH;
  for (let seq = 1; seq <= LEDGER_ROWS; seq++) {
    const f = fieldsFor(seq, prev, scenario === "rewrite" && seq === REWRITE_SEQ);
    const hash = await entryHash(f);
    // A sealed near-miss goes out as exactly {v, seq, prev_hash, non_punitive, sealed} + entry_hash; the
    // hash is still the hash of the full row, so the chain and the Merkle root keep their meaning.
    const shown = seq === SEALED_SEQ ? { v: "1", seq: String(seq), prev_hash: prev, non_punitive: true, sealed: true } : f;
    rows.push({ seq: String(seq), prev_hash: prev, entry_hash: hash, v: "1", canonical_fields: shown });
    prev = hash;
  }
  if (scenario === "chain_break") {
    const at = BREAK_SEQ - 1;
    const stored = rows[at]!.entry_hash;
    rows[at] = { ...rows[at]!, entry_hash: (stored[0] === "a" ? "b" : "a") + stored.slice(1) };
  }
  return rows;
}

const cache = new Map<LedgerScenario, Promise<ExportRow[]>>();
export function ledgerRows(scenario: LedgerScenario): Promise<ExportRow[]> {
  let p = cache.get(scenario);
  if (!p) {
    p = build(scenario);
    cache.set(scenario, p);
  }
  return p;
}

/** The Telegram checkpoint for the intact ledger, as it is sent (data-model §4.5). */
export async function witnessLineFor(first = 1, last = LEDGER_ROWS): Promise<string> {
  const rows = (await ledgerRows("intact")).slice(first - 1, last);
  const root = await merkleRoot(rows.map((r) => r.entry_hash));
  const head = rows[rows.length - 1]!.entry_hash;
  const sealed = rows.filter((r) => r.canonical_fields.sealed === true).map((r) => Number(r.seq));
  return `SPOTTER-LEDGER v1 seq=${first}..${last} n=${rows.length} root=${root} head=${head} np=${await npHash(sealed)}`;
}

export async function ledgerVerdict(scenario: LedgerScenario) {
  const rows = await ledgerRows(scenario);
  const r = await verifyLedger(rows);
  const intact = await ledgerRows("intact");
  const bad = r.first_bad_seq;
  return {
    ok: r.status !== "failed",
    checked: r.status !== "failed" ? r.checked : (bad ?? r.checked),
    first_bad_seq: bad,
    reason: r.reason === "hash_mismatch" || r.reason === "link_broken" || r.reason === "seq_gap" ? r.reason : null,
    expected: bad ? intact[bad - 1]!.entry_hash : null,
    stored: bad ? rows[bad - 1]!.entry_hash : null,
    head_seq: LEDGER_ROWS,
    head_hash: rows[rows.length - 1]!.entry_hash,
    chain_ok: r.status !== "failed",
    queue: { errored: 0, pending: 0, oldest_pending_age_s: null, oldest_errored_age_s: null, stale_after_s: 5, stuck: false },
  };
}
