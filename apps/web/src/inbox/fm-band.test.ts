import { describe, expect, it } from "vitest";
import { mySnapshot } from "@cat/shared/fixtures";
import type { Machine } from "@/data/types";
import type { InboxItem } from "@/inbox/inbox";
import { detailMachine, ledgerActions, ledgerBand, nextSealNumber, tierChips, tierCounts, toLastVerify } from "@/inbox/fm-band";

const item = (o: Partial<InboxItem>): InboxItem => ({
  id: "a", kind: "seatbelt_off_moving", tier: "warning", status: "open", needsAck: true, occurrences: 1, firstSeen: "2026-09-24T09:00:00.000Z",
  operatorName: "Ravi", machineCode: "EXC-007", taskId: null, taskBlocked: false, missing: [], dispatch: null, anomaly: null, nonPunitive: false, ...o,
});
const machine = mySnapshot.machine as unknown as Machine;

describe("tier chips", () => {
  it("counts per tier and leaves zero tiers out", () => {
    const c = tierCounts([item({ tier: "critical" }), item({ id: "b", tier: "warning" }), ...[1, 2, 3, 4].map((n) => item({ id: `c${n}`, tier: "caution" }))]);
    expect(c).toEqual({ critical: 1, warning: 1, caution: 4 });
    expect(tierChips({ critical: 0, warning: 2, caution: 0 })).toEqual([{ tier: "warning", n: 2 }]);
    expect(tierChips(c).map((x) => x.tier)).toEqual(["critical", "warning", "caution"]);
  });
});

describe("ledger band", () => {
  it("is unknown before a verify", () => expect(ledgerBand(null)).toEqual({ kind: "unknown" }));
  it("is verified after a clean verify", () => expect(ledgerBand({ ok: true, headSeq: 214, firstBadSeq: null, atMs: 5 })).toEqual({ kind: "verified", n: 214, atMs: 5 }));
  it("needs a check after a failed verify", () => expect(ledgerBand({ ok: false, headSeq: 214, firstBadSeq: 90, atMs: 5 })).toEqual({ kind: "check", n: 214 }));
  it("numbers the next seal", () => {
    expect(nextSealNumber({ ok: true, headSeq: 214, firstBadSeq: null, atMs: 0 })).toBe(215);
    expect(nextSealNumber(null)).toBeNull();
  });
});

describe("ledger actions", () => {
  it("offers Verify and Compare only for an open ledger break", () => {
    expect(ledgerActions(item({ kind: "ledger_tamper", tier: "critical" }))).toEqual({ verify: true, compare: true });
    expect(ledgerActions(item({ kind: "ledger_tamper", status: "resolved" }))).toEqual({ verify: false, compare: false });
    expect(ledgerActions(item({}))).toEqual({ verify: false, compare: false });
  });
});

describe("verdict to band", () => {
  const out = { ok: true, chain_ok: true, head_seq: 214, first_bad_seq: null };
  it("a live verdict is verified", () => expect(ledgerBand(toLastVerify(out, 5, false))).toEqual({ kind: "verified", n: 214, atMs: 5 }));
  it("a fixture fallback in Live mode is never verified", () => {
    const v = toLastVerify(out, 5, true);
    expect(ledgerBand(v)).toEqual({ kind: "unavailable" });
    expect(nextSealNumber(v)).toBeNull();
  });
  it("a failed browser re-check or broken chain needs a check", () => {
    expect(ledgerBand(toLastVerify(out, 5, false, false)).kind).toBe("check");
    expect(ledgerBand(toLastVerify({ ...out, chain_ok: false, first_bad_seq: 9 }, 5, false)).kind).toBe("check");
  });
});

describe("detail drawing", () => {
  it("highlights the worst part for a machine anomaly", () => {
    // The fixture's belt is off while moving (cab = warning), so clip the belt to isolate the boom ram caution.
    const d = detailMachine(item({ kind: "anomaly_machine" }), { ...machine, seatbelt_fastened: true });
    expect(d?.highlight).toBe("boom_ram");
    expect(d?.parts).toHaveLength(6);
  });
  it("points a seatbelt alert at the cab", () => expect(detailMachine(item({}), machine)?.highlight).toBe("cab"));
  it("has no drawing for another machine, a near-miss, or no parts", () => {
    expect(detailMachine(item({ machineCode: "EXC-099" }), machine)).toBeNull();
    expect(detailMachine(item({ kind: "near_miss", nonPunitive: true, machineCode: null }), machine)).toBeNull();
    expect(detailMachine(item({}), null)).toBeNull();
  });
  it("names no part for a kind that has none", () => expect(detailMachine(item({ kind: "ppe_missing" }), machine)?.highlight).toBeNull());
});
