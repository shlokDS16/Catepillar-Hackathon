import { ZERO_HASH, entryHash } from "@cat/shared/ledger";

/**
 * Six simulated ledger entries whose hashes are real: each entry's hash is the canonical-v1
 * SHA-256 from `@cat/shared/ledger`, and each row carries the previous row's hash. Row 4 is then
 * "tampered": its displayed fields change, so its recomputed hash no longer matches the stored
 * one and the chain stops verifying there. Computed on the server, once per render.
 */
export type LedgerRow = {
  seq: number;
  type: string;
  severity: string;
  /** The hash stored in the ledger (and carried by the next row as `prev`). */
  stored: string;
  prev: string;
  /** What a verifier recomputes from the fields as they now read. */
  recomputed: string;
  tampered: boolean;
};

const BASE = [
  { type: "seatbelt_breach", severity: "3", lat: "21.146300", lon: "79.088200" },
  { type: "idle_excess", severity: "1", lat: "21.146512", lon: "79.088340" },
  { type: "overspeed", severity: "2", lat: "21.146744", lon: "79.088101" },
  { type: "proximity_warning", severity: "4", lat: "21.146390", lon: "79.088455" },
  { type: "slope_alert", severity: "2", lat: "21.146102", lon: "79.088020" },
  { type: "seatbelt_breach", severity: "3", lat: "21.146610", lon: "79.088277" },
];

const TAMPER_AT = 4;

export async function buildLedgerDemo(): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = [];
  let prev = ZERO_HASH;
  for (let i = 0; i < BASE.length; i++) {
    const seq = i + 1;
    const fields = { seq: String(seq), v: "1", prev_hash: prev, incident_type: BASE[i].type, severity: BASE[i].severity, lat: BASE[i].lat, lon: BASE[i].lon };
    const stored = await entryHash(fields);
    const tampered = seq === TAMPER_AT;
    // After the fact, row 4's severity is edited from 4 to 1 and nothing else is touched.
    const shown = tampered ? { ...fields, severity: "1" } : fields;
    const recomputed = tampered ? await entryHash(shown) : stored;
    rows.push({ seq, type: BASE[i].type, severity: shown.severity, stored, prev, recomputed, tampered });
    prev = stored;
  }
  return rows;
}

/** 16 hex characters in groups of four, the way the ledger screen groups hashes. */
export function groups(hash: string): string {
  return (hash.slice(0, 16).match(/.{4}/g) ?? []).join(" ");
}
