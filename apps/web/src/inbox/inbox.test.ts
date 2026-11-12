import { describe, expect, it } from "vitest";
import { EVENT_PAYLOADS } from "@cat/shared/fixtures";
import { AnomalyDetected } from "@cat/shared";
import { effectiveStatus, groupInbox, orderInbox, parseDispatch, rowActions, sanitise, toggleExpanded, validateReason, type InboxItem } from "./inbox";

const base: InboxItem = {
  id: "a", kind: "seatbelt_off_moving", tier: "warning", status: "open", needsAck: true, occurrences: 1,
  firstSeen: "2026-09-24T09:40:00.000+05:30", operatorName: "Ravi", machineCode: "EXC-007", taskId: null,
  taskBlocked: false, missing: [], dispatch: null, anomaly: null, nonPunitive: false,
};
const item = (over: Partial<InboxItem>): InboxItem => ({ ...base, ...over });

describe("inbox ordering", () => {
  it("sorts by tier first, then oldest first", () => {
    const out = orderInbox([
      item({ id: "caution-old", tier: "caution", firstSeen: "2026-09-24T08:00:00.000+05:30" }),
      item({ id: "warn-new", tier: "warning", firstSeen: "2026-09-24T09:50:00.000+05:30" }),
      item({ id: "crit", tier: "critical", firstSeen: "2026-09-24T09:55:00.000+05:30" }),
      item({ id: "warn-old", tier: "warning", firstSeen: "2026-09-24T09:10:00.000+05:30" }),
    ]);
    expect(out.map((i) => i.id)).toEqual(["crit", "warn-old", "warn-new", "caution-old"]);
  });
  it("does not mutate its input", () => {
    const input = [item({ id: "a", tier: "caution" }), item({ id: "b", tier: "critical" })];
    orderInbox(input);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("splits by status: needs action, handled, resolved, suppressed", () => {
    const g = groupInbox([
      item({ id: "1" }),
      item({ id: "2", status: "acknowledged" }),
      item({ id: "3", status: "escalated" }),
      item({ id: "4", status: "resolved" }),
      item({ id: "5", status: "suppressed" }),
    ]);
    expect(g.needsAction.map((i) => i.id)).toEqual(["1"]);
    expect(g.handled.map((i) => i.id)).toEqual(["2", "3"]);
    expect(g.resolved).toHaveLength(1);
    expect(g.suppressed).toHaveLength(1);
  });
});

describe("reason validation (A21: 10 to 500 characters)", () => {
  it("rejects 9, accepts 10", () => {
    expect(validateReason("a".repeat(9))).toEqual({ ok: false, error: "too_short" });
    expect(validateReason("a".repeat(10)).ok).toBe(true);
  });
  it("accepts 500, rejects 501", () => {
    expect(validateReason("a".repeat(500)).ok).toBe(true);
    expect(validateReason("a".repeat(501))).toEqual({ ok: false, error: "too_long" });
  });
  it("does not let spaces pad the minimum", () => {
    expect(validateReason("   short   ").ok).toBe(false);
  });
  it("rejects control characters like the contract", () => {
    expect(validateReason("Vest is in the cabin\nnext door")).toEqual({ ok: false, error: "control_chars" });
  });
});

describe("anomaly row expand state", () => {
  it("toggles one row open and closed, independent of the others", () => {
    let open = new Set<string>();
    open = toggleExpanded(open, "x");
    expect(open.has("x")).toBe(true);
    open = toggleExpanded(open, "y");
    expect([...open].sort()).toEqual(["x", "y"]);
    open = toggleExpanded(open, "x");
    expect([...open]).toEqual(["y"]);
  });
  it("returns a new set", () => {
    const a = new Set<string>();
    expect(toggleExpanded(a, "x")).not.toBe(a);
    expect(a.size).toBe(0);
  });
});

describe("near-miss privacy and actions", () => {
  it("never shows an operator on a non-punitive or near-miss row", () => {
    expect(sanitise(item({ kind: "near_miss", operatorName: "Ravi" })).operatorName).toBeNull();
    expect(sanitise(item({ nonPunitive: true, operatorName: "Ravi" })).operatorName).toBeNull();
    const g = groupInbox([item({ kind: "near_miss", operatorName: "Ravi" })]);
    expect(g.needsAction[0]?.operatorName).toBeNull();
  });
  it("offers Grant override only on a blocked ppe_missing row", () => {
    expect(rowActions(item({ kind: "ppe_missing", taskId: "t", taskBlocked: true })).override).toBe(true);
    expect(rowActions(item({ kind: "ppe_missing", taskId: "t", taskBlocked: false })).override).toBe(false);
    expect(rowActions(item({ kind: "seatbelt_off_moving" })).override).toBe(false);
  });
  it("offers no Acknowledge on a near-miss or a handled row", () => {
    expect(rowActions(item({ kind: "near_miss", nonPunitive: true })).acknowledge).toBe(false);
    expect(rowActions(item({ status: "acknowledged" })).acknowledge).toBe(false);
    expect(rowActions(item({})).acknowledge).toBe(true);
  });
  it("offers Show on map for an anomaly row", () => {
    const anomaly = AnomalyDetected.parse(EVENT_PAYLOADS["anomaly.detected"]);
    expect(rowActions(item({ kind: "anomaly_machine", anomaly })).showOnMap).toBe(true);
  });
});

describe("dispatch line", () => {
  it("parses channel:status", () => {
    expect(parseDispatch("telegram:sent")).toEqual({ channel: "telegram", status: "sent" });
    expect(parseDispatch(null)).toBeNull();
    expect(parseDispatch("garbage")).toBeNull();
  });
});

describe("near-miss allowlist (cannot be joined to a pairing)", () => {
  it("drops machine, task, anomaly, dispatch, operator and the exact time", () => {
    const anomaly = AnomalyDetected.parse(EVENT_PAYLOADS["anomaly.detected"]);
    const out = sanitise(item({ kind: "near_miss", nonPunitive: true, operatorName: "Meena", machineCode: "DMP-003", taskId: "t", taskBlocked: true, missing: ["vest"], dispatch: "telegram:sent", anomaly, firstSeen: "2026-09-24T08:55:00.000+05:30" }));
    expect(out.machineCode).toBeNull();
    expect(out.operatorName).toBeNull();
    expect(out.taskId).toBeNull();
    expect(out.dispatch).toBeNull();
    expect(out.anomaly).toBeNull();
    expect(out.missing).toEqual([]);
    expect(out.firstSeen).not.toContain("08:55");
    expect(out.firstSeen.slice(0, 10)).toBe("2026-09-24");
  });
  it("two near-miss rows from different times look identical in time, so time cannot join them", () => {
    const a = sanitise(item({ kind: "near_miss", nonPunitive: true, firstSeen: "2026-09-24T08:55:00.000+05:30" }));
    const b = sanitise(item({ kind: "near_miss", nonPunitive: true, firstSeen: "2026-09-24T17:20:00.000+05:30" }));
    expect(a.firstSeen).toBe(b.firstSeen);
  });
});

describe("timestamps and live status", () => {
  it("orders by instant across offsets", () => {
    const out = orderInbox([
      item({ id: "later", firstSeen: "2026-09-24T04:30:00.000+00:00" }),
      item({ id: "earlier", firstSeen: "2026-09-24T09:40:00.000+05:30" }),
    ]);
    expect(out.map((i) => i.id)).toEqual(["earlier", "later"]);
  });
  it("a local acknowledge holds until the live status moves on", () => {
    const local = { status: "acknowledged" as const, from: "open" as const };
    expect(effectiveStatus("open", "open", local)).toBe("acknowledged");
    expect(effectiveStatus("open", undefined, local)).toBe("acknowledged");
    expect(effectiveStatus("open", "resolved", local)).toBe("resolved");
    expect(effectiveStatus("open", "escalated", local)).toBe("escalated");
    expect(effectiveStatus("open", "acknowledged", undefined)).toBe("acknowledged");
  });
});
