import { describe, expect, it } from "vitest";
import {
  ageParts,
  buildMapModel,
  eventsFromAlerts,
  headingOf,
  LIVE_SNAP_MS,
  mapStateAt,
  pathUpTo,
  positionAt,
  provenanceAt,
  resolveCursor,
  STALE_MS,
  stepEvent,
  toCursor,
  WINDOW_MS,
  type Fix,
  type MapEvent,
} from "./map-state";
import type { SiteMapData } from "./site-map";
import type { AlertRecord } from "@/data/types";

const END = 1_000_000_000;
const ME = { lat: 21.1463, lon: 79.0882 };
// ~111 m per 0.001 deg lat
const data: SiteMapData = {
  center: ME,
  zones: [],
  trail: [
    { lat: 21.1453, lon: 79.0882 },
    { lat: 21.1458, lon: 79.0882 },
    ME,
  ],
  machines: [
    // 55 m north of me, parked, fault, 8 s old
    { id: "m-fault", code: "EXC-014", lat: 21.1468, lon: 79.0882, moving: false, health: "fault", track: [{ ago_ms: 500_000, lat: 21.1468, lon: 79.0882 }, { ago_ms: 8_000, lat: 21.1468, lon: 79.0882 }] },
    // moving east, healthy, far
    { id: "m-dump", code: "DMP-003", lat: 21.1463, lon: 79.0952, moving: true, health: "ok", track: [{ ago_ms: 500_000, lat: 21.1463, lon: 79.0932 }, { ago_ms: 4_000, lat: 21.1463, lon: 79.0952 }] },
    // last heard 95 s ago
    { id: "m-old", code: "EXC-011", lat: 21.1455, lon: 79.0894, moving: false, health: "ok", track: [{ ago_ms: 590_000, lat: 21.1455, lon: 79.0894 }, { ago_ms: 95_000, lat: 21.1455, lon: 79.0894 }] },
  ],
};
const model = (over: Partial<Parameters<typeof buildMapModel>[0]> = {}) =>
  buildMapModel({ data, me: ME, ownCode: "EXC-007", anchorMs: END, freshMs: END, endMs: END, assumed: true, events: [], pins: [], hazardCodes: [], ...over });

describe("positionAt / pathUpTo / headingOf", () => {
  const fixes: Fix[] = [
    { t_ms: 0, lat: 0, lon: 0 },
    { t_ms: 1000, lat: 0.001, lon: 0 },
    { t_ms: 2000, lat: 0.001, lon: 0.001 },
  ];
  it("is null before the first fix, interpolates inside, holds the last after", () => {
    expect(positionAt(fixes, -1)).toBeNull();
    expect(positionAt(fixes, 500)?.lat).toBeCloseTo(0.0005);
    expect(positionAt(fixes, 9999)).toMatchObject({ lat: 0.001, lon: 0.001, index: 2 });
  });
  it("draws a trail only up to the cursor, ending at the interpolated head", () => {
    expect(pathUpTo(fixes, -1)).toEqual([]);
    expect(pathUpTo(fixes, 0)).toHaveLength(1);
    const mid = pathUpTo(fixes, 1500);
    expect(mid).toHaveLength(3);
    expect(mid[2].lon).toBeCloseTo(0.0005);
  });
  it("heading is the last visible segment, north then east", () => {
    expect(headingOf(pathUpTo(fixes, 900))).toBeCloseTo(0, 0);
    expect(headingOf(pathUpTo(fixes, 1900))).toBeCloseTo(90, 0);
    expect(headingOf([{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }])).toBeNull();
  });
});

