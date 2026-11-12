import { describe, expect, it } from "vitest";
import { AnomalyDetected } from "@cat/shared";
import { EVENT_PAYLOADS } from "@cat/shared/fixtures";
import { groupInbox, type InboxItem } from "./inbox";
import { moveSelection, resolveSelection, selectableIds, sparkPoints, sparkSeries, timelineSteps, triage } from "./split";

const base: InboxItem = {
  id: "a", kind: "seatbelt_off_moving", tier: "warning", status: "open", needsAck: true, occurrences: 1,
  firstSeen: "2026-09-24T09:40:00.000+05:30", operatorName: "Ravi", machineCode: "EXC-007", taskId: null,
  taskBlocked: false, missing: [], dispatch: null, anomaly: null, nonPunitive: false,
};
const item = (over: Partial<InboxItem>): InboxItem => ({ ...base, ...over });

describe("split-view selection and keyboard", () => {
  const ids = ["a", "b", "c"];
  it("Down/Up move one row and stop at the ends", () => {
    expect(moveSelection(ids, "a", "ArrowDown")).toBe("b");
    expect(moveSelection(ids, "c", "ArrowDown")).toBe("c");
    expect(moveSelection(ids, "a", "ArrowUp")).toBe("a");
    expect(moveSelection(ids, "c", "ArrowUp")).toBe("b");
  });
  it("Home/End jump; no selection starts from the matching end; empty list gives null", () => {
    expect(moveSelection(ids, "b", "Home")).toBe("a");
    expect(moveSelection(ids, "b", "End")).toBe("c");
    expect(moveSelection(ids, null, "ArrowDown")).toBe("a");
    expect(moveSelection(ids, null, "ArrowUp")).toBe("c");
    expect(moveSelection([], null, "ArrowDown")).toBeNull();
  });
  it("keeps a valid selection and falls back to the first row when it disappears", () => {
    expect(resolveSelection(ids, "b")).toBe("b");
    expect(resolveSelection(ids, "gone")).toBe("a");
    expect(resolveSelection(ids, null)).toBe("a");
    expect(resolveSelection([], "x")).toBeNull();
  });
  it("lists selectable ids in group order", () => {
    const g = groupInbox([item({ id: "1" }), item({ id: "2", status: "resolved" }), item({ id: "3", status: "acknowledged" })]);
    expect(selectableIds(g)).toEqual(["1", "3", "2"]);
  });
});

describe("mobile triage", () => {
  const g = groupInbox([
    item({ id: "w", tier: "warning", firstSeen: "2026-09-24T09:47:00.000+05:30" }),
    item({ id: "c", tier: "caution", firstSeen: "2026-09-24T09:10:00.000+05:30" }),
    item({ id: "k", tier: "critical", firstSeen: "2026-09-24T09:41:00.000+05:30" }),
    item({ id: "h", status: "acknowledged" }),
  ]);
  it("leads with the most urgent and queues the rest in order", () => {
    const t = triage(g, null);
    expect(t.lead?.id).toBe("k");
    expect(t.queued.map((i) => i.id)).toEqual(["w", "c"]);
  });
  it("a tap promotes a queued row; the old lead rejoins the queue", () => {
    const t = triage(g, "c");
    expect(t.lead?.id).toBe("c");
    expect(t.queued.map((i) => i.id)).toEqual(["k", "w"]);
  });
  it("can promote a handled row; an unknown id falls back to the top", () => {
    expect(triage(g, "h").lead?.id).toBe("h");
    expect(triage(g, "h").queued).toHaveLength(3);
    expect(triage(g, "nope").lead?.id).toBe("k");
  });
  it("is empty-safe", () => {
    expect(triage(groupInbox([]), null)).toEqual({ lead: null, queued: [] });
  });
});

describe("sparkline and timeline", () => {
  const anomaly = AnomalyDetected.parse({ ...EVENT_PAYLOADS["anomaly.detected"], features: { value: 86, mean: 71 } });
  it("is deterministic, ends at the detected value and starts near normal", () => {
    const a = sparkSeries(anomaly)!;
    expect(a.values).toEqual(sparkSeries(anomaly)!.values);
    expect(a.values.at(-1)).toBe(86);
    expect(Math.abs(a.values[0]! - 71)).toBeLessThan(3);
  });
  it("is null without a value and normal pair", () => {
    expect(sparkSeries({ ...anomaly, features: { other: 1 } })).toBeNull();
  });
  it("maps into the box with the normal line below the detected point", () => {
    const s = sparkSeries(anomaly)!;
    const { points, normalY } = sparkPoints(s.values, s.normal, 100, 50);
    expect(points[0]!.x).toBe(0);
    expect(points.at(-1)!.x).toBe(100);
    for (const p of points) expect(p.y >= 0 && p.y <= 50).toBe(true);
    expect(normalY).toBeGreaterThan(points.at(-1)!.y);
  });
  it("timeline: raised, then each dispatch line, dry run flagged", () => {
    expect(timelineSteps(item({}), ["telegram:sent", "twilio_voice:dry_run"], 5)).toEqual([
      { kind: "raised", ageMin: 5 },
      { kind: "dispatch", channel: "telegram", status: "sent", dryRun: false },
      { kind: "dispatch", channel: "twilio_voice", status: "dry_run", dryRun: true },
    ]);
  });
  it("timeline falls back to the row's own line; a near-miss shows no age and no dispatch", () => {
    expect(timelineSteps(item({ dispatch: "telegram:delivered" }), [], null)).toHaveLength(2);
    expect(timelineSteps(item({ nonPunitive: true, dispatch: "telegram:sent" }), ["telegram:sent"], 4)).toEqual([{ kind: "raised", ageMin: null }]);
  });
});
