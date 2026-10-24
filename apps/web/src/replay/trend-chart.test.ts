import { describe, expect, it } from "vitest";
import { evidenceCards } from "@cat/shared/fixtures";
import { LANE, flagX, trendLanes, trendSpan, trendWindowS, type TrendCard, type TrendSeries } from "./trend-chart";

const card = evidenceCards.telemetry_trend as TrendCard;
const series = card.series;

/** Every number a path string contains, so a test can assert nothing is NaN or off-box. */
function numbersIn(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe("the shared time axis", () => {
  it("spans the earliest and latest reading across every series", () => {
    expect(trendSpan(series)).toEqual({ t0: 0, t1: 60_000 });
  });

  it("reports the window in whole seconds", () => {
    expect(trendWindowS(series)).toBe(60);
  });

  it("is a zero span when there are no readings at all", () => {
    expect(trendSpan([])).toEqual({ t0: 0, t1: 0 });
    expect(trendWindowS([])).toBe(0);
  });
});

describe("the event flag", () => {
  it("stands at the end of the window, where the breach is", () => {
    expect(flagX(series)).toBeCloseTo(LANE.w - LANE.padX, 5);
  });

  it("follows an explicit event time when one is given", () => {
    expect(flagX(series, 30_000)).toBeCloseTo((LANE.padX + (LANE.w - LANE.padX)) / 2, 5);
  });

  it("clamps an event outside the window instead of drawing off-box", () => {
    expect(flagX(series, -5_000)).toBeCloseTo(LANE.padX, 5);
    expect(flagX(series, 99_000)).toBeCloseTo(LANE.w - LANE.padX, 5);
  });

  it("centres the flag when every reading is at the same instant", () => {
    const one: TrendSeries = [{ metric: "speed_kmh", points: [{ t_ms: 500, v: 3 }] }];
    expect(flagX(one)).toBeCloseTo(LANE.w / 2, 5);
  });
});

describe("lanes", () => {
  const lanes = trendLanes(series);

  it("draws one lane per series, keeping the metric and its order", () => {
    expect(lanes.map((l) => l.metric)).toEqual(series.map((s) => s.metric));
  });

  it("draws a line from the left edge to the right edge", () => {
    const path = lanes[0].path ?? "";
    expect(path.startsWith(`M${LANE.padX}`)).toBe(true);
    const xs = numbersIn(path).filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeCloseTo(LANE.w - LANE.padX, 1);
  });

  it("keeps every coordinate inside the lane box", () => {
    for (const lane of lanes) {
      const nums = numbersIn(lane.path ?? "M0 0");
      expect(nums.every((v) => Number.isFinite(v))).toBe(true);
      expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...nums)).toBeLessThanOrEqual(LANE.w);
    }
  });

  it("scales each metric to its own values, because km/h and degrees share no axis", () => {
    expect(lanes[0]).toMatchObject({ min: 0, max: 6.2, last: 6.2 });
    expect(lanes[1]).toMatchObject({ min: 3, max: 17.4, last: 17.4 });
  });

  it("draws seatbelt as a 0/1 step band on a fixed domain", () => {
    const belt = trendLanes([{ metric: "seatbelt", points: [{ t_ms: 0, v: 1 }, { t_ms: 30_000, v: 0 }, { t_ms: 60_000, v: 0 }] }])[0];
    expect(belt.kind).toBe("step");
    expect(belt).toMatchObject({ min: 0, max: 1, last: 0 });
    // A step holds its value, then drops: two commands per reading after the first.
    expect((belt.path ?? "").match(/L/g)).toHaveLength(4);
  });

  it("draws the other metrics as plain lines", () => {
    expect(lanes.every((l) => l.kind === "line")).toBe(true);
    expect((lanes[0].path ?? "").match(/L/g)).toHaveLength(1);
  });

  it("puts a flat series in the middle of its lane instead of dividing by zero", () => {
    const flat = trendLanes([{ metric: "rpm", points: [{ t_ms: 0, v: 900 }, { t_ms: 1_000, v: 900 }] }])[0];
    expect(flat).toMatchObject({ min: 899, max: 901 });
    const ys = numbersIn(flat.path ?? "").filter((_, i) => i % 2 === 1);
    expect(ys.every((y) => Math.abs(y - LANE.h / 2) < 0.6)).toBe(true);
  });

  it("draws a single reading as a dot and no line", () => {
    const one = trendLanes([{ metric: "pitch_deg", points: [{ t_ms: 0, v: 4 }] }])[0];
    expect(one.path).toBeNull();
    expect(one.dot).not.toBeNull();
    expect(one.empty).toBe(false);
  });

  it("marks a series with no readings empty rather than drawing nothing silently", () => {
    const none = trendLanes([{ metric: "hydraulic_temp_c", points: [] }])[0];
    expect(none).toMatchObject({ path: null, dot: null, last: null, empty: true });
  });
});
