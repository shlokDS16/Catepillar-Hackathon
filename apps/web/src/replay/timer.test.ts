import { describe, expect, it } from "vitest";
import {
  createStopwatch,
  elapsedOf,
  fractionLeftOf,
  isExpired,
  ReplayClock,
  runStopwatch,
  secondsLeftOf,
  timerRuns,
} from "./timer";
import { heldDestination, isReplayRoute, REPLAY_ROUTE } from "./leave-guard";
import type { ReplayPhase } from "./machine";

const T0 = 1_000_000;

describe("stopwatch", () => {
  it("counts nothing until it is started", () => {
    const sw = createStopwatch(60_000);
    expect(elapsedOf(sw, T0 + 10_000)).toBe(0);
    expect(secondsLeftOf(sw, T0 + 10_000)).toBe(60);
    expect(fractionLeftOf(sw, T0 + 10_000)).toBe(1);
  });
  it("counts wall-clock time while running", () => {
    const sw = runStopwatch(createStopwatch(60_000), true, T0);
    expect(secondsLeftOf(sw, T0 + 1_500)).toBe(59);
    expect(fractionLeftOf(sw, T0 + 30_000)).toBeCloseTo(0.5);
  });
  it("starting and stopping twice in the same state changes nothing", () => {
    const started = runStopwatch(createStopwatch(60_000), true, T0);
    expect(runStopwatch(started, true, T0 + 5_000)).toBe(started);
    const stopped = runStopwatch(started, false, T0 + 5_000);
    expect(runStopwatch(stopped, false, T0 + 9_000)).toBe(stopped);
  });
  it("freezes while stopped and resumes where it stopped", () => {
    let sw = runStopwatch(createStopwatch(60_000), true, T0);
    sw = runStopwatch(sw, false, T0 + 10_000); // hidden or a live alert
    expect(secondsLeftOf(sw, T0 + 10_000)).toBe(50);
    expect(secondsLeftOf(sw, T0 + 40_000)).toBe(50); // 30 s pass and cost nothing
    sw = runStopwatch(sw, true, T0 + 40_000); // explicit Resume
    expect(secondsLeftOf(sw, T0 + 45_000)).toBe(45);
  });
  it("clamps at zero and reports expiry", () => {
    const sw = runStopwatch(createStopwatch(15_000), true, T0);
    expect(isExpired(sw, T0 + 14_999)).toBe(false);
    expect(isExpired(sw, T0 + 15_000)).toBe(true);
    expect(secondsLeftOf(sw, T0 + 20_000)).toBe(0);
    expect(fractionLeftOf(sw, T0 + 20_000)).toBe(0);
    expect(fractionLeftOf(createStopwatch(0), T0)).toBe(0);
  });
});

describe("timerRuns", () => {
  const phases: ReplayPhase[] = ["loading", "load_failed", "brief", "investigate", "decide", "submitting", "debrief"];
  it("times Investigate and Decide only — the Brief is untimed (Decision 2)", () => {
    const timed = phases.filter((phase) => timerRuns({ phase, paused: false, hidden: false }));
    expect(timed).toEqual(["investigate", "decide"]);
  });
  it("stops when the document is hidden", () => {
    expect(timerRuns({ phase: "investigate", paused: false, hidden: true })).toBe(false);
    expect(timerRuns({ phase: "decide", paused: false, hidden: true })).toBe(false);
  });
  it("stops while a live alert has frozen the run", () => {
    expect(timerRuns({ phase: "investigate", paused: true, hidden: false })).toBe(false);
    expect(timerRuns({ phase: "decide", paused: true, hidden: false })).toBe(false);
    expect(timerRuns({ phase: "decide", paused: true, hidden: true })).toBe(false);
  });
});