describe("mapStateAt", () => {
  it("at the live edge pins the cursor, lists own machine first and hazards before others", () => {
    const s = mapStateAt(model(), END);
    expect(s.atLive).toBe(true);
    expect(s.fraction).toBe(1);
    expect(s.machines.map((m) => [m.code, m.tier])).toEqual([
      ["EXC-007", "own"],
      ["EXC-014", "hazard"],
      ["EXC-011", "other"], // nearer than the dumper
      ["DMP-003", "other"],
    ]);
  });

  it("gives the moving machine a heading and the parked one none", () => {
    const s = mapStateAt(model(), END);
    const dump = s.machines.find((m) => m.code === "DMP-003");
    expect(dump?.moving).toBe(true);
    expect(dump?.heading_deg).toBeCloseTo(90, 0);
    expect(s.machines.find((m) => m.code === "EXC-014")?.heading_deg).toBeNull();
    expect(s.me?.heading_deg).toBeCloseTo(0, 0); // the trail runs north
  });

  it("allows a safety colour only for a live, fresh hazard", () => {
    const live = mapStateAt(model(), END);
    expect(live.machines.find((m) => m.code === "EXC-014")?.danger).toBe(true);
    expect(live.rings?.live).toBe(true);
    const past = mapStateAt(model(), END - 120_000);
    expect(past.atLive).toBe(false);
    expect(past.machines.find((m) => m.code === "EXC-014")?.danger).toBe(false);
    expect(past.rings?.live).toBe(false);
  });

  it("marks a machine stale after 60 s and never gives it danger", () => {
    const s = mapStateAt(model({ hazardCodes: ["EXC-011"] }), END);
    const old = s.machines.find((m) => m.code === "EXC-011");
    expect(old?.ageMs).toBe(95_000);
    expect(old?.ageMs).toBeGreaterThan(STALE_MS);
    expect(old?.stale).toBe(true);
    expect(old?.tier).toBe("hazard");
    expect(old?.danger).toBe(false);
  });

  it("labels provenance: simulated at the live edge, replayed in the past, live only for real data", () => {
    expect(provenanceAt(true, true)).toBe("simulated");
    expect(provenanceAt(true, false)).toBe("live");
    expect(provenanceAt(false, false)).toBe("replayed");
    expect(mapStateAt(model(), END).machines.every((m) => m.provenance === "simulated")).toBe(true);
    const past = mapStateAt(model(), END - 300_000);
    expect(past.machines.every((m) => m.provenance === "replayed")).toBe(true);
    // Off Live the positions are still made up: Replayed does not drop Simulated.
    expect(past.machines.every((m) => m.assumed)).toBe(true);
  });

  it("draws trails up to the cursor only", () => {
    const early = mapStateAt(model(), END - WINDOW_MS + 40_000);
    const late = mapStateAt(model(), END);
    expect(early.me!.trail.length).toBeLessThan(late.me!.trail.length);
    expect(late.me!.trail.length).toBe(3);
  });

  it("hides a machine before its first fix, and an empty track is never drawn", () => {
    const m = model({ anchorMs: END, freshMs: END });
    const early = mapStateAt(m, END - 595_000);
    expect(early.machines.find((x) => x.code === "DMP-003")).toBeUndefined(); // first fix at -500 s... after this cursor
    const empty = { ...m, actors: [...m.actors, { id: "x", code: "NONE", own: false, health: "ok" as const, track: [] }] };
    expect(mapStateAt(empty, END).machines.some((x) => x.code === "NONE")).toBe(false);
  });

  it("keeps a heading near north continuous through 350 to 10 degrees", () => {
    const west = { lat: 0, lon: 0 };
    const nne = { lat: 0.001, lon: 0.0001 }; // about 6 degrees
    const nnw = { lat: 0.002, lon: 0.0000 }; // back to about 354
    expect(headingOf([west, nne])).toBeGreaterThanOrEqual(0);
    expect(headingOf([west, nne])).toBeLessThan(10);
    expect(headingOf([nne, nnw])).toBeGreaterThan(350);
  });

  it("clamps a cursor outside the window", () => {
    const m = model({ anchorMs: END - 100_000 });
    expect(mapStateAt(m, END - WINDOW_MS - 5000).t).toBe(END - WINDOW_MS);
    expect(mapStateAt(m, END + 5000).t).toBe(END);
  });

  it("has no own machine or rings for a viewer without a position (FM)", () => {
    const s = mapStateAt(model({ me: null, ownCode: null }), END);
    expect(s.me).toBeNull();
    expect(s.rings).toBeNull();
    expect(s.machines.some((x) => x.tier === "own")).toBe(false);
    expect(s.machines.every((x) => x.distanceM === null)).toBe(true);
  });

  it("measures distance from me and treats a machine inside the warning ring as a hazard", () => {
    const near = { ...data, machines: [{ id: "near", code: "LDR-001", lat: 21.1466, lon: 79.0882, moving: false, health: "ok" as const }] };
    const s = mapStateAt(buildMapModel({ data: near, me: ME, ownCode: "EXC-007", anchorMs: END, freshMs: END, endMs: END, assumed: true, events: [], pins: [], hazardCodes: [] }), END);
    const m = s.machines.find((x) => x.code === "LDR-001");
    expect(m?.distanceM).toBeGreaterThan(25);
    expect(m?.distanceM).toBeLessThan(40);
    expect(m?.tier).toBe("hazard");
  });

  it("reveals events and anomaly pins only once the cursor reaches them", () => {
    const events: MapEvent[] = [
      { id: "e1", t_ms: END - 400_000, kind: "guardian_hazard", tier: "warning", machineCode: "EXC-014", anomalyId: "a1" },
      { id: "e2", t_ms: END - 100_000, kind: "idle_excess", tier: "caution", machineCode: null, anomalyId: null },
    ];
    const m = model({ events, pins: [{ id: "a1", lat: 21.1468, lon: 79.0882 }] });
    expect(mapStateAt(m, END - 500_000).past).toHaveLength(0);
    expect(mapStateAt(m, END - 500_000).pins).toHaveLength(0);
    const mid = mapStateAt(m, END - 300_000);
    expect(mid.past.map((e) => e.id)).toEqual(["e1"]);
    expect(mid.latest?.id).toBe("e1");
    expect(mid.pins).toHaveLength(1);
    expect(mapStateAt(m, END).past).toHaveLength(2);
  });
});

