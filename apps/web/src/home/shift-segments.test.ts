import { describe, expect, it } from "vitest";
import { IDS, mySnapshot, T0 } from "@cat/shared/fixtures";
import { MySnapshotOut } from "@cat/shared";
import type { Task } from "@/data/types";
import { buildShiftSegments, tapePct, type ShiftInput } from "./shift-segments";

const snap = MySnapshotOut.parse(mySnapshot);
const at = (hhmm: string) => `2026-09-24T${hhmm}:00.000+05:30`;
const ms = (iso: string) => Date.parse(iso);

function input(over: Partial<ShiftInput> = {}): ShiftInput {
  return { tasks: snap.tasks, taskWork: {}, alerts: snap.active_alerts, assignments: snap.assignments, eventTimes: {}, weather: snap.weather, ...over };
}
const task = (over: Partial<Task>): Task => ({ ...snap.tasks[0]!, ...over });

describe("buildShiftSegments", () => {
  it("draws the running task as Working up to now, then Planned for the rest", () => {
    const tape = buildShiftSegments(input(), T0);
    const kinds = tape.segments.map((s) => s.kind);
    expect(kinds).toEqual(["working", "planned"]);
    expect(tape.segments[0]!.startMs).toBe(ms(at("09:00")));
    expect(tape.segments[0]!.endMs).toBe(ms(T0));
    expect(tape.segments[1]!.startMs).toBe(ms(T0));
  });

  it("floors now to the sim minute (the line never tweens)", () => {
    const a = buildShiftSegments(input(), "2026-09-24T09:40:05.000+05:30");
    const b = buildShiftSegments(input(), "2026-09-24T09:40:55.000+05:30");
    expect(a.nowMs).toBe(b.nowMs);
    expect(buildShiftSegments(input(), "2026-09-24T09:41:00.000+05:30").nowMs).toBe(a.nowMs + 60_000);
  });

  it("shows a paused task as Working for the worked time, then Waiting", () => {
    const t = task({ status: "paused" });
    const tape = buildShiftSegments(input({ tasks: [t], taskWork: { [t.id]: { workedMs: 20 * 60_000, runningSince: null } } }), T0);
    expect(tape.segments.map((s) => [s.kind, (s.endMs - s.startMs) / 60_000])).toEqual([
      ["working", 20],
      ["waiting", 20],
    ]);
  });

  it("treats a blocked-PPE task with no work as Waiting from its planned start", () => {
    const tape = buildShiftSegments(input({ tasks: [task({ status: "blocked_ppe" })] }), T0);
    expect(tape.segments.map((s) => s.kind)).toEqual(["waiting"]);
  });

  it("draws a future task as Planned and a long gap before it as Break", () => {
    const later = task({ id: "later", status: "planned", planned_start: at("11:00"), eta_p50_min: 60, progress_pct: 0 });
    const done = task({ id: "done", status: "completed", planned_start: at("08:00"), eta_p50_min: 30 });
    const tape = buildShiftSegments(input({ tasks: [later, done] }), T0);
    expect(tape.segments.map((s) => s.kind)).toEqual(["working", "break", "planned"]);
    expect(tape.segments[1]).toMatchObject({ startMs: ms(at("08:30")), endMs: ms(at("11:00")) });
  });

  it("does not draw a break for a short gap", () => {
    const a = task({ id: "a", status: "completed", planned_start: at("08:00"), eta_p50_min: 30 });
    const b = task({ id: "b", status: "planned", planned_start: at("08:40"), eta_p50_min: 30 });
    const tape = buildShiftSegments(input({ tasks: [a, b], assignments: [] }), at("08:30"));
    expect(tape.segments.some((s) => s.kind === "break")).toBe(false);
  });

  it("ignores cancelled tasks and handles no tasks", () => {
    const tape = buildShiftSegments(input({ tasks: [task({ status: "cancelled" })] }), T0);
    expect(tape.segments).toEqual([]);
    expect(tape.endMs).toBeGreaterThan(tape.startMs);
  });

  it("marks the breach with a Replay link and the heat peak as a scenario forecast", () => {
    const tape = buildShiftSegments(input({ eventTimes: { [IDS.event]: T0 } }), T0);
    const breach = tape.marks.find((m) => m.kind === "breach")!;
    const heat = tape.marks.find((m) => m.kind === "heat")!;
    expect(breach.atMs).toBe(ms(T0));
    expect(breach.href).toBe(`/op/training/replay/${IDS.replay}`);
    expect(heat.atMs).toBe(ms("2026-09-24T14:00:00.000+05:30"));
    expect(heat.href).toBeNull();
    expect(tape.marks.map((m) => m.kind)).toEqual(["breach", "heat"]);
  });

  it("falls back to the alert time when the event time is unknown, and to an unlinked mark with no assignment", () => {
    const t1 = buildShiftSegments(input(), T0);
    expect(t1.marks.find((m) => m.kind === "breach")!.atMs).toBe(ms(snap.active_alerts[0]!.first_seen));
    const t2 = buildShiftSegments(input({ assignments: [] }), T0);
    expect(t2.marks.find((m) => m.kind === "breach")!.href).toBeNull();
  });

  it("has no heat mark without a forecast, and the tape covers the peak", () => {
    const none = buildShiftSegments(input({ weather: null }), T0);
    expect(none.marks.some((m) => m.kind === "heat")).toBe(false);
    const tape = buildShiftSegments(input(), T0);
    expect(tape.endMs).toBeGreaterThan(ms("2026-09-24T14:00:00.000+05:30"));
    expect(tape.hours[0]).toBe(tape.startMs);
  });
});

describe("tapePct", () => {
  it("maps a time to 0-100 and clamps", () => {
    const tape = { startMs: 0, endMs: 100 };
    expect(tapePct(tape, 25)).toBe(25);
    expect(tapePct(tape, -5)).toBe(0);
    expect(tapePct(tape, 500)).toBe(100);
  });
});
