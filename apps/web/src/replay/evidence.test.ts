import { describe, expect, it } from "vitest";
import { evidenceCards, replayScenario } from "@cat/shared/fixtures";
import type { EvidenceCard, ReplayScenario } from "@cat/shared";
import {
  canDecideNow,
  flagPoint,
  limitReached,
  orderStamp,
  planCentroid,
  plateState,
  severityWord,
  snapshotPoints,
  windArrowDeg,
  type EvidenceType,
  type MapSnapshotCard,
} from "./evidence";

const scenario = replayScenario as ReplayScenario;
const cards = scenario.investigate.cards;
const ids = cards.map((c) => c.id);
const snapshot = evidenceCards.map_snapshot as MapSnapshotCard;

describe("the evidence grid covers the contract", () => {
  const TYPES: EvidenceType[] = ["telemetry_trend", "wind", "map_snapshot", "fault_code", "protocol_card", "weather", "shift_hours"];

  it("has one fixture card per type, so every renderer is exercised", () => {
    expect(new Set(cards.map((c: EvidenceCard) => c.type))).toEqual(new Set(TYPES));
  });

  it("holds 3 to 7 cards with unique ids", () => {
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(7);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("order stamps (D10: the order is scored)", () => {
  it("stamps nothing before a card is opened", () => {
    expect(orderStamp([], ids[0])).toBeNull();
  });

  it("stamps 1, 2, 3 in the order the operator opened them", () => {
    const opened = [ids[2], ids[0], ids[5]];
    expect(orderStamp(opened, ids[2])).toBe(1);
    expect(orderStamp(opened, ids[0])).toBe(2);
    expect(orderStamp(opened, ids[5])).toBe(3);
  });

  it("gives an unopened card no stamp while others carry one", () => {
    expect(orderStamp([ids[0], ids[1]], ids[3])).toBeNull();
  });

  it("keeps the first stamp when a card is re-opened (T3: re-opening is free)", () => {
    // The machine never appends a duplicate, so the stamp of the first open is what the grid reads.
    expect(orderStamp([ids[1], ids[0]], ids[1])).toBe(1);
  });
});

describe("max_open is a hard limit (UI-20)", () => {
  it("never locks when max_open is null", () => {
    expect(limitReached(ids, null)).toBe(false);
    expect(plateState(ids.slice(0, 6), null, ids[6])).toBe("available");
  });

  it("locks the unopened plates once the limit is reached", () => {
    const opened = ids.slice(0, 4);
    expect(limitReached(opened, 4)).toBe(true);
    expect(plateState(opened, 4, ids[4])).toBe("locked");
  });

  it("leaves an already-opened plate open at the limit", () => {
    const opened = ids.slice(0, 4);
    expect(plateState(opened, 4, opened[0])).toBe("opened");
  });

  it("still allows the last card one below the limit", () => {
    expect(limitReached(ids.slice(0, 3), 4)).toBe(false);
    expect(plateState(ids.slice(0, 3), 4, ids[4])).toBe("available");
  });

  it("treats max_open 0 as everything locked", () => {
    expect(plateState([], 0, ids[0])).toBe("locked");
  });
});

describe("Decide now", () => {
  it("is disabled until one card is opened (T4)", () => {
    expect(canDecideNow([])).toBe(false);
    expect(canDecideNow([ids[0]])).toBe(true);
  });
});

describe("wind arrow", () => {
  it("points the way the air travels, opposite the from-bearing", () => {
    expect(windArrowDeg(250)).toBe(70);
    expect(windArrowDeg(0)).toBe(180);
  });

  it("stays inside 0-360 for bearings past the wrap", () => {
    expect(windArrowDeg(350)).toBe(170);
    expect(windArrowDeg(-10)).toBe(170);
  });
});

describe("fault severity words", () => {
  it("maps the words we have ink for", () => {
    expect(severityWord("caution")).toBe("caution");
    expect(severityWord("CRITICAL")).toBe("critical");
    expect(severityWord("no signal")).toBe("nosignal");
    expect(severityWord("info")).toBe("clear");
  });

  it("returns null for an unknown severity, so the raw value is shown as sent", () => {
    expect(severityWord("sev-3")).toBeNull();
    expect(severityWord("")).toBeNull();
  });

  it("recognises the fixture's own severity", () => {
    expect(severityWord(evidenceCards.fault_code.codes[0].severity)).toBe("caution");
  });
});

describe("map snapshot geometry", () => {
  it("puts the flag on the machine's last recorded position", () => {
    const last = snapshot.machine_track.at(-1);
    expect(flagPoint(snapshot)).toEqual({ lat: last?.lat, lon: last?.lon });
  });

  it("falls back to the trail, then to the centre", () => {
    const noTrack = { ...snapshot, machine_track: [] };
    expect(flagPoint(noTrack).lat).toBe(snapshot.trail[0].lat);
    expect(flagPoint({ ...noTrack, trail: [] })).toEqual(snapshot.center);
  });

  it("collects every point the viewBox has to cover", () => {
    const pts = snapshotPoints(snapshot);
    const zonePoints = snapshot.zones.reduce((a, z) => a + z.polygon.length, 0);
    expect(pts).toHaveLength(zonePoints + snapshot.trail.length + snapshot.machine_track.length + 1);
    expect(pts.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))).toBe(true);
  });

  it("writes a zone name at the mean of its corners", () => {
    const c = planCentroid(snapshot.zones[0].polygon, snapshot.center);
    expect(c).not.toBeNull();
    expect(Number.isFinite(c?.x)).toBe(true);
    expect(Number.isFinite(c?.y)).toBe(true);
  });

  it("has no centroid for an empty polygon", () => {
    expect(planCentroid([], snapshot.center)).toBeNull();
  });
});
