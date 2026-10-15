/**
 * The Replay clock (interaction-map §4.5 "Timer behaviour"), as pure functions so the pause rules
 * are tested in node. It measures on the wall clock between an explicit start and stop, so time
 * stops accumulating the moment the run is frozen; it is never derived from the server.
 *
 * Frozen while: the page is hidden (`visibilitychange`), a live Warning/Critical alert has taken
 * over, or the operator has not pressed Resume yet. A live alert must never cost training time.
 */
import type { ReplayPhase } from "@/replay/machine";

export type Stopwatch = {
  budgetMs: number;
  /** Time already spent in earlier running spells. */
  elapsedMs: number;
  /** When the current running spell began, or null while frozen. */
  startedAtMs: number | null;
};

export function createStopwatch(budgetMs: number): Stopwatch {
  return { budgetMs, elapsedMs: 0, startedAtMs: null };
}

/** Start or stop the watch. Calling it again in the same state changes nothing. */
export function runStopwatch(sw: Stopwatch, run: boolean, nowMs: number): Stopwatch {
  if (run === (sw.startedAtMs !== null)) return sw;
  if (run) return { ...sw, startedAtMs: nowMs };
  return { budgetMs: sw.budgetMs, elapsedMs: elapsedOf(sw, nowMs), startedAtMs: null };
}

export function elapsedOf(sw: Stopwatch, nowMs: number): number {
  if (sw.startedAtMs === null) return sw.elapsedMs;
  return sw.elapsedMs + Math.max(0, nowMs - sw.startedAtMs);
}

export function remainingMsOf(sw: Stopwatch, nowMs: number): number {
  return Math.max(0, sw.budgetMs - elapsedOf(sw, nowMs));
}

/** The seconds shown next to the bar: 0 only once the budget is truly gone. */
export function secondsLeftOf(sw: Stopwatch, nowMs: number): number {
  return Math.ceil(remainingMsOf(sw, nowMs) / 1000);
}

/** 1 → full, 0 → empty. Drives the bar's scaleX, which is ink and never a safety colour. */
export function fractionLeftOf(sw: Stopwatch, nowMs: number): number {
  if (sw.budgetMs <= 0) return 0;
  return remainingMsOf(sw, nowMs) / sw.budgetMs;
}

export function isExpired(sw: Stopwatch, nowMs: number): boolean {
  return remainingMsOf(sw, nowMs) <= 0;
}

/**
 * The one rule for whether the clock moves. Only Investigate and the Decide steps are timed; the
 * Brief is untimed (Decision 2), and the Debrief is the operator's to read at their own pace.
 */
export function timerRuns(opts: { phase: ReplayPhase; paused: boolean; hidden: boolean }): boolean {
  if (opts.paused || opts.hidden) return false;
  return opts.phase === "investigate" || opts.phase === "decide";
}

/** From 5 s left the number is announced once a second (`aria-live="polite"`). */
export const ANNOUNCE_FROM_S = 5;

/** One step per second: the bar's CSS transition is linear over --dur-tick, 0 ms in reduced motion. */
export const TIMER_TICK_MS = 1000;

export type TimerSnapshot = {
  secondsLeft: number;
  /** 1 → full, 0 → empty. */
  fraction: number;
  /** False while the page is hidden or the run is frozen; the display holds its last value. */
  running: boolean;
  expired: boolean;
};

/**
 * The countdown as an external store, so React reads a cached snapshot during render and the
 * wall clock is only ever read inside a tick. `useReplayTimer` is a thin wrapper over this; the
 * pause rules live here and are tested without a DOM.
 */
export class ReplayClock {
  private sw: Stopwatch;
  private snap: TimerSnapshot;
  private listeners = new Set<() => void>();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private onExpire: (() => void) | null = null;
  private fired = false;

  constructor(
    budgetMs: number,
    private readonly now: () => number = Date.now,
    private readonly tickMs: number = TIMER_TICK_MS,
  ) {
    this.sw = createStopwatch(budgetMs);
    this.snap = snapshotOf(this.sw, this.now());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): TimerSnapshot => this.snap;

  /** Start or stop the clock. Hidden pages and live alerts both arrive here as `false`. */
  setRunning(run: boolean): void {
    this.sw = runStopwatch(this.sw, run, this.now());
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (run) this.timerId = setInterval(() => this.tick(), this.tickMs);
    this.publish();
  }

  /** A new countdown (the next Decide step, a new attempt), keeping the current running state. */
  reset(budgetMs: number): void {
    const run = this.sw.startedAtMs !== null;
    this.fired = false;
    this.sw = runStopwatch(createStopwatch(budgetMs), run, this.now());
    this.publish();
  }

  setOnExpire(fn: (() => void) | null): void {
    this.onExpire = fn;
  }

  /** One second of the countdown; exposed so tests drive it without real timers. */
  tick(): void {
    this.publish();
    if (this.snap.expired && !this.fired) {
      this.fired = true;
      this.onExpire?.();
    }
  }

  dispose(): void {
    if (this.timerId !== null) clearInterval(this.timerId);
    this.timerId = null;
    this.listeners.clear();
    this.onExpire = null;
  }

  private publish(): void {
    const next = snapshotOf(this.sw, this.now());
    if (sameSnapshot(this.snap, next)) return;
    this.snap = next;
    this.listeners.forEach((l) => l());
  }
}

function snapshotOf(sw: Stopwatch, nowMs: number): TimerSnapshot {
  return {
    secondsLeft: secondsLeftOf(sw, nowMs),
    fraction: fractionLeftOf(sw, nowMs),
    running: sw.startedAtMs !== null,
    expired: isExpired(sw, nowMs),
  };
}

function sameSnapshot(a: TimerSnapshot, b: TimerSnapshot): boolean {
  return a.secondsLeft === b.secondsLeft && a.fraction === b.fraction && a.running === b.running && a.expired === b.expired;
}
