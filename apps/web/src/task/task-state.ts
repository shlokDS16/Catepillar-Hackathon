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
  | { kind: "restored" }
  | { kind: "override"; validUntil: string; missing: readonly string[] }
  | { kind: "expired"; missing: readonly string[] };

export type PpeInput = {
  taskId: string;
  status: Task["status"];
  /** Items still missing, from `ppe.missing` events. */
  missing: readonly string[];
  override: PpeOverrideRecord | null;
  nowMs: number;
  /** task_start answered `override_expired` although the local clock still says the override is live. */
  serverExpired?: boolean;
};

/** The three paths (restored / override / expired) plus the block itself. PPE is re-checked on every Start and Resume (UI-12). */
export function derivePpe(i: PpeInput): PpeView {
  // Only a task that is about to run is gated; a working or finished one is not.
  const gated = i.status === "planned" || i.status === "paused" || i.status === "blocked_ppe";
  if (!gated) return { kind: "clear" };
  const o = i.override && i.override.taskId === i.taskId ? i.override : null;
  if (o) {
    const live = Date.parse(o.validUntil) > i.nowMs && !i.serverExpired;
    if (live) return { kind: "override", validUntil: o.validUntil, missing: o.missing };
    return { kind: "expired", missing: i.missing.length > 0 ? i.missing : o.missing };
  }
  if (i.missing.length > 0) return { kind: "blocked", missing: i.missing };
  if (i.status === "blocked_ppe") return { kind: "restored" };
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

/** Whole minutes from the first start to the sim clock; null when the start was not seen. */
export function elapsedMin(startedAt: string | undefined, nowMs: number): number | null {
  if (!startedAt) return null;
  const ms = nowMs - Date.parse(startedAt);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60_000)) : null;
}

/** Where each factor's input comes from (api-contracts §11), so its chip comes from the one registry. */
const FACTOR_FIELD: Record<string, [ProvenanceTable, string]> = {
  weather: ["task_history", "weather"],
  skill: ["task_history", "operator_skill"],
  age: ["task_history", "machine_age_years"],
  heat: ["task_history", "temperature_c"],
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

/**
 * Rows for "Why this estimate", biggest effect first. Core shows the top two; detail shows all.
 * A factor the model marks `assumed` wins the chip; otherwise the field registry decides.
 */
export function factorRows(factors: readonly EtaFactor[] | null | undefined, opts: { all: boolean }): FactorRow[] {
  const rows = (factors ?? []).map((f): FactorRow => {
    const { group, value } = splitFactorKey(f.key);
    const field = FACTOR_FIELD[group];
    const tag: FactorTag = f.assumed ? { kind: "assumed" } : field ? provenanceOf(field[0], field[1]) : { kind: "none" };
    return { key: f.key, group, value, pct: Math.round((f.multiplier - 1) * 100), tag };
  });
  rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return opts.all ? rows : rows.filter((r) => r.pct !== 0).slice(0, 2);
}
