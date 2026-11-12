import { describe, expect, it } from "vitest";
import { shellInert } from "@/components/chrome/inert";
import type { AlertRecord } from "@/data/types";

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

describe("shellInert (operator)", () => {
  it("is off with no takeover and no lock", () => {
    expect(shellInert("operator", false, [])).toBe(false);
    expect(shellInert("operator", false, [alert({ alert_id: "c", tier: "caution" })])).toBe(false);
  });
  it("is on under a Warning or Critical takeover", () => {
    expect(shellInert("operator", false, [alert({ alert_id: "w", tier: "warning" })])).toBe(true);
    expect(shellInert("operator", false, [alert({ alert_id: "x", tier: "critical" })])).toBe(true);
  });
  it("is off once the takeover is acknowledged", () => {
    expect(shellInert("operator", false, [alert({ alert_id: "w", tier: "warning", status: "acknowledged" })])).toBe(false);
  });
  it("stays on while the motion lock shows", () => {
    expect(shellInert("operator", true, [])).toBe(true);
  });
});

describe("shellInert (fleet manager)", () => {
  it("is never inert: the FM shell has no takeover, even when the shared store holds an operator Warning/Critical or the lock", () => {
    const open = [alert({ alert_id: "w", tier: "warning" }), alert({ alert_id: "x", tier: "critical" })];
    expect(shellInert("fleet_manager", false, open)).toBe(false);
    expect(shellInert("fleet_manager", true, open)).toBe(false);
  });
});
