import { describe, expect, it } from "vitest";
import { replayDebrief, replayScenario } from "@cat/shared/fixtures";
import type { ReplayDebriefResult, ReplayScenario } from "@cat/shared";
import { demoReplayScenario } from "./fixture-recording";
import { reviewRows, traceRows } from "./debrief";
import {
  advance,
  buildReenactModel,
  clockLabel,
  countValue,
  playbackLengthMs,
  scrubKey,
  stateAt,
  timeFromPointer,
  type ReenactModel,
} from "./reenact";

// A hand-made model: the machine drives due east for 10 s then due north for 10 s.
const M: ReenactModel = {
  durationMs: 30000,
  trail: [
    { t_ms: 0, lat: 21.0, lon: 79.0 },
    { t_ms: 10000, lat: 21.0, lon: 79.001 },
    { t_ms: 20000, lat: 21.001, lon: 79.001 },
  ],
  track: [
    { t_ms: 0, lat: 21.0, lon: 79.0, speed_kmh: 0, pitch_deg: 0 },
    { t_ms: 10000, lat: 21.0, lon: 79.001, speed_kmh: 10, pitch_deg: 10 },
    { t_ms: 20000, lat: 21.001, lon: 79.001, speed_kmh: 4, pitch_deg: 16 },
  ],
  wind: [
    { t_ms: 0, from_deg: 350, kmh: 10 },
    { t_ms: 20000, from_deg: 10, kmh: 20 },
  ],
  belt: [
    { t_ms: 0, on: true },
    { t_ms: 15000, on: false },
  ],
  beltDefault: "unknown",
  eventMs: 20000,
  eventExact: false,
  responseMs: 28000,
  responseClamped: false,
};

describe("stateAt", () => {
  it("at the start: nothing drawn beyond the first fix, nothing passed", () => {
    const s = stateAt(M, 0);
    expect(s.t).toBe(0);
    expect(s.fraction).toBe(0);
    expect(s.trail).toEqual([{ lat: 21.0, lon: 79.0 }]);
    expect(s.machine).toMatchObject({ lat: 21.0, lon: 79.0 });
    expect(s.speed_kmh).toBe(0);
    expect(s.seatbelt).toBe("on");
    expect(s.flagPassed).toBe(false);
    expect(s.responsePassed).toBe(false);
  });

  it("mid-way between samples interpolates position, speed, pitch and wind", () => {
    const s = stateAt(M, 5000);
    expect(s.machine?.lon).toBeCloseTo(79.0005, 6);
    expect(s.speed_kmh).toBeCloseTo(5, 6);
    expect(s.pitch_deg).toBeCloseTo(5, 6);
    // the trail ends at the interpolated head, not at the last whole sample
    expect(s.trail).toHaveLength(2);
    expect(s.trail[1].lon).toBeCloseTo(79.0005, 6);
    expect(s.operator).toEqual(s.trail[1]);
    expect(s.wind?.kmh).toBeCloseTo(12.5, 6);
  });

  it("wind direction turns the short way round 350 -> 10", () => {
    const w = stateAt(M, 10000).wind!;
    expect(w.from_deg === 0 || Math.abs(w.from_deg) < 1e-9 || Math.abs(w.from_deg - 360) < 1e-9).toBe(true);
  });

  it("heading follows the segment being travelled: east, then north", () => {
    expect(stateAt(M, 5000).machine?.heading_deg).toBeCloseTo(90, 0);
    expect(stateAt(M, 15000).machine?.heading_deg).toBeCloseTo(0, 0);
  });

  it("holds the last position and heading past the last fix, and the seatbelt follows its step", () => {
    const end = stateAt(M, 30000);
    expect(end.fraction).toBe(1);
    expect(end.machine?.lat).toBeCloseTo(21.001, 6);
    expect(end.machine?.heading_deg).toBeCloseTo(0, 0);
    expect(end.seatbelt).toBe("off");
    expect(stateAt(M, 14999).seatbelt).toBe("on");
    expect(stateAt(M, 15000).seatbelt).toBe("off");
  });

  it("the flag and the stopwatch pass exactly at their times", () => {
    expect(stateAt(M, 19999).flagPassed).toBe(false);
    expect(stateAt(M, 20000).flagPassed).toBe(true);
    expect(stateAt(M, 27999).responsePassed).toBe(false);
    expect(stateAt(M, 28000).responsePassed).toBe(true);
  });

  it("clamps a time outside the timeline and survives NaN", () => {
    expect(stateAt(M, -50).t).toBe(0);
    expect(stateAt(M, 999999).t).toBe(30000);
    expect(stateAt(M, Number.NaN).t).toBe(0);
  });

  it("reaches the final frame with the whole trail drawn", () => {
    const s = stateAt(M, M.durationMs);
    expect(s.trail).toHaveLength(3);
    expect(s.machineTrail).toHaveLength(3);
  });

  it("never reports a response marker when the recording has none", () => {
    expect(stateAt({ ...M, responseMs: null }, 30000).responsePassed).toBe(false);
  });
});

