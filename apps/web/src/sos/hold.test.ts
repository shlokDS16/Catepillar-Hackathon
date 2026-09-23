import { describe, expect, it } from "vitest";
import { SOS_HOLD_MS, holdProgress, holdReducer, type HoldState } from "./hold";

function run(events: Parameters<typeof holdReducer>[1][]) {
  let state: HoldState = { phase: "idle" };
  const ticks: number[] = [];
  for (const e of events) {
    const r = holdReducer(state, e);
    state = r.state;
    if (r.tick) ticks.push(e.at);
  }
  return { state, ticks };
}

describe("SOS hold-to-arm (A10)", () => {
  it("release at 1.4 s sends nothing", () => {
    const { state } = run([
      { type: "press", at: 0, requestId: "r1" },
      { type: "tick", at: 1_400 },
      { type: "release", at: 1_400 },
    ]);
    expect(state).toEqual({ phase: "idle" });
  });

  it("arms at 1.5 s with the request_id from the press, after ticks at 0.5 and 1.0 s", () => {
    const { state, ticks } = run([
      { type: "press", at: 0, requestId: "r1" },
      { type: "tick", at: 250 },
      { type: "tick", at: 520 },
      { type: "tick", at: 760 },
      { type: "tick", at: 1_010 },
      { type: "tick", at: SOS_HOLD_MS },
    ]);
    expect(ticks).toEqual([520, 1_010]);
    expect(state).toEqual({ phase: "armed", requestId: "r1" });
  });

  it("one request_id per hold: a second press while holding is ignored, a new hold gets a new id", () => {
    const first = run([
      { type: "press", at: 0, requestId: "r1" },
      { type: "press", at: 100, requestId: "r2" },
      { type: "tick", at: SOS_HOLD_MS },
    ]);
    expect(first.state).toEqual({ phase: "armed", requestId: "r1" });
    const second = run([
      { type: "press", at: 0, requestId: "r1" },
      { type: "release", at: 300 },
      { type: "press", at: 1_000, requestId: "r2" },
      { type: "tick", at: 1_000 + SOS_HOLD_MS },
    ]);
    expect(second.state).toEqual({ phase: "armed", requestId: "r2" });
  });

  it("release after arming does not disarm", () => {
    const { state } = run([
      { type: "press", at: 0, requestId: "r1" },
      { type: "tick", at: SOS_HOLD_MS },
      { type: "release", at: SOS_HOLD_MS + 10 },
    ]);
    expect(state.phase).toBe("armed");
  });

  it("progress is linear, or stepped to quarters under reduced motion", () => {
    const holding: HoldState = { phase: "holding", startedAt: 0, requestId: "r", ticksFired: 0 };
    expect(holdProgress(holding, 750)).toBeCloseTo(0.5);
    expect(holdProgress(holding, 700, true)).toBe(0.25);
    expect(holdProgress({ phase: "armed", requestId: "r" }, 0)).toBe(1);
  });
});
