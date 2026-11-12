import type { EtaFactor } from "@cat/shared";
import type { Task } from "@/data/types";
import { provenanceOf, type ProvenanceTable } from "@/data/provenance";

/**
 * The Task screen's pure logic (interaction-map §4.2 and §7): the PPE gate, which action the primary
 * button offers, and the "why this estimate" rows. No React, no clock: the caller passes `nowMs`.
 */

export type PpeOverrideRecord = { taskId: string; validUntil: string; missing: readonly string[] };

/** What the PPE plate shows. `clear` draws no plate. */
export type PpeView =
  | { kind: "clear" }
  | { kind: "blocked"; missing: readonly string[] }
  | { kind: "restored"; items: readonly string[] }
  /** `lapsed`: the local clock is past the expiry but the server has not said so yet; Start stays usable so it can. */
  | { kind: "override"; validUntil: string; missing: readonly string[]; lapsed: boolean }
  /** The server answered `override_expired`: blocked again until the vest is seen or a new override is granted. */
  | { kind: "expired"; missing: readonly string[] };

export type PpeInput = {
  taskId: string;
  status: Task["status"];
  /** Items still missing, from `ppe.missing` events. */
  missing: readonly string[];
  override: PpeOverrideRecord | null;
  nowMs: number;
  /** The `validUntil` of the override that task_start last answered `override_expired` for. */
  serverExpiredFor?: string | null;
  /** Items named by the last ppe.restored. */
  restored?: readonly string[];
};

/** The three paths (restored / override / expired) plus the block itself. PPE is re-checked on every Start and Resume (UI-12). */
export function derivePpe(i: PpeInput): PpeView {
  // Only a task that is about to run is gated; a working or finished one is not.
  const gated = i.status === "planned" || i.status === "paused" || i.status === "blocked_ppe";
  if (!gated) return { kind: "clear" };
  const o = i.override && i.override.taskId === i.taskId ? i.override : null;
  if (o) {
    if (i.serverExpiredFor === o.validUntil) return { kind: "expired", missing: i.missing.length > 0 ? i.missing : o.missing };
    return { kind: "override", validUntil: o.validUntil, missing: o.missing, lapsed: Date.parse(o.validUntil) <= i.nowMs };
  }
  if (i.missing.length > 0) return { kind: "blocked", missing: i.missing };
  if (i.status === "blocked_ppe") return { kind: "restored", items: i.restored ?? [] };
  return { kind: "clear" };
}

export type PrimaryAction = "start" | "resume" | "pause";

export type TaskActions = {
  primary: PrimaryAction | null;
  /** Start and Resume are disabled with this reason ("Needs vest") while the PPE gate is shut. */
  needsPpe: boolean;
  /** A08 is offered while the task is running or paused. */
  canComplete: boolean;
};

/** A06 / A07 / A08 visibility (interaction-map §4.2). */
export function taskActions(status: Task["status"], ppe: PpeView): TaskActions {
  const gateShut = ppe.kind === "blocked" || ppe.kind === "expired";
  switch (status) {
    case "planned":
    case "blocked_ppe":
      return { primary: "start", needsPpe: gateShut, canComplete: false };
    case "paused":
      return { primary: "resume", needsPpe: gateShut, canComplete: true };
    case "in_progress":
      return { primary: "pause", needsPpe: false, canComplete: true };
    default:
      return { primary: null, needsPpe: false, canComplete: false };
  }
}

/** Working minutes (pauses excluded) from task.started / task.paused times; null when the start was not seen. */
export function elapsedMin(work: { workedMs: number; runningSince: string | null } | undefined, nowMs: number): number | null {
  if (!work) return null;
  const live = work.runningSince ? Math.max(0, nowMs - Date.parse(work.runningSince)) : 0;
  const ms = work.workedMs + live;
  return Number.isFinite(ms) ? Math.floor(ms / 60_000) : null;
}

/** Where each factor's input comes from (api-contracts §11), so its chip comes from the one registry. */
const FACTOR_FIELD: Record<string, [ProvenanceTable, string]> = {
  weather: ["task_history", "weather"],
  skill: ["task_history", "operator_skill"],
  age: ["task_history", "machine_age_years"],
  heat: ["task_history", "temperature_c"],
  weather_heat: ["task_history", "temperature_c"],
  wind: ["task_history", "wind_kmh"],
  circadian: ["task_history", "shift_hour"],
};

export type FactorTag = { kind: "assumed" } | { kind: "simulated" } | { kind: "source"; label: string } | { kind: "none" };

export type FactorRow = {
  key: string;
  group: string;
  value: string;
  /** Signed whole percent against ×1.00: +22 means 22 % longer. */
  pct: number;
  tag: FactorTag;
};

/** "heat:high" → group "heat", value "high"; an unknown shape keeps the whole key as the group. */
export function splitFactorKey(key: string): { group: string; value: string } {
  const i = key.indexOf(":");
  return i < 0 ? { group: key, value: "" } : { group: key.slice(0, i), value: key.slice(i + 1) };
}

/** The merged key for a hot-weather label and a temperature band that are both in the estimate. */
export const WEATHER_HEAT_KEY = "weather_heat:combined";

/** Source line for the merged weather and heat row: the label is the scenario, the temperature is Open-Meteo. */
export const SCENARIO_WEATHER_SOURCE = "Scenario weather + Open-Meteo archive, CC BY 4.0";

/**
 * The ETA model multiplies a `weather:hot|cold` label (the forecast category, e.g. hot +11 %) and a `heat:*` band (the
 * temperature, e.g. extreme +17 %). Both describe a hot day, so listing them apart reads as a double count
 * (judge review #8). When both are present and not clear/normal they are shown as ONE factor whose multiplier
 * is their product, which is exactly what the estimate applies. Other factors pass through unchanged.
 */
export function mergeWeatherHeat(factors: readonly EtaFactor[] | null | undefined): EtaFactor[] {
  const list = [...(factors ?? [])];
  const w = list.find((f) => (f.key === "weather:hot" || f.key === "weather:cold") && f.multiplier !== 1);
  const h = list.find((f) => f.key.startsWith("heat:") && f.multiplier !== 1);
  if (!w || !h) return list;
  const merged: EtaFactor = { key: WEATHER_HEAT_KEY, multiplier: w.multiplier * h.multiplier, assumed: Boolean(w.assumed || h.assumed) };
  return [...list.filter((f) => f !== w && f !== h), merged];
}

/**
 * Rows for "Why this estimate", biggest effect first. Core shows the top two; detail shows all.
 * A factor the model marks `assumed` wins the chip; otherwise the field registry decides.
 */
export function factorRows(factors: readonly EtaFactor[] | null | undefined, opts: { all: boolean }): FactorRow[] {
  const rows = mergeWeatherHeat(factors).map((f): FactorRow => {
    const { group, value } = splitFactorKey(f.key);
    const field = FACTOR_FIELD[group];
    // The hot/cold label is a scenario field the organiser sets; only the temperature band is Open-Meteo data.
    const tag: FactorTag = f.assumed ? { kind: "assumed" } : group === "weather_heat" ? { kind: "source", label: SCENARIO_WEATHER_SOURCE } : field ? provenanceOf(field[0], field[1]) : { kind: "none" };
    return { key: f.key, group, value, pct: Math.round((f.multiplier - 1) * 100), tag };
  });
  rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return opts.all ? rows : rows.filter((r) => r.pct !== 0).slice(0, 2);
}