describe("buildReenactModel on the fixture (sparse data)", () => {
  const model = buildReenactModel(replayScenario as ReplayScenario);

  it("puts the flag at event_ms and the stopwatch real_response_ms after it", () => {
    expect(model.durationMs).toBe(120000);
    expect(model.eventExact).toBe(true);
    expect(model.eventMs).toBe(52000);
    expect(model.responseMs).toBe(60400);
  });

  it("falls back to the last recorded fix when event_ms is absent", () => {
    const s = replayScenario as ReplayScenario;
    const old = buildReenactModel({ ...s, reenactment: { ...s.reenactment, event_ms: undefined } });
    expect(old.eventExact).toBe(false);
    expect(old.eventMs).toBe(60000);
    expect(old.responseMs).toBe(68400);
  });

  it("clamps an event_ms past the end onto the timeline", () => {
    const s = replayScenario as ReplayScenario;
    const clamped = buildReenactModel({ ...s, reenactment: { ...s.reenactment, event_ms: 999999 } });
    expect(clamped.eventMs).toBe(120000);
    expect(clamped.eventExact).toBe(false);
  });

  it("does not back-fill the first real belt reading to earlier times", () => {
    const s = replayScenario as ReplayScenario;
    const track = [
      { t_ms: 0, lat: 21.1, lon: 79.1, speed_kmh: 1, pitch_deg: 0, seatbelt_fastened: null },
      { t_ms: 20000, lat: 21.1, lon: 79.1, speed_kmh: 1, pitch_deg: 0, seatbelt_fastened: false },
    ];
    const m = buildReenactModel({ ...s, reenactment: { ...s.reenactment, machine_track: track } });
    expect(stateAt(m, 5000).seatbelt).toBe("unknown");
    expect(stateAt(m, 20000).seatbelt).toBe("off");
  });

  it("reads the belt from the track: step function, null entries hold the last reading", () => {
    const s = replayScenario as ReplayScenario;
    const track = [
      { t_ms: 0, lat: 21.1, lon: 79.1, speed_kmh: 1, pitch_deg: 0, seatbelt_fastened: true },
      { t_ms: 10000, lat: 21.1, lon: 79.1, speed_kmh: 1, pitch_deg: 0, seatbelt_fastened: null },
      { t_ms: 20000, lat: 21.1, lon: 79.1, speed_kmh: 1, pitch_deg: 0, seatbelt_fastened: false },
    ];
    const m = buildReenactModel({ ...s, reenactment: { ...s.reenactment, machine_track: track } });
    expect(stateAt(m, 5000).seatbelt).toBe("on");
    expect(stateAt(m, 15000).seatbelt).toBe("on");
    expect(stateAt(m, 20000).seatbelt).toBe("off");
  });

  it("a track with only null belt readings stays unknown", () => {
    const s = replayScenario as ReplayScenario;
    const track = [{ t_ms: 0, lat: 21.1, lon: 79.1, speed_kmh: 1, pitch_deg: 0, seatbelt_fastened: null }];
    const m = buildReenactModel({ ...s, reenactment: { ...s.reenactment, machine_track: track } });
    expect(stateAt(m, 0).seatbelt).toBe("unknown");
  });

  it("works with a one-sample track: the machine stays, heading is north, the trail still draws", () => {
    const mid = stateAt(model, 30000);
    expect(mid.machine).toMatchObject({ lat: 21.1463, lon: 79.0882, heading_deg: 0 });
    expect(mid.speed_kmh).toBeCloseTo(6.2);
    expect(mid.trail).toHaveLength(2);
    expect(mid.wind).toEqual({ from_deg: 250, kmh: 12 });
    expect(mid.seatbelt).toBe("off");
  });

  it("clamps the stopwatch to the end when the response falls past it", () => {
    const s = replayScenario as ReplayScenario;
    const late = { ...s, reenactment: { ...s.reenactment, duration_ms: 60000, real_response_ms: 999999 } };
    expect(buildReenactModel(late).responseMs).toBe(60000);
    expect(buildReenactModel(late).responseClamped).toBe(true);
    expect(model.responseClamped).toBe(false);
  });

  it("never invents a seatbelt reading: unknown without a series, exact with one", () => {
    const s = replayScenario as ReplayScenario;
    const bare = buildReenactModel({ ...s, reenactment: { ...s.reenactment, machine_track: [{ t_ms: 0, lat: 21.1, lon: 79.1, speed_kmh: 1, pitch_deg: 0 }] } });
    expect(stateAt(bare, 0).seatbelt).toBe("unknown");
    expect(stateAt(M, 0).seatbelt).toBe("on");
  });

  it("survives an empty recording and a zero duration", () => {
    const s = replayScenario as ReplayScenario;
    const empty = {
      ...s,
      reenactment: { duration_ms: 0, trail: [], machine_track: [], wind: [], real_response_ms: null },
    };
    const st = stateAt(buildReenactModel(empty), 0);
    expect(st.machine).toBeNull();
    expect(st.trail).toEqual([]);
    expect(st.wind).toBeNull();
    expect(Number.isFinite(st.fraction)).toBe(true);
    expect(stateAt({ ...M, durationMs: 0 }, 5).t).toBe(0);
  });
});

