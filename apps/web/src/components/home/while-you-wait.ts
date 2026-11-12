import type { Task } from "@/data/types";

/** Idle time (sim minutes) before the "While you wait" lesson is offered. */
export const WAIT_MIN_IDLE_MIN = 3;

export type WaitInput = {
  /** Status of the task the hero shows, or null when there is none. */
  taskStatus: Task["status"] | null;
  /** The machine's `moving` flag, or null when it is unknown (treated as moving: never offer on a guess). */
  moving: boolean | null;
  /** Whether an open assignment exists to practise. */
  hasAssignment: boolean;
  /** Sim milliseconds the machine has been still with the task paused or blocked; null when not idle. */
  idleMs: number | null;
};

/**
 * "While you wait" shows only when the task is paused or blocked, the machine is known to be
 * standing still, an assignment exists and the idle spell has lasted at least three sim minutes.
 * It is a pure function of the live state, so it vanishes on the very next render after motion.
 */
export function showWhileYouWait(i: WaitInput): boolean {
  if (i.taskStatus !== "paused" && i.taskStatus !== "blocked_ppe") return false;
  if (i.moving !== false) return false;
  if (!i.hasAssignment) return false;
  return i.idleMs !== null && i.idleMs >= WAIT_MIN_IDLE_MIN * 60_000;
}

/**
 * The idle-spell start (epoch ms): set on the first parked render with a usable clock, kept while parked,
 * cleared the moment the machine moves or the task resumes.
 */
export function nextIdleSince(prev: number | null, parked: boolean, nowMs: number): number | null {
  if (!parked) return null;
  if (prev !== null) return prev;
  return Number.isNaN(nowMs) ? null : nowMs;
}

/** Milliseconds from `since` (epoch ms) to `now` (ISO string), or null when either is unusable. */
export function idleMsSince(since: number | null, now: string | null): number | null {
  if (since === null || now === null) return null;
  const n = Date.parse(now);
  return Number.isNaN(n) ? null : Math.max(0, n - since);
}
