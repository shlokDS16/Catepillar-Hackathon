import { FIELD_PROVENANCE, type Provenance } from "@cat/shared";

export type ProvenanceTable = keyof typeof FIELD_PROVENANCE;

/** What the UI shows for a value (screens.md, provenance chips). */
export type ProvenanceTag =
  | { kind: "assumed" }
  | { kind: "simulated" }
  | { kind: "source"; label: string }
  | { kind: "none" };

/** Source lines for real open data, by table (api-contracts §11). */
const SOURCE_LABEL: Partial<Record<ProvenanceTable, string>> = {
  task_history: "Weather: Open-Meteo archive, CC BY 4.0",
  weather_snapshots: "Open-Meteo archive, CC BY 4.0",
};

/** The raw registry answer, or null when the column is not listed (internal). */
export function provenanceKind(table: ProvenanceTable, field: string): Provenance | null {
  const entry = FIELD_PROVENANCE[table] as Partial<Record<Provenance, readonly string[]>>;
  for (const kind of Object.keys(entry) as Provenance[]) {
    if (entry[kind]?.includes(field)) return kind;
  }
  return null;
}

/**
 * provenanceOf(table, field): assumed_sensor → "assumed"; synthetic → "simulated";
 * real_open_data → the source line; organiser, derived and unlisted → no chip.
 * A derived value inherits "assumed" when the caller says one of its inputs is assumed
 * (e.g. ₹ cost from FUEL_PRICE).
 */
export function provenanceOf(table: ProvenanceTable, field: string, opts: { inputAssumed?: boolean } = {}): ProvenanceTag {
  const kind = provenanceKind(table, field);
  switch (kind) {
    case "assumed_sensor":
      return { kind: "assumed" };
    case "synthetic":
      return { kind: "simulated" };
    case "real_open_data":
      return { kind: "source", label: SOURCE_LABEL[table] ?? "Open data" };
    case "derived":
      return opts.inputAssumed ? { kind: "assumed" } : { kind: "none" };
    default:
      return { kind: "none" };
  }
}

/** True when any of the listed fields would carry an "assumed" or "simulated" chip (Simple-mode summary line). */
export function anyAssumed(pairs: Array<[ProvenanceTable, string]>): boolean {
  return pairs.some(([t, f]) => {
    const k = provenanceOf(t, f).kind;
    return k === "assumed" || k === "simulated";
  });
}
