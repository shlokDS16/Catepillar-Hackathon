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

describe("shellInert", () => {
  it("is off with no takeover and no lock", () => {
    expect(shellInert(false, [])).toBe(false);
    expect(shellInert(false, [alert({ alert_id: "c", tier: "caution" })])).toBe(false);
  });
  it("is on under a Warning or Critical takeover", () => {
    expect(shellInert(false, [alert({ alert_id: "w", tier: "warning" })])).toBe(true);
    expect(shellInert(false, [alert({ alert_id: "x", tier: "critical" })])).toBe(true);
  });
  it("is off once the takeover is acknowledged", () => {
    expect(shellInert(false, [alert({ alert_id: "w", tier: "warning", status: "acknowledged" })])).toBe(false);
  });
  it("stays on while the motion lock shows", () => {
    expect(shellInert(true, [])).toBe(true);
  });
});