describe("ReplayClock", () => {
  /** A clock on a hand-driven wall clock, with no real interval. */
  function clockAt(budgetMs: number) {
    let now = T0;
    const clock = new ReplayClock(budgetMs, () => now, 1_000);
    return { clock, at: (ms: number) => { now = T0 + ms; } };
  }

  it("holds the full budget until it is started", () => {
    const { clock, at } = clockAt(60_000);
    at(20_000);
    clock.tick();
    expect(clock.getSnapshot()).toEqual({ secondsLeft: 60, fraction: 1, running: false, expired: false });
  });

  it("counts down and tells its subscribers", () => {
    const { clock, at } = clockAt(60_000);
    let notified = 0;
    clock.subscribe(() => {
      notified += 1;
    });
    clock.setRunning(true);
    at(10_000);
    clock.tick();
    expect(clock.getSnapshot().secondsLeft).toBe(50);
    expect(notified).toBeGreaterThan(0);
    const before = clock.getSnapshot();
    clock.tick(); // the same second: the snapshot is reused, so React does not re-render
    expect(clock.getSnapshot()).toBe(before);
    clock.dispose();
  });

  it("freezes while hidden or paused and resumes where it stopped", () => {
    const { clock, at } = clockAt(60_000);
    clock.setRunning(true);
    at(10_000);
    clock.setRunning(false); // the page was hidden, or a live alert took over
    at(70_000); // a whole minute passes outside the practice
    clock.tick();
    expect(clock.getSnapshot().secondsLeft).toBe(50);
    expect(clock.getSnapshot().running).toBe(false);
    clock.setRunning(true); // explicit Resume
    at(75_000);
    clock.tick();
    expect(clock.getSnapshot().secondsLeft).toBe(45);
    clock.dispose();
  });

  it("fires onExpire once at zero", () => {
    const { clock, at } = clockAt(15_000);
    let expired = 0;
    clock.setOnExpire(() => {
      expired += 1;
    });
    clock.setRunning(true);
    at(14_000);
    clock.tick();
    expect(expired).toBe(0);
    at(15_000);
    clock.tick();
    at(16_000);
    clock.tick();
    expect(expired).toBe(1);
    expect(clock.getSnapshot()).toMatchObject({ secondsLeft: 0, expired: true });
    clock.dispose();
  });

  it("reset starts the next step's countdown and keeps running", () => {
    const { clock, at } = clockAt(15_000);
    clock.setRunning(true);
    at(10_000);
    clock.tick();
    expect(clock.getSnapshot().secondsLeft).toBe(5);
    clock.reset(20_000); // the next Decide step
    expect(clock.getSnapshot()).toMatchObject({ secondsLeft: 20, running: true, expired: false });
    at(14_000);
    clock.tick();
    expect(clock.getSnapshot().secondsLeft).toBe(16);
    clock.dispose();
  });

  it("stops ticking and drops its listeners when disposed", () => {
    const { clock, at } = clockAt(15_000);
    let notified = 0;
    clock.subscribe(() => {
      notified += 1;
    });
    clock.setRunning(true);
    clock.dispose();
    const afterDispose = notified;
    at(10_000);
    clock.tick();
    expect(notified).toBe(afterDispose);
  });
});

describe("leave guard", () => {
  it("knows the replay route, where Ask is hidden", () => {
    expect(isReplayRoute(`${REPLAY_ROUTE}/11111111-1111-1111-1111-111111111111`)).toBe(true);
    expect(isReplayRoute(REPLAY_ROUTE)).toBe(true);
    expect(isReplayRoute("/op/training")).toBe(false);
    expect(isReplayRoute("/op/training/lesson/seatbelt_slopes")).toBe(false);
    expect(isReplayRoute(null)).toBe(false);
  });
  it("holds a navigation away from the replay and lets everything else through", () => {
    const here = `${REPLAY_ROUTE}/r1`;
    const origin = "https://spotter.example";
    expect(heldDestination(new URL(`${origin}/op/training`), origin, here)).toBe("/op/training");
    expect(heldDestination(new URL(`${origin}/op/safety?from=rail`), origin, here)).toBe("/op/safety?from=rail");
    expect(heldDestination(new URL(`${origin}${here}#main`), origin, here)).toBeNull();
    expect(heldDestination(new URL("https://other.example/op"), origin, here)).toBeNull();
  });
});
