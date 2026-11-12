import { describe, expect, it } from "vitest";
import { S2, S4, shiftClock } from "../shift";
import { ARRIVE, LEAVE, cameraState } from "./camera-path";
import { RING_R, ringLevel, truckDistance } from "./route";

/* The stage 4 truck route and the camera path are pure, so the beats in shift.ts are checked here without WebGL. */

const STEP = 0.0005;
const grid = (a: number, b: number) => {
  const out: number[] = [];
  for (let p = a; p <= b + 1e-9; p += STEP) out.push(Math.min(1, p));
  return out;
};
/** First p in [a, b] where `test` flips from false to true, scanning in steps of STEP. */
const firstWhere = (a: number, b: number, test: (p: number) => boolean) => grid(a, b).find(test);
/** Last p where `test` is still true over a scan of [a, b]. */
const lastWhere = (a: number, b: number, test: (p: number) => boolean) => [...grid(a, b)].reverse().find(test);

describe("stage 4 truck route (spec 8.1 A3)", () => {
  it("is at 12 m from the machine at the warning beat, within 0.5 m", () => {
    expect(Math.abs(truckDistance(S4.warnAt) - RING_R[2])).toBeLessThan(0.5);
  });

  it("first enters ring 3 at S4.warnAt, within 0.02", () => {
    const p = firstWhere(0, 1, (q) => ringLevel(truckDistance(q)) >= 3);
    expect(p).toBeDefined();
    expect(Math.abs((p as number) - S4.warnAt)).toBeLessThanOrEqual(0.02);
  });

  it("enters caution (ring 2) about 0.30", () => {
    const p = firstWhere(0, 1, (q) => ringLevel(truckDistance(q)) >= 2);
    expect(Math.abs((p as number) - 0.3)).toBeLessThanOrEqual(0.03);
  });

  it("reaches S4.closestM within 0.3 m and holds it through the closest window", () => {
    const window = grid(S4.closest[0], S4.closest[1]);
    const min = Math.min(...window.map(truckDistance));
    expect(Math.abs(min - S4.closestM)).toBeLessThanOrEqual(0.3);
    // It dwells at the closest point before it backs out (it is moving again well before S4.caution).
    for (const p of grid(S4.closest[0], S4.closest[0] + 0.1)) expect(Math.abs(truckDistance(p) - S4.closestM)).toBeLessThanOrEqual(0.3);
  });

  it("never enters ring 4", () => {
    const min = Math.min(...grid(0, 1).map(truckDistance));
    expect(min).toBeGreaterThan(RING_R[3]);
    expect(Math.max(...grid(0, 1).map((p) => ringLevel(truckDistance(p))))).toBe(3);
  });

  it("backs out to caution at S4.caution and is clear of ring 2 at S4.clear, within 0.02", () => {
    const warnUntil = lastWhere(0, 1, (p) => ringLevel(truckDistance(p)) >= 3) as number;
    expect(Math.abs(warnUntil - S4.caution)).toBeLessThanOrEqual(0.02);
    const cautionUntil = lastWhere(0, 1, (p) => ringLevel(truckDistance(p)) >= 2) as number;
    expect(Math.abs(cautionUntil - S4.clear)).toBeLessThanOrEqual(0.02);
  });

  it("closes in monotonically while approaching", () => {
    let prev = Infinity;
    for (const p of grid(S4.truckIn[0], S4.truckIn[1])) {
      const d = truckDistance(p);
      expect(d).toBeLessThanOrEqual(prev + 1e-6);
      prev = d;
    }
  });
});

describe("camera path (spec 8.1 A1)", () => {
  const at = (s: number, p: number) => {
    const ps = [0, 0, 0, 0, 0];
    for (let i = 0; i < s; i++) ps[i] = 1;
    ps[s] = p;
    return cameraState(ps);
  };

  it("holds each shot through the middle 60 % of its band", () => {
    for (const s of [1, 2, 3, 4]) {
      const ref = at(s, 0.5).t;
      expect(ref).toBeCloseTo((s + 1) / 5, 9);
      for (let p = ARRIVE; p <= LEAVE + 1e-9; p += 0.01) expect(at(s, p).t).toBeCloseTo(ref, 9);
    }
  });

  it("is continuous across every band boundary", () => {
    for (const s of [0, 1, 2, 3]) {
      const end = at(s, 1);
      const ps = [0, 0, 0, 0, 0];
      for (let i = 0; i <= s; i++) ps[i] = 1;
      ps[s + 1] = 1e-6;
      const next = cameraState(ps);
      expect(Math.abs(end.t - next.t)).toBeLessThan(1e-4);
      expect(Math.abs(end.orbit - next.orbit)).toBeLessThan(1e-4);
    }
  });

  it("never runs backwards along the path while scrolling down", () => {
    let prev = 0;
    for (let g = 0; g <= 5; g += 0.005) {
      const s = Math.min(4, Math.floor(g));
      const ps = [0, 0, 0, 0, 0].map((_, i) => (i < s ? 1 : i === s ? g - s : 0));
      const t = cameraState(ps).t;
      expect(t).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = t;
    }
  });
});

describe("tape beats against the scene (spec 12.4)", () => {
  it("the shift clock is 10:44 at the warning beat of stage 4 ... within the stage 4 range", () => {
    const { minutes } = shiftClock([1, 1, 1, S4.warnAt, 0]);
    expect(Math.abs(minutes - 644)).toBeLessThan(5);
  });

  it("the seatbelt window of stage 2 is inside the band", () => {
    expect(S2.seatbeltOff[0]).toBeGreaterThan(ARRIVE - 1e-9);
    expect(S2.seatbeltOff[1]).toBeLessThan(LEAVE + 1e-9);
  });
});
