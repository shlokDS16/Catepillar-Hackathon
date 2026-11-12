import { parseDispatch, type InboxAnomaly, type InboxGroups, type InboxItem } from "@/inbox/inbox";

/**
 * Phase 4: split view (desktop) and triage (mobile) rules for the Inbox. Pure, so selection, the
 * keyboard and the triage order are unit-tested; the screen only renders what these return.
 */

const flat = (g: InboxGroups): InboxItem[] => [...g.needsAction, ...g.handled, ...g.resolved, ...g.suppressed];

/** Every selectable id in reading order: needs action, handled, resolved, suppressed. */
export function selectableIds(groups: InboxGroups): string[] {
  return flat(groups).map((i) => i.id);
}

/** Keep a selection valid: an id that is no longer listed falls back to the first row (null when empty). */
export function resolveSelection(ids: readonly string[], current: string | null): string | null {
  if (current !== null && ids.includes(current)) return current;
  return ids[0] ?? null;
}

export type SelectionKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** Up/Down move one row and stop at the ends (no wrap: the end of the list is a real place). */
export function moveSelection(ids: readonly string[], current: string | null, key: SelectionKey): string | null {
  if (ids.length === 0) return null;
  const last = ids.length - 1;
  if (key === "Home") return ids[0]!;
  if (key === "End") return ids[last]!;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return ids[key === "ArrowDown" ? 0 : last]!;
  return ids[Math.min(last, Math.max(0, at + (key === "ArrowDown" ? 1 : -1)))]!;
}

/**
 * Mobile triage: the most urgent open alert is expanded, the rest wait below as compact rows. A tap
 * promotes any row (a handled one too) to the lead; the queue is the open alerts minus the lead.
 */
export function triage(groups: InboxGroups, promotedId: string | null): { lead: InboxItem | null; queued: InboxItem[] } {
  const promoted = promotedId !== null ? flat(groups).find((i) => i.id === promotedId) : undefined;
  const lead = promoted ?? groups.needsAction[0] ?? null;
  return { lead, queued: groups.needsAction.filter((i) => i.id !== lead?.id) };
}

export type SparkPoint = { x: number; y: number };

/** FNV-1a, so the same anomaly always draws the same line. */
function seed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The signal around the event. The fixture stores no telemetry series, so this is a SIMULATED shape
 * (flat noise around the normal value, then a ramp to the detected value) and the screen says so.
 * null when the anomaly carries no value and normal pair.
 */
export function sparkSeries(anomaly: InboxAnomaly, n = 24): { values: number[]; normal: number; value: number } | null {
  const value = anomaly.features.value;
  const normal = anomaly.features.mean;
  if (typeof value !== "number" || typeof normal !== "number") return null;
  let s = seed(anomaly.anomaly_id);
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  const span = Math.max(Math.abs(value - normal), Math.abs(normal) * 0.05, 1);
  const rampFrom = Math.floor(n * 0.6);
  const values = Array.from({ length: n }, (_, i) => {
    if (i === n - 1) return value;
    const ramp = i < rampFrom ? 0 : ((i - rampFrom + 1) / (n - rampFrom)) ** 1.6;
    return normal + (value - normal) * ramp + rand() * span * 0.06;
  });
  return { values, normal, value };
}

/** Map values into a w by h box (y grows downward), with the normal line inside the range. */
export function sparkPoints(values: readonly number[], normal: number, w: number, h: number, pad = 6): { points: SparkPoint[]; normalY: number } {
  const lo = Math.min(normal, ...values);
  const hi = Math.max(normal, ...values);
  const range = hi - lo || 1;
  const y = (v: number) => pad + (h - 2 * pad) * (1 - (v - lo) / range);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return { points: values.map((v, i) => ({ x: i * step, y: y(v) })), normalY: y(normal) };
}

export type TimelineStep =
  | { kind: "raised"; ageMin: number | null }
  | { kind: "dispatch"; channel: string; status: string; dryRun: boolean };

/** "Raised", then every dispatch line in order. A dry run is flagged so the screen never calls it sent. */
export function timelineSteps(item: InboxItem, lines: readonly string[], ageMin: number | null): TimelineStep[] {
  if (item.nonPunitive) return [{ kind: "raised", ageMin: null }];
  const steps: TimelineStep[] = [{ kind: "raised", ageMin }];
  const all = lines.length > 0 ? lines : item.dispatch ? [item.dispatch] : [];
  for (const line of all) {
    const p = parseDispatch(line);
    if (p) steps.push({ kind: "dispatch", channel: p.channel, status: p.status, dryRun: p.status === "dry_run" });
  }
  return steps;
}