describe("cursor helpers", () => {
  const span = { startMs: END - WINDOW_MS, endMs: END };
  it("pins to the live edge by default and snaps near it", () => {
    expect(resolveCursor(null, span)).toBe(END);
    expect(toCursor(END - LIVE_SNAP_MS + 1, END)).toBeNull();
    expect(toCursor(END - 10_000, END)).toBe(END - 10_000);
    expect(resolveCursor(END - WINDOW_MS - 1, span)).toBe(END - WINDOW_MS);
  });
  it("steps between events strictly, so repeat presses advance", () => {
    const ev = (id: string, t: number): MapEvent => ({ id, t_ms: t, kind: "idle_excess", tier: "caution", machineCode: null, anomalyId: null });
    const list = [ev("b", 200_000), ev("a", 100_000), ev("c", 300_000)];
    expect(stepEvent(list, 100_000, 1)?.id).toBe("b");
    expect(stepEvent(list, 200_000, -1)?.id).toBe("a");
    expect(stepEvent(list, 300_000, 1)).toBeNull();
    expect(stepEvent(list, 100_000, -1)).toBeNull();
  });
  it("splits an age into parts for translation", () => {
    expect(ageParts(1000)).toEqual({ kind: "now" });
    expect(ageParts(12_400)).toEqual({ kind: "s", n: 12 });
    expect(ageParts(185_000)).toEqual({ kind: "min", n: 3 });
  });
});

describe("demo timeline", () => {
  it("shows the event tick for a wall-clock alert even when the snapshot clock is a simulated day", () => {
    // The snapshot's operator.ts is a simulated 2026-09-24; alerts raised after mount carry the wall clock.
    const wallNow = END;
    const alert = { alert_id: "g", kind: "guardian_hazard", tier: "warning", needs_ack: true, escalate_at: null, occurrences: 1, protocol_card_id: null, upgraded_from: null, status: "open", first_seen: new Date(wallNow - 90_000).toISOString() } as AlertRecord;
    const events = eventsFromAlerts([alert], { an1: { anomaly_id: "an1", machine_code: "EXC-014" } }, { g: "an1" }, wallNow - WINDOW_MS, wallNow);
    expect(events).toHaveLength(1);
    const s = mapStateAt(model({ events }), END);
    expect(s.past.map((e) => e.id)).toEqual(["g"]);
  });
});

describe("keyboard and drift", () => {
  const span = { startMs: END - WINDOW_MS, endMs: END };
  it("one 1 s arrow step from Live leaves Live", () => {
    expect(toCursor(END - 1000, END)).toBe(END - 1000);
    expect(resolveCursor(toCursor(END - 1000, END), span)).toBe(END - 1000);
    expect(LIVE_SNAP_MS).toBeLessThan(1000);
  });
  it("old fixes do not move when only the latest frame advances; the newest fix does, so staleness is live", () => {
    const a = model({ anchorMs: END, freshMs: END });
    const b = model({ anchorMs: END, freshMs: END + 5000, endMs: END + 5000 });
    const own = (m: ReturnType<typeof model>) => m.actors.find((x) => x.own)!.track;
    expect(own(a)[0].t_ms).toBe(own(b)[0].t_ms);
    expect(own(b)[own(b).length - 1].t_ms).toBe(END + 5000);
    expect(mapStateAt(b, END + 5000).me?.ageMs).toBe(0);
  });
});

describe("eventsFromAlerts", () => {
  const alert = (id: string, kind: AlertRecord["kind"], first_seen: string): AlertRecord =>
    ({ alert_id: id, kind, tier: "warning", needs_ack: false, escalate_at: null, occurrences: 1, protocol_card_id: null, upgraded_from: null, status: "open", first_seen }) as AlertRecord;
  it("keeps map-relevant alerts inside the window and joins a Guardian hazard to its machine", () => {
    const end = Date.parse("2026-09-24T09:50:00.000+05:30");
    const out = eventsFromAlerts(
      [alert("g", "guardian_hazard", "2026-09-24T09:47:00.000+05:30"), alert("s", "sos", "2026-09-24T09:48:00.000+05:30"), alert("old", "idle_excess", "2026-09-24T09:10:00.000+05:30")],
      { an1: { anomaly_id: "an1", machine_code: "EXC-014" } },
      { g: "an1" },
      end - WINDOW_MS,
      end,
    );
    expect(out.map((e) => e.id)).toEqual(["g"]);
    expect(out[0].machineCode).toBe("EXC-014");
  });
});
