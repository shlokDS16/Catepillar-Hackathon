/** S8 Analytics (F20): pure helpers. `v_task_analytics` columns are nullable (B2 handoff): never read null as 0. */
import { TaskType, WeatherKind } from "@cat/shared";
import { z } from "zod";

/** A view row as the database returns it: every column may be null. */
export const LooseTaskAnalyticsRow = z.object({
  task_type: TaskType.nullable(), condition: WeatherKind.nullable(), n: z.number().int().nullable(),
  mean_actual_min: z.number().nullable(), mean_organiser_estimate_min: z.number().nullable(),
  mean_model_p50_min: z.number().nullable(), mae_organiser_min: z.number().nullable(),
  mae_model_min: z.number().nullable(), bias_organiser_min: z.number().nullable(), bias_model_min: z.number().nullable(),
});
export type LooseRow = z.infer<typeof LooseTaskAnalyticsRow>;
export type TaskTypeKey = z.infer<typeof TaskType>;
export type WeatherKey = z.infer<typeof WeatherKind>;

export const TASK_ORDER: readonly TaskTypeKey[] = ["excavation", "trenching", "material_loading", "grading", "demolition"];
export const CONDITION_ORDER: readonly WeatherKey[] = ["clear", "hot", "rain", "windy", "cold", "fog", "dust"];
export const DEFAULT_CONDITION: WeatherKey = "hot";
/** A group with fewer tasks than this is drawn dimmed (screens.md S8a). */
export const MIN_N = 10;

export type Series = "actual" | "organiser" | "model";
export type Group = {
  task: TaskTypeKey; n: number; few: boolean;
  actual: number | null; organiser: number | null; model: number | null;
  maeOrganiser: number | null; maeModel: number | null;
  biasOrganiser: number | null; biasModel: number | null;
};

/** Rows that identify a task type, a condition and a count; other columns stay null. Unparseable rows are dropped. */
export function parseRows(raw: unknown[]): LooseRow[] {
  const out: LooseRow[] = [];
  for (const r of raw) {
    const p = LooseTaskAnalyticsRow.safeParse(r);
    if (p.success && p.data.task_type && p.data.condition && p.data.n !== null) out.push(p.data);
  }
  return out;
}

/** The conditions that have at least one row, in the fixed order. */
export function conditionsPresent(rows: LooseRow[]): WeatherKey[] {
  const seen = new Set(rows.map((r) => r.condition));
  return CONDITION_ORDER.filter((c) => seen.has(c));
}

/** Initial selection: `hot` if present, else the first present condition, else null. */
export function pickDefault(rows: LooseRow[]): WeatherKey | null {
  const present = conditionsPresent(rows);
  return present.includes(DEFAULT_CONDITION) ? DEFAULT_CONDITION : (present[0] ?? null);
}

/** One group per task type (fixed order) for the condition; a task type with no row is absent, not zero. */
export function groupsFor(rows: LooseRow[], condition: WeatherKey): Group[] {
  const out: Group[] = [];
  for (const task of TASK_ORDER) {
    const r = rows.find((x) => x.condition === condition && x.task_type === task);
    if (!r || r.n === null) continue;
    out.push({
      task, n: r.n, few: r.n < MIN_N,
      actual: r.mean_actual_min, organiser: r.mean_organiser_estimate_min, model: r.mean_model_p50_min,
      maeOrganiser: r.mae_organiser_min, maeModel: r.mae_model_min,
      biasOrganiser: r.bias_organiser_min, biasModel: r.bias_model_min,
    });
  }
  return out;
}

export function totalN(groups: Group[]): number {
  return groups.reduce((s, g) => s + g.n, 0);
}

/** Largest printed value, for the shared scale; null values are skipped. Never 0 (avoids a divide by zero). */
export function maxMinutes(groups: Group[]): number {
  let m = 0;
  for (const g of groups) for (const v of [g.actual, g.organiser, g.model]) if (v !== null && v > m) m = v;
  return m > 0 ? m : 1;
}

export type BiasLine = { kind: "short" | "over" | "exact" | "flat"; minutes: number } | { kind: "unknown" };
/** "On target" needs a small absolute error as well as a small mean error: errors can cancel on average. */
export const ON_TARGET_MAE = 1;

/**
 * `bias = mean(estimate − actual)` in minutes (api-contracts §14): negative means the estimate ran short,
 * positive means it ran over. Rounded to whole minutes; |bias| below half a minute reads as "exact".
 */
export function biasLine(bias: number | null, mae: number | null = null): BiasLine {
  if (bias === null || !Number.isFinite(bias)) return { kind: "unknown" };
  const m = Math.round(Math.abs(bias));
  if (m === 0) return mae !== null && mae < ON_TARGET_MAE ? { kind: "exact", minutes: 0 } : { kind: "flat", minutes: 0 };
  return { kind: bias < 0 ? "short" : "over", minutes: m };
}

/** One decimal everywhere (chart labels, table, verdict); null stays null. */
export function fmtMin(v: number | null): string | null {
  return v === null || !Number.isFinite(v) ? null : v.toFixed(1);
}

/** Does the model beat the organiser on mean absolute error in this group? null when either is missing. */
export function modelBeats(g: Group): boolean | null {
  if (g.maeModel === null || g.maeOrganiser === null) return null;
  return g.maeModel < g.maeOrganiser;
}

/** n-weighted mean MAE across groups with both values; groups with n < MIN_N are excluded (the headline). */
export function weightedMae(groups: Group[]): { organiser: number; model: number; n: number } | null {
  let n = 0, o = 0, m = 0;
  for (const g of groups) {
    if (g.few) continue;
    if (g.maeOrganiser === null || g.maeModel === null) continue;
    n += g.n; o += g.maeOrganiser * g.n; m += g.maeModel * g.n;
  }
  return n < MIN_N ? null : { organiser: o / n, model: m / n, n };
}

/** Evidence metrics: a missing key is "Not computed yet", never a zero. */
export type EvidenceLite = { metric_key: string; value: number; n: number | null; details?: Record<string, unknown> };
export function evidenceValue(list: EvidenceLite[], key: string, type?: string): EvidenceLite | null {
  return list.find((e) => e.metric_key === key && (type === undefined || e.details?.type === type)) ?? null;
}
