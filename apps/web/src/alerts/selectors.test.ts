import { describe, expect, it } from "vitest";
import type { AlertRecord } from "@/data/types";
import { NO_SIGNAL_AFTER_MS, cautionBanner, needsAckCount, safetyState, takeoverQueue, topAlert } from "./selectors";

function alert(over: Partial<AlertRecord> & Pick<AlertRecord, "alert_id" | "tier">): AlertRecord {
  return {
    kind: "seatbelt_off_moving",
    needs_ack: over.tier === "warning" || over.tier === "critical",
    escalate_at: null,
    occurrences: 1,
    protocol_card_id: null,
    upgraded_from: null,
    status: "open",
    first_seen: "2026-09-23T10:42:00+05:30",
    ...over,
  };
}

describe("precedence", () => {
  it("critical beats warning beats caution beats info", () => {
    const alerts = [
      alert({ alert_id: "i", tier: "info" }),
      alert({ alert_id: "w", tier: "warning" }),
      alert({ alert_id: "c", tier: "critical" }),
      alert({ alert_id: "ca", tier: "caution" }),
    ];
    expect(topAlert(alerts)?.alert_id).toBe("c");
    expect(takeoverQueue(alerts).map((a) => a.alert_id)).toEqual(["c", "w"]);
  });

  it("orders equal tiers oldest first so criticals stack in arrival order", () => {
    const alerts = [
      alert({ alert_id: "late", tier: "critical", first_seen: "2026-09-23T10:43:00+05:30" }),
      alert({ alert_id: "early", tier: "critical", first_seen: "2026-09-23T10:41:00+05:30" }),
    ];
    expect(takeoverQueue(alerts).map((a) => a.alert_id)).toEqual(["early", "late"]);
  });

  it("acknowledged alerts leave the takeover but keep the chip colour", () => {
    const alerts = [alert({ alert_id: "w", tier: "warning", status: "acknowledged" })];
    expect(takeoverQueue(alerts)).toEqual([]);
    expect(topAlert(alerts)?.tier).toBe("warning");
    expect(needsAckCount(alerts)).toBe(0);
  });
});

describe("suppressed and resolved", () => {
  it("are never shown to the operator", () => {
    const alerts = [
      alert({ alert_id: "s", tier: "critical", status: "suppressed" }),
      alert({ alert_id: "r", tier: "warning", status: "resolved" }),
      alert({ alert_id: "ca", tier: "caution" }),
    ];
    expect(topAlert(alerts)?.alert_id).toBe("ca");
    expect(takeoverQueue(alerts)).toEqual([]);
    expect(cautionBanner(alerts)?.alert_id).toBe("ca");
  });

  it("the caution banner hides while a takeover is up", () => {
    const alerts = [alert({ alert_id: "ca", tier: "caution" }), alert({ alert_id: "w", tier: "warning" })];
    expect(cautionBanner(alerts)).toBeUndefined();
  });
});

describe("safety chip", () => {
  const now = 1_000_000;
  it("reads CLEAR with no alerts and a fresh frame", () => {
    expect(safetyState([], now - 1_000, now)).toBe("clear");
  });
  it("reads NO SIGNAL once frames are older than 10 s, even over a CLEAR", () => {
    expect(safetyState([], now - NO_SIGNAL_AFTER_MS - 1, now)).toBe("nosignal");
    expect(safetyState([], now - NO_SIGNAL_AFTER_MS, now)).toBe("clear");
    expect(safetyState([], null, now)).toBe("nosignal");
  });
  it("reads NO SIGNAL over an active warning too, because a stale tier cannot be trusted", () => {
    expect(safetyState([alert({ alert_id: "w", tier: "warning" })], now - 20_000, now)).toBe("nosignal");
  });
});
