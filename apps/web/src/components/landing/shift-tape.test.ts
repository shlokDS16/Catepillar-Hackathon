import { describe, expect, it } from "vitest";
import { liveValues, nearestAt, ringAt, roText, settledValues, type RoMsgs } from "./readout";
import { ENTRIES } from "./shift";
import { fill, fmtClock, lineIndexAt, tapeFromScroll, tapeState, type TapeMsgs } from "./shift-tape";

const msgs: TapeMsgs = {
  lines: { open: "Open.", move: "Move.", dig: "Dig.", belt: "Belt.", beltOn: "On.", noSignal: "No signal. {n} held.", signalBack: "Back. {n} sent.", load: "Load.", idle: "Idle {m}.", overspeed: "Fast.", truck: "Truck.", proximity: "Prox.", backOut: "Out.", replay: "Replay.", slope: "Slope.", belt2: "Belt 2.", closed: "Closed." },
  entry: "Entry {n}",
  replay: "Replay",
  clock: "Clock",
};
const ro: RoMsgs = {
  metres: "{n} m", held: "held {n}", sent: "sent {n}", online: "Online", written: "Written {n}", pending: "Not yet", none: "None", truck: "Truck", tonnesFmt: "{n} t", pctFmt: "{n} %",
  phases: { dig: "Dig", swing: "Swing", dump: "Dump", return: "Return", travel: "Travel" },
  states: { clear: "Clear", caution: "Caution", warning: "Warning", critical: "Critical" },
};

describe("shift tape", () => {
  it("formats minutes as HH:MM and fills params", () => {
    expect(fmtClock(644)).toBe("10:44");
    expect(fmtClock(360)).toBe("06:00");
    expect(fill("a {n} b {m}", { n: 2, m: 11 })).toBe("a 2 b 11");
  });

  it("stamps each entry exactly when the clock passes its time", () => {
    expect(tapeState(643, false, msgs).stamped).toEqual([1, 2, 3]);
    expect(tapeState(644, false, msgs).stamped).toEqual([1, 2, 3, 4]);
    expect(tapeState(644, false, msgs).current).toBe(4);
    expect(tapeState(840, false, msgs).stamped).toHaveLength(ENTRIES.length);
  });

  it("shows the proximity sentence with entry 4 at 10:44", () => {
    const s = tapeState(644, false, msgs);
    expect(s.sentence).toBe("Prox.");
    expect(s.kicker).toBe("10:44 · ENTRY 4");
    expect(lineIndexAt(359)).toBe(0);
  });

  it("runs the clock backwards through replay (stage 5, p < .55) and keeps entries 5 and 6 unstamped", () => {
    const early = tapeFromScroll([1, 1, 1, 1, 0.01], msgs);
    expect(early.replay).toBe(true);
    expect(early.sentence).toBe("Replay.");
    const mid = tapeFromScroll([1, 1, 1, 1, 0.3], msgs);
    expect(mid.replay).toBe(true);
    expect(mid.stamped).toEqual([1, 2, 3, 4]);
    const end = tapeFromScroll([1, 1, 1, 1, 1], msgs);
    expect(end.replay).toBe(false);
    expect(end.time).toBe("14:00");
    expect(end.sentence).toBe("Closed.");
  });

  it("is 10:44 with entry 4 stamped at stage 4, p .45", () => {
    const s = tapeFromScroll([1, 1, 1, 0.45, 0], msgs);
    expect(s.stamped).toContain(4);
    expect(s.time >= "10:30" && s.time <= "10:50").toBe(true);
  });
});

describe("readouts", () => {
  it("shows WARNING at stage 4 p .45, with the truck near 12 m and the ledger row written", () => {
    const v = settledValues(4, 0.45);
    expect(v.ring).toBe(3);
    expect(Math.abs((v.nearest ?? 0) - 12)).toBeLessThan(0.5);
    expect(v.written).toBe(true);
    expect(roText(v, ro).state).toBe("Warning");
  });

  it("walks the ring states clear, caution, warning, caution, clear and never reaches critical", () => {
    const rings = [0.05, 0.2, 0.4, 0.5, 0.7, 0.85, 0.95].map(ringAt);
    expect(rings).toEqual([0, 1, 2, 3, 3, 2, 1]);
    expect(Math.max(...[...Array(101).keys()].map((i) => ringAt(i / 100)))).toBe(3);
  });

  it("keeps the closest approach at 7.4 m and hides the truck before it enters", () => {
    expect(nearestAt(0.05)).toBeNull();
    expect(nearestAt(0.7)).toBeCloseTo(7.4, 5);
  });

  it("counts cycles and tonnes from the trail (14 and 620 at the end)", () => {
    expect(settledValues(3, 0.15)).toMatchObject({ cycles: 2, tonnes: 109 });
    expect(settledValues(3, 0.4)).toMatchObject({ cycles: 7, tonnes: 292 });
    expect(settledValues(3, 1)).toMatchObject({ cycles: 14, tonnes: 620 });
  });

  it("reads the link row from the S2 beats", () => {
    expect(roText(settledValues(2, 0.3), ro).link).toBe("Online");
    expect(roText(settledValues(2, 0.7), ro).link).toBe("held 2");
    expect(roText(settledValues(2, 0.9), ro).link).toBe("sent 2");
  });

  it("prefers the scene's live figures and tolerates their absence", () => {
    const live = { boomDeg: 41.4, stickDeg: 50, bucketDeg: 10, phase: "swing" as const, cycles: 5, trail: 0.5, nearestM: 9.9, ring: 3 as const, replay: false };
    expect(liveValues(2, 0.5, live).boom).toBe(41.4);
    expect(liveValues(4, 0.5, live).nearest).toBe(9.9);
    expect(liveValues(4, 0.5, undefined).nearest).not.toBe(9.9);
  });
});
