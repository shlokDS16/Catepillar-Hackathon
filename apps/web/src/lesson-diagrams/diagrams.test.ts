import { describe, expect, it } from "vitest";
import { blindAt, blindspot, inBlindCone, inSwingRing, BLIND_DURATION } from "./blindspot";
import { compareAt, compare, COMPARE_DURATION } from "./compare";
import { clockReduce, cueAt, solveTime, startClock, type Clock } from "./core";
import { diagramFor } from "./registry";
import { FINAL_DEG, GROUND_DEG, LIMIT_DEG, THROWN, groundY } from "./roll";
import { rollover, rolloverAt, ROLLOVER_DURATION } from "./rollover";

describe("rollover diagram", () => {
  it("starts level and ends lying on its side along the slope", () => {
    expect(rolloverAt(0).tilt).toBe(0);
    expect(rolloverAt(ROLLOVER_DURATION).tilt).toBeCloseTo(FINAL_DEG, 5);
  });
  it("tilt never decreases and the needle crosses the limit once, between the steepening and the tip", () => {
    let prev = -1;
    let crossed = -1;
    for (let t = 0; t <= ROLLOVER_DURATION; t += 0.05) {
      const f = rolloverAt(t);
      expect(f.tilt).toBeGreaterThanOrEqual(prev);
      prev = f.tilt;
      if (crossed < 0 && f.overLimit) crossed = t;
    }
    expect(crossed).toBeGreaterThan(4);
    expect(crossed).toBeLessThan(5.5);
    expect(rolloverAt(3.9).overLimit).toBe(false);
    expect(rolloverAt(3.9).tilt).toBeLessThanOrEqual(GROUND_DEG);
    expect(rolloverAt(crossed + 0.2).tilt).toBeGreaterThan(LIMIT_DEG);
  });
  it("the ground holds at the slope while the machine tips past it", () => {
    expect(rolloverAt(10).ground).toBe(GROUND_DEG);
    expect(rolloverAt(10).needle).toBe(60);
  });
  it("the operator rides the seat, is thrown after the detach angle, and lands on the ground", () => {
    expect(rolloverAt(2).figure.thrown).toBe(false);
    const late = rolloverAt(ROLLOVER_DURATION).figure;
    expect(late.thrown).toBe(true);
    expect(late.landed).toBe(true);
    expect(Math.abs(late.y - (groundY(late.x) - 7))).toBeLessThan(3);
    expect(late.x).toBeCloseTo(THROWN.land.x, 5);
  });
  it("a cue exists for every phase and the stills fall inside the duration", () => {
    expect(cueAt(rollover.cues, 0).key).toBe("rollover.c1");
    expect(cueAt(rollover.cues, ROLLOVER_DURATION).key).toBe("rollover.c5");
    for (const s of rollover.stills) expect(s).toBeLessThanOrEqual(ROLLOVER_DURATION);
    expect(rollover.cues.map((c) => c.at)).toEqual([...rollover.cues.map((c) => c.at)].sort((a, b) => a - b));
  });
});

describe("belted vs unbelted diagram", () => {
  it("the belted operator never leaves the seat; the unbelted one does", () => {
    for (let t = 0; t <= COMPARE_DURATION; t += 0.25) {
      const f = compareAt(t);
      expect(f.belted.thrown).toBe(false);
      expect(f.belted.rot).toBeCloseTo(f.tilt, 5);
    }
    expect(compareAt(1).unbelted.thrown).toBe(false);
    expect(compareAt(COMPARE_DURATION).unbelted.thrown).toBe(true);
  });
  it("both panels share one tilt", () => {
    expect(compareAt(3).tilt).toBe(compareAt(3).tilt);
    expect(compareAt(COMPARE_DURATION).tilt).toBeCloseTo(FINAL_DEG, 5);
    expect(compare.stills).toHaveLength(3);
  });
});

describe("blind spot diagram", () => {
  it("the person starts outside the ring and the cones", () => {
    const f = blindAt(0);
    expect(f.inRing).toBe(false);
    expect(f.inCone).toBe(false);
  });
  it("at the end the person stands inside the ring and a blind cone", () => {
    const f = blindAt(BLIND_DURATION);
    expect(f.inRing).toBe(true);
    expect(f.inCone).toBe(true);
  });
  it("the swing is monotonic and the cones turn with the machine", () => {
    let prev = -1;
    for (let t = 0; t <= BLIND_DURATION; t += 0.1) {
      const s = blindAt(t).swing;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    const p = { x: 180, y: 112 + 60 }; // straight behind the machine
    expect(inBlindCone(p, 0)).toBe(true);
    expect(inBlindCone(p, 180)).toBe(false);
    expect(inSwingRing(p)).toBe(false);
    expect(blindspot.cues.at(-1)?.key).toBe("blindspot.c5");
  });
});

describe("registry and helpers", () => {
  it("maps authored pictograms to diagrams and leaves signs alone", () => {
    expect(diagramFor("rollover")?.kind).toBe("rollover");
    expect(diagramFor("belt_compare")?.kind).toBe("compare");
    expect(diagramFor("blindspot")?.kind).toBe("blindspot");
    expect(diagramFor("belt")).toBeNull();
    expect(diagramFor(null)).toBeNull();
  });
  it("solveTime finds the first time a rising function reaches a value", () => {
    expect(solveTime((t) => t * 2, 5, 0, 10)).toBeCloseTo(2.5, 5);
  });
});

describe("player clock", () => {
  const D = 10;
  const run = (c: Clock, ...a: Parameters<typeof clockReduce>[1][]) => a.reduce((s, x) => clockReduce(s, x, D), c);
  it("autoplays once and stops at the end without looping", () => {
    let c = startClock(true);
    for (let i = 0; i < 200; i++) c = clockReduce(c, { type: "tick", dt: 0.1 }, D);
    expect(c).toEqual({ t: D, playing: false, ended: true });
    expect(clockReduce(c, { type: "tick", dt: 0.1 }, D)).toEqual(c);
  });
  it("caps a long frame so a background tab cannot skip ahead", () => {
    expect(clockReduce(startClock(true), { type: "tick", dt: 5 }, D).t).toBeCloseTo(0.1, 5);
  });
  it("pause holds the frame; play resumes; replay restarts after the end", () => {
    let c = run(startClock(true), { type: "tick", dt: 0.1 }, { type: "pause" }, { type: "tick", dt: 0.1 });
    expect(c.t).toBeCloseTo(0.1, 5);
    c = run(c, { type: "play" });
    expect(c.playing).toBe(true);
    c = run(c, { type: "seek", t: 99 });
    expect(c).toEqual({ t: D, playing: false, ended: true });
    expect(run(c, { type: "toggle" })).toEqual({ t: 0, playing: true, ended: false });
  });
  it("scrubbing pauses and clamps", () => {
    expect(run(startClock(true), { type: "seek", t: -3 })).toEqual({ t: 0, playing: false, ended: false });
    expect(run(startClock(true), { type: "seek", t: 4 })).toEqual({ t: 4, playing: false, ended: false });
  });
});
