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
    expect(restored).toEqual({ kind: "restored", items: [] });
    expect(derivePpe({ ...base, status: "blocked_ppe", restored: ["vest"] })).toEqual({ kind: "restored", items: ["vest"] });
    expect(taskActions("blocked_ppe", restored).needsPpe).toBe(false);
  });

  it("override path: live until the expiry, Start allowed", () => {
    const v = derivePpe({ ...base, status: "blocked_ppe", override, nowMs: T0 });
    expect(v).toMatchObject({ kind: "override", validUntil: UNTIL, lapsed: false });
    expect(taskActions("blocked_ppe", v).needsPpe).toBe(false);
  });

  it("local expiry keeps Start usable (lapsed) so task_start can run and the server re-sends ppe.missing", () => {
    const v = derivePpe({ ...base, status: "blocked_ppe", override, nowMs: Date.parse(UNTIL) + 60_000 });
    expect(v).toMatchObject({ kind: "override", lapsed: true });
    expect(taskActions("blocked_ppe", v)).toMatchObject({ primary: "start", needsPpe: false });
  });

  it("expired path: after the server answers override_expired the plate re-blocks and Start is disabled", () => {
    const v = derivePpe({ ...base, status: "blocked_ppe", override, serverExpiredFor: UNTIL });
    expect(v).toEqual({ kind: "expired", missing: ["vest"] });
    expect(taskActions("blocked_ppe", v)).toMatchObject({ primary: "start", needsPpe: true });
    expect(taskActions("paused", v)).toMatchObject({ primary: "resume", needsPpe: true });
  });

  it("a new override (new valid_until) clears an earlier server expiry", () => {
    const next = { ...override, validUntil: "2026-09-24T14:40:00.000+05:30" };
    expect(derivePpe({ ...base, status: "blocked_ppe", override: next, serverExpiredFor: UNTIL }).kind).toBe("override");
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
  it("elapsed is working time: closed intervals plus the running one, pauses excluded", () => {
    expect(elapsedMin({ workedMs: 10 * 60_000, runningSince: "2026-09-24T13:41:00.000+05:30" }, T0)).toBe(31);
    expect(elapsedMin({ workedMs: 9 * 60_000, runningSince: null }, T0)).toBe(9);
    expect(elapsedMin(undefined, T0)).toBeNull();
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
  it("hot weather and the heat band merge into one factor with the product multiplier", () => {
    const rows = factorRows(factors, { all: true });
    expect(rows.map((r) => r.group)).not.toContain("heat");
    expect(rows.map((r) => r.group)).not.toContain("weather");
    expect(rows.find((r) => r.group === "weather_heat")?.pct).toBe(Math.round((1.1 * 1.22 - 1) * 100));
  });
  it("core shows the two biggest, detail shows all", () => {
    expect(factorRows(factors, { all: false }).map((r) => r.key)).toEqual(["weather_heat:combined", "skill:novice"]);
    expect(factorRows(factors, { all: true })).toHaveLength(4);
  });
  it("clear weather leaves the heat factor alone", () => {
    const rows = factorRows([{ key: "weather:clear", multiplier: 1, assumed: false }, { key: "heat:high", multiplier: 1.09, assumed: false }], { all: true });
    expect(rows.map((r) => r.group).sort()).toEqual(["heat", "weather"]);
  });
  it("tags come from the provenance registry; an assumed factor says assumed", () => {
    const rows = Object.fromEntries(factorRows(factors, { all: true }).map((r) => [r.group, r]));
    expect(rows.weather_heat?.tag.kind).toBe("source");
    expect(rows.skill?.tag.kind).toBe("none");
    expect(rows.circadian?.tag).toEqual({ kind: "assumed" });
    expect(rows.weather_heat?.pct).toBe(34);
  });
  it("null factors give no rows", () => {
    expect(factorRows(null, { all: true })).toEqual([]);
  });
});
