import { describe, expect, it } from "vitest";
import type { AlertRecord } from "@/data/types";
import { deriveChecks, liveTierFor, splitAlerts } from "./checks";

const alert = (o: Partial<AlertRecord>): AlertRecord =>
  ({ alert_id: "a", kind: "seatbelt_off_moving", tier: "warning", needs_ack: true, escalate_at: null, occurrences: 1, protocol_card_id: null, upgraded_from: null, status: "open", first_seen: "2026-09-24T09:00:00.000Z", ...o }) as AlertRecord;

describe("deriveChecks", () => {
  it("reads seatbelt three ways and never guesses", () => {
    const m = (v: boolean | null) => ({ seatbelt_fastened: v }) as never;
    expect(deriveChecks(m(true), null, null).seatbelt).toBe("fastened");
    expect(deriveChecks(m(false), null, null).seatbelt).toBe("off");
    expect(deriveChecks(m(null), null, null).seatbelt).toBe("unknown");
    expect(deriveChecks(null, null, null).seatbelt).toBe("unknown");
  });
  it("lists four PPE items with unknown for a missing key, and proximity or nothing near", () => {
    const op = { ppe: { helmet: true, vest: false }, nearest: { kind: "person", id: "x", distance_m: 22.4, zone: "awareness" } } as never;
    const c = deriveChecks(null, op, { wbgt_c: 31.2 } as never);
    expect(c.ppe.map((p) => `${p.item}:${p.state}`)).toEqual(["helmet:on", "vest:off", "boots:unknown", "gloves:unknown"]);
    expect(c.proximity).toEqual({ kind: "near", what: "person", distance_m: 22, zone: "awareness" });
    expect(c.wbgt_c).toBe(31.2);
    expect(deriveChecks(null, { ppe: {}, nearest: null } as never, null).proximity).toEqual({ kind: "none" });
  });
});

describe("liveTierFor and splitAlerts", () => {
  it("colours a check only for its own live alert, and not once acknowledged", () => {
    expect(liveTierFor([alert({})], "seatbelt")).toBe("warning");
    expect(liveTierFor([alert({})], "ppe")).toBeNull();
    expect(liveTierFor([alert({ status: "acknowledged" })], "seatbelt")).toBeNull();
    expect(liveTierFor([alert({ status: "suppressed" })], "seatbelt")).toBeNull();
  });
  it("active keeps what still needs the operator; recent is handled alerts, newest first", () => {
    const list = [
      alert({ alert_id: "1" }),
      alert({ alert_id: "2", status: "acknowledged", first_seen: "2026-09-24T08:00:00.000Z" }),
      alert({ alert_id: "3", status: "resolved", first_seen: "2026-09-24T08:30:00.000Z" }),
    ];
    const { active, recent } = splitAlerts(list);
    expect(active.map((a) => a.alert_id)).toEqual(["1"]);
    expect(recent.map((a) => a.alert_id)).toEqual(["3", "2"]);
  });
});