describe("playback helpers", () => {
  it("plays at 10x: 120 s of sim time takes 12 s", () => {
    expect(playbackLengthMs(120000)).toBe(12000);
    expect(advance(0, 1000, 120000)).toEqual({ t: 10000, ended: false });
  });

  it("stops on the final frame instead of looping", () => {
    expect(advance(119000, 1000, 120000)).toEqual({ t: 120000, ended: true });
    expect(advance(120000, 16, 120000)).toEqual({ t: 120000, ended: true });
  });

  it("never runs backwards on a negative frame gap", () => {
    expect(advance(5000, -20, 120000).t).toBe(5000);
  });

  it("scrubber keys: arrows +-1 s, Home and End, clamped; other keys are not ours", () => {
    expect(scrubKey("ArrowRight", 5000, 30000)).toBe(6000);
    expect(scrubKey("ArrowLeft", 500, 30000)).toBe(0);
    expect(scrubKey("Home", 5000, 30000)).toBe(0);
    expect(scrubKey("End", 5000, 30000)).toBe(30000);
    expect(scrubKey("End", 5000, 30000)).toBe(30000);
    expect(scrubKey("a", 5000, 30000)).toBeNull();
  });

  it("maps a pointer to time and labels the clock", () => {
    expect(timeFromPointer(150, 100, 200, 30000)).toBe(7500);
    expect(timeFromPointer(-10, 100, 200, 30000)).toBe(0);
    expect(timeFromPointer(10, 100, 0, 30000)).toBe(0);
    expect(clockLabel(65000)).toBe("1:05");
  });

  it("the count-up is monotone, exact at the end and instant for a zero duration", () => {
    expect(countValue(80, 0, 1200)).toBe(0);
    expect(countValue(80, 600, 1200)).toBeGreaterThan(40);
    expect(countValue(80, 1200, 1200)).toBe(80);
    expect(countValue(80, 10, 0)).toBe(80);
  });
});

describe("Debrief view-models", () => {
  const result = replayDebrief as ReplayDebriefResult;
  const scenario = replayScenario as ReplayScenario;

  it("marks opened relevant, opened irrelevant and missed relevant cards", () => {
    const rows = traceRows({
      ...result,
      process_trace: {
        ...result.process_trace,
        opened: ["c_trend", "c_weather"],
        ideal: ["c_trend", "c_map"],
      },
    });
    expect(rows.you.map((c) => [c.id, c.kind])).toEqual([
      ["c_trend", "relevant"],
      ["c_weather", "irrelevant"],
      ["c_map", "missed"],
    ]);
    expect(rows.ideal.map((c) => c.id)).toEqual(["c_trend", "c_map"]);
    expect(rows.you[0].why?.en).toBe("Pitch crossed 15°.");
  });

  it("an opened card with no server entry counts as relevant when it is on the ideal path", () => {
    const rows = traceRows(result);
    expect(rows.you.find((c) => c.id === "c_card")?.kind).toBe("relevant");
    expect(rows.you.find((c) => c.id === "c_map")?.kind).toBe("missed");
  });

  it("keeps a timed-out step (chosen: []) as an unanswered row with the safer answer", () => {
    const rows = reviewRows(result, scenario);
    expect(rows[0]).toMatchObject({ step: 1, answered: true, correct: true });
    expect(rows[0].chosen[0].en).toBe("Stop the machine");
    expect(rows[1]).toMatchObject({ step: 2, answered: false, correct: false, chosen: [] });
    expect(rows[1].best[0].en).toBe("Fasten the seatbelt");
    expect(rows[1].prompt?.en).toBe("Then?");
  });

  it("an order step is correct only in the same sequence", () => {
    const r = { ...result, review: [{ step: 3, chosen: ["b", "a", "c"], best: ["a", "b", "c"], why: { en: "x" } }] };
    expect(reviewRows(r, scenario)[0]).toMatchObject({ kind: "order", correct: false, answered: true });
  });
});

describe("the fixture re-enactment readouts change with time", () => {
  const model = buildReenactModel(demoReplayScenario);
  it("speed, pitch, seatbelt and wind differ between two times", () => {
    const early = stateAt(model, 5000);
    const late = stateAt(model, 60000);
    expect(early.speed_kmh).not.toBe(late.speed_kmh);
    expect(early.pitch_deg).not.toBe(late.pitch_deg);
    expect(early.seatbelt).toBe("on");
    expect(late.seatbelt).toBe("off");
    expect(early.wind?.kmh).not.toBe(late.wind?.kmh);
  });
  it("the belt is on before the flag moment and off by it", () => {
    expect(stateAt(model, 20000).seatbelt).toBe("on");
    expect(stateAt(model, model.eventMs).seatbelt).toBe("off");
  });
});
