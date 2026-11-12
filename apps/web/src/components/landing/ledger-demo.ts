import { ZERO_HASH, entryHash, type LedgerExportRow } from "@cat/shared/ledger";

/**
 * Six simulated ledger entries in full canonical v1 form (all 20 fields), hashed with the product's
 * own `entryHash` and chained by `prev_hash`. `honest` is the set the ledger holds; it passes
 * `verifyLedger`. `tampered` is the same set with one field of row 4 edited after the fact, so
 * `verifyLedger` stops at row 4 with a hash mismatch. Computed on the server, once per render.
 */
export const TAMPER_AT = 4;

export type LedgerRow = {
  seq: number;
  type: "seatbelt_breach" | "idle_excess" | "overspeed" | "proximity_warning" | "slope_alert";
  severity: string;
  /** The hash stored in the ledger (and carried by the next row as `prev`). */
  stored: string;
  prev: string;
  /** What a verifier recomputes from the fields as they now read. Differs from `stored` on row 4 only. */
  recomputed: string;
  tampered: boolean;
};

export type LedgerDemo = { rows: LedgerRow[]; honest: LedgerExportRow[]; tampered: LedgerExportRow[] };

const BASE: Array<{ type: LedgerRow["type"]; severity: string; lat: string; lon: string }> = [
  { type: "seatbelt_breach", severity: "3", lat: "21.146300", lon: "79.088200" },
  { type: "idle_excess", severity: "1", lat: "21.146512", lon: "79.088340" },
  { type: "overspeed", severity: "2", lat: "21.146744", lon: "79.088101" },
  { type: "proximity_warning", severity: "4", lat: "21.146390", lon: "79.088455" },
  { type: "slope_alert", severity: "2", lat: "21.146102", lon: "79.088020" },
  { type: "seatbelt_breach", severity: "3", lat: "21.146610", lon: "79.088277" },
];

const SITE = "11111111-1111-4111-8111-111111111111";
const OPERATOR = "22222222-2222-4222-8222-222222222222";
const MACHINE = "33333333-3333-4333-8333-333333333333";

function entry(i: number, prev: string, severity: string) {
  const b = BASE[i];
  const ts = (s: number) => `2026-09-23T08:${String(15 + i * 7).padStart(2, "0")}:${String(s).padStart(2, "0")}.000000Z`;
  return {
    v: "1",
    seq: String(i + 1),
    prev_hash: prev,
    run_id: null,
    occurred_at: ts(2),
    recorded_at: ts(3),
    incident_type: b.type,
    severity,
    site_id: SITE,
    operator_id: OPERATOR,
    machine_id: MACHINE,
    lat: b.lat,
    lon: b.lon,
    description: `Simulated ${b.type} on Bench 3`,
    context: { speed_kmh: "6.2", zone: { name: "Bench 3" } },
    reported_by: null,
    reporter_kind: "detector",
    source_event_id: `44444444-4444-4444-8444-4444444444${String(40 + i)}`,
    supersedes_seq: null,
    non_punitive: false,
  };
}

const exportRow = (e: ReturnType<typeof entry>, hash: string): LedgerExportRow => ({
  seq: e.seq,
  prev_hash: e.prev_hash,
  entry_hash: hash,
  v: e.v,
  canonical_fields: e,
});

export async function buildLedgerDemo(): Promise<LedgerDemo> {
  const rows: LedgerRow[] = [];
  const honest: LedgerExportRow[] = [];
  const tampered: LedgerExportRow[] = [];
  let prev = ZERO_HASH;
  for (let i = 0; i < BASE.length; i++) {
    const seq = i + 1;
    const e = entry(i, prev, BASE[i].severity);
    const stored = await entryHash(e);
    honest.push(exportRow(e, stored));
    // After the fact, row 4's severity is edited from 4 to 1 and nothing else is touched.
    const shown = seq === TAMPER_AT ? entry(i, prev, "1") : e;
    const recomputed = seq === TAMPER_AT ? await entryHash(shown) : stored;
    tampered.push(exportRow(shown, stored));
    rows.push({ seq, type: BASE[i].type, severity: shown.severity, stored, prev, recomputed, tampered: seq === TAMPER_AT });
    prev = stored;
  }
  return { rows, honest, tampered };
}

/** 16 hex characters in groups of four, the way the ledger screen groups hashes. */
export function groups(hash: string): string {
  return (hash.slice(0, 16).match(/.{4}/g) ?? []).join(" ");
}
