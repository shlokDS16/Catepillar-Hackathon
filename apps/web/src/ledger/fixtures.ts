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

const TYPES = ["seatbelt_breach", "overspeed", "ppe_violation", "proximity"] as const;
const SITE = "11111111-1111-4111-8111-111111111111";

function fieldsFor(seq: number, prev: string, tweak = false): Record<string, unknown> {
  const sealed = seq === SEALED_SEQ;
  const minute = String(seq % 60).padStart(2, "0");
  return {
    v: "1",
    seq: String(seq),
    prev_hash: prev,
    run_id: null,
    occurred_at: `2026-09-23T${String(8 + Math.floor(seq / 60)).padStart(2, "0")}:${minute}:02.000000Z`,
    recorded_at: `2026-09-23T${String(8 + Math.floor(seq / 60)).padStart(2, "0")}:${minute}:03.000000Z`,
    incident_type: sealed ? "near_miss" : TYPES[seq % TYPES.length],
    severity: String(1 + (seq % 4)),
    site_id: SITE,
    operator_id: sealed ? null : `2222222${seq % 10}-2222-4222-8222-222222222222`,
    machine_id: `3333333${seq % 10}-3333-4333-8333-333333333333`,
    lat: "21.146300",
    lon: "79.088200",
    description: tweak ? "edited after the checkpoint" : `Entry ${seq}`,
    context: { speed_kmh: String(seq % 9) },
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
