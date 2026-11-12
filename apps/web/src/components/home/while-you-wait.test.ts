import { describe, expect, it } from "vitest";
import { idleMsSince, showWhileYouWait, type WaitInput } from "./while-you-wait";

const base: WaitInput = { taskStatus: "paused", moving: false, hasAssignment: true, idleMs: 3 * 60_000 };

describe("showWhileYouWait", () => {
  it("shows for a paused task, still machine, assignment and 3 idle minutes", () => {
    expect(showWhileYouWait(base)).toBe(true);
  });
  it("shows for a blocked task", () => {
    expect(showWhileYouWait({ ...base, taskStatus: "blocked_ppe" })).toBe(true);
  });
  it("hides below 3 minutes", () => {
    expect(showWhileYouWait({ ...base, idleMs: 3 * 60_000 - 1 })).toBe(false);
    expect(showWhileYouWait({ ...base, idleMs: null })).toBe(false);
  });
  it("hides instantly on motion or unknown motion", () => {
    expect(showWhileYouWait({ ...base, moving: true })).toBe(false);
    expect(showWhileYouWait({ ...base, moving: null })).toBe(false);
  });
  it("hides without an assignment", () => {
    expect(showWhileYouWait({ ...base, hasAssignment: false })).toBe(false);
  });
  it("hides for any other task state", () => {
    for (const s of ["in_progress", "planned", "completed", "cancelled", null] as const) {
      expect(showWhileYouWait({ ...base, taskStatus: s })).toBe(false);
    }
  });
});

describe("idleMsSince", () => {
  it("measures forward and clamps at zero", () => {
    const t = Date.parse("2026-09-24T09:40:00.000+05:30");
    expect(idleMsSince(t, "2026-09-24T09:43:30.000+05:30")).toBe(210_000);
    expect(idleMsSince(t, "2026-09-24T09:39:00.000+05:30")).toBe(0);
  });
  it("returns null for missing or bad input", () => {
    expect(idleMsSince(null, "2026-09-24T09:40:00Z")).toBeNull();
    expect(idleMsSince(1, null)).toBeNull();
    expect(idleMsSince(1, "nope")).toBeNull();
  });
});
