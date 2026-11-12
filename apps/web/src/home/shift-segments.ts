import type { AlertRecord, Assignment, Task, Weather } from "@/data/types";

/** What the shift tape reads: slices of the client state. Times are ISO strings; `now` is the sim clock. */
export type ShiftInput = {
  tasks: readonly Task[];
  /** Working time per task from the reducer (closed intervals summed, plus the one running now). */
  taskWork: Readonly<Record<string, { workedMs: number; runningSince: string | null }>>;
  alerts: readonly AlertRecord[];
  assignments: readonly Assignment[];
  eventTimes: Readonly<Record<string, string>>;
  weather: Weather | null;
};

export type SegmentKind = "working" | "waiting" | "break" | "planned";
export type ShiftSegment = { kind: SegmentKind; startMs: number; endMs: number; taskId: string | null };
export type ShiftMark = {
  id: string;
  kind: "breach" | "heat";
  atMs: number;
  /** Route that opens the real Replay for a breach with an assignment; null otherwise. */
  href: string | null;
};
export type ShiftTape = {
  startMs: number;
  endMs: number;
  /** Now, floored to the sim minute so the now-line moves once a minute and never tweens. */
  nowMs: number;
  segments: ShiftSegment[];
  marks: ShiftMark[];
  hours: number[];
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const SHIFT_MS = 8 * HOUR;
/** Tape edges snap to the half hour, so ticks land on the task times in any time zone with a 30 minute offset. */
const GRID = 30 * MIN;
/** A gap between two tasks at least this long is drawn as a break. */
export const BREAK_MIN_MS = 20 * MIN;
const DEFAULT_PLANNED_MS = 30 * MIN;

const ms = (iso: string) => Date.parse(iso);

/**
 * Segments and marks for the operator's shift, derived from tasks and events only (no stored timeline):
 *  - Working: an in-progress task from when it last started to now; a task paused or blocked shows
 *    its worked time as Working from its planned start, then Waiting up to now.
 *  - Planned: a future task from its planned start for its p50 estimate; the unfinished part of a task
 *    running now continues as Planned for its remaining p50.
 *  - Break: a gap of 20 min or more between the end of one task and the start of the next.
 * Marks: one breach mark per replay assignment (linked to Replay), and one heat-peak mark from
 * `weather.forecast_peak_at` (a scenario forecast).
 */
export function buildShiftSegments(input: ShiftInput, nowIso: string): ShiftTape {
  const nowMs = Math.floor(ms(nowIso) / MIN) * MIN;

  const tasks = [...input.tasks].filter((t) => t.status !== "cancelled").sort((a, b) => ms(a.planned_start) - ms(b.planned_start));
  const starts = tasks.map((t) => ms(t.planned_start));
  const startMs = Math.floor(Math.min(...starts, nowMs) / GRID) * GRID;
  const heatMs = input.weather?.forecast_peak_at ? ms(input.weather.forecast_peak_at) : null;
  const endMs = Math.max(startMs + SHIFT_MS, Math.ceil(Math.max(nowMs, heatMs ?? 0) / GRID) * GRID + HOUR);

  const segments: ShiftSegment[] = [];
  const push = (kind: SegmentKind, a: number, b: number, taskId: string | null) => {
    const s = Math.max(startMs, a);
    const e = Math.min(endMs, b);
    if (e > s) segments.push({ kind, startMs: s, endMs: e, taskId });
  };

  let cursor: number | null = null; // end of the last drawn task
  tasks.forEach((task, i) => {
    const planned = starts[i] ?? nowMs;
    const p50 = task.eta_p50_min != null ? task.eta_p50_min * MIN : DEFAULT_PLANNED_MS;
    if (cursor != null && planned - cursor >= BREAK_MIN_MS) push("break", cursor, planned, null);
    const work = input.taskWork[task.id];
    let end = planned;

    if (task.status === "planned" && planned >= nowMs) {
      push("planned", planned, planned + p50, task.id);
      end = planned + p50;
    } else if (task.status === "in_progress") {
      const from = work?.runningSince ? ms(work.runningSince) : planned;
      const before = work ? Math.min(work.workedMs, Math.max(0, from - planned)) : 0;
      if (before > 0) push("working", planned, planned + before, task.id);
      if (from > planned + before) push("waiting", planned + before, from, task.id);
      push("working", Math.max(from, planned), nowMs, task.id);
      const left = Math.max(0, p50 * (1 - Math.min(100, task.progress_pct) / 100));
      if (left > 0) push("planned", nowMs, nowMs + left, task.id);
      end = nowMs + left;
    } else if (task.status === "paused" || task.status === "blocked_ppe") {
      const worked = Math.min(work?.workedMs ?? 0, Math.max(0, nowMs - planned));
      if (worked > 0) push("working", planned, planned + worked, task.id);
      push("waiting", planned + worked, nowMs, task.id);
      end = nowMs;
    } else if (task.status === "completed") {
      end = Math.min(nowMs, planned + p50);
      push("working", planned, end, task.id);
    } else {
      // planned but already late: it is waiting
      push("waiting", planned, nowMs, task.id);
      end = nowMs;
    }
    cursor = Math.max(cursor ?? 0, end);
  });

  const marks: ShiftMark[] = [];
  const breachAlert = input.alerts.find((a) => a.kind === "seatbelt_off_moving");
  for (const a of input.assignments) {
    if (!a.replay_id) continue;
    const at = (a.because_event_id ? input.eventTimes[a.because_event_id] : undefined) ?? breachAlert?.first_seen;
    if (!at) continue;
    marks.push({ id: `breach:${a.id}`, kind: "breach", atMs: ms(at), href: `/op/training/replay/${a.replay_id}` });
  }
  if (marks.length === 0 && breachAlert) marks.push({ id: `breach:${breachAlert.alert_id}`, kind: "breach", atMs: ms(breachAlert.first_seen), href: null });
  if (heatMs != null) marks.push({ id: "heat", kind: "heat", atMs: heatMs, href: null });
  marks.sort((a, b) => a.atMs - b.atMs);

  const hours: number[] = [];
  for (let h = startMs; h <= endMs; h += HOUR) hours.push(h);

  return { startMs, endMs, nowMs, segments, marks, hours };
}

/** Position on the tape, 0 to 100 percent, clamped. */
export function tapePct(tape: Pick<ShiftTape, "startMs" | "endMs">, atMs: number): number {
  const p = ((atMs - tape.startMs) / (tape.endMs - tape.startMs)) * 100;
  return Math.min(100, Math.max(0, p));
}
