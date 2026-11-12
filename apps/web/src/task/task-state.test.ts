import { describe, expect, it } from "vitest";
import { derivePpe, elapsedMin, factorRows, taskActions, type PpeInput } from "./task-state";

const T0 = Date.parse("2026-09-24T14:02:00.000+05:30");
const UNTIL = "2026-09-24T14:17:00.000+05:30";
const base: PpeInput = { taskId: "t1", status: "planned", missing: [], override: null, nowMs: T0 };
const override = { taskId: "t1", validUntil: UNTIL, missing: ["vest"] };

describe("PPE state machine", () => {
  it("draws no plate before any check", () => {
    expect(derivePpe(base)).toEqual({ kind: "clear" });
  });

  it("restored path: blocked, then the vest is detected, then Start works", () => {
    const blocked = derivePpe({ ...base, status: "blocked_ppe", missing: ["vest"] });
    expect(blocked).toEqual({ kind: "blocked", missing: ["vest"] });
    expect(taskActions("blocked_ppe", blocked)).toMatchObject({ primary: "start", needsPpe: true });
    const restored = derivePpe({ ...base, status: "blocked_ppe", missing: [] });
    expect(restored).toEqual({ kind: "restored" });
    expect(taskActions("blocked_ppe", restored).needsPpe).toBe(false);
  });

  it("override path: live until the expiry, Start allowed", () => {
    const v = derivePpe({ ...base, status: "blocked_ppe", override, nowMs: T0 });
    expect(v).toMatchObject({ kind: "override", validUntil: UNTIL });
    expect(taskActions("blocked_ppe", v).needsPpe).toBe(false);
  });

  it("expired path: at and after valid_until the plate re-blocks and Start is disabled", () => {
    for (const now of [Date.parse(UNTIL), Date.parse(UNTIL) + 60_000]) {
      const v = derivePpe({ ...base, status: "blocked_ppe", override, nowMs: now });
      expect(v).toEqual({ kind: "expired", missing: ["vest"] });
      expect(taskActions("blocked_ppe", v)).toMatchObject({ primary: "start", needsPpe: true });
    }
  });

  it("expired re-blocks a paused task too: Resume is disabled", () => {
    const v = derivePpe({ ...base, status: "paused", override, nowMs: Date.parse(UNTIL) + 1 });
    expect(v.kind).toBe("expired");
    expect(taskActions("paused", v)).toMatchObject({ primary: "resume", needsPpe: true });
  });

  it("a server answer of override_expired wins over a local clock that still says live", () => {
    expect(derivePpe({ ...base, status: "blocked_ppe", override, serverExpired: true }).kind).toBe("expired");
  });

  it("ppe.restored clears the override record, so the plate becomes Vest detected", () => {
    expect(derivePpe({ ...base, status: "blocked_ppe", override: null, missing: [] }).kind).toBe("restored");
  });

  it("an override for another task does not apply; a working task is not gated", () => {
    expect(derivePpe({ ...base, status: "blocked_ppe", missing: ["vest"], override: { ...override, taskId: "t2" } }).kind).toBe("blocked");
    expect(derivePpe({ ...base, status: "in_progress", missing: ["vest"], override }).kind).toBe("clear");
  });
});

describe("A06 start / resume, A07 pause, A08 complete", () => {
  const clear = { kind: "clear" } as const;
  it("A06: planned offers Start, paused offers Resume, blocked_ppe offers Start", () => {
    expect(taskActions("planned", clear)).toEqual({ primary: "start", needsPpe: false, canComplete: false });
    expect(taskActions("paused", clear)).toEqual({ primary: "resume", needsPpe: false, canComplete: true });
    expect(taskActions("blocked_ppe", clear).primary).toBe("start");
  });
  it("A07: a working task offers Pause and Complete", () => {
    expect(taskActions("in_progress", clear)).toEqual({ primary: "pause", needsPpe: false, canComplete: true });
  });
  it("A08: Complete is not offered before the task has started or after it ends", () => {
    expect(taskActions("planned", clear).canComplete).toBe(false);
    expect(taskActions("completed", clear)).toEqual({ primary: null, needsPpe: false, canComplete: false });
    expect(taskActions("cancelled", clear).primary).toBeNull();
  });
  it("elapsed counts whole sim minutes since the first start", () => {
    expect(elapsedMin("2026-09-24T13:21:00.000+05:30", T0)).toBe(41);
    expect(elapsedMin(undefined, T0)).toBeNull();
    expect(elapsedMin("2026-09-24T15:00:00.000+05:30", T0)).toBe(0);
  });
});

describe("factor rows", () => {
  const factors = [
    { key: "weather:hot", multiplier: 1.1, assumed: false },
    { key: "skill:novice", multiplier: 1.25, assumed: false },
    { key: "age:5to10", multiplier: 1, assumed: false },
    { key: "heat:extreme", multiplier: 1.22, assumed: false },
    { key: "circadian:post_lunch_dip", multiplier: 1.05, assumed: true },
  ];
  it("core shows the two biggest, detail shows all", () => {
    expect(factorRows(factors, { all: false }).map((r) => r.key)).toEqual(["skill:novice", "heat:extreme"]);
    expect(factorRows(factors, { all: true })).toHaveLength(5);
  });
  it("tags come from the provenance registry; an assumed factor says assumed", () => {
    const rows = Object.fromEntries(factorRows(factors, { all: true }).map((r) => [r.group, r]));
    expect(rows.heat?.tag.kind).toBe("source");
    expect(rows.skill?.tag.kind).toBe("none");
    expect(rows.circadian?.tag).toEqual({ kind: "assumed" });
    expect(rows.heat?.pct).toBe(22);
  });
  it("null factors give no rows", () => {
    expect(factorRows(null, { all: true })).toEqual([]);
  });
});
