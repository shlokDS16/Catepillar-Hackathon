import { describe, expect, it } from "vitest";
import { currentTask, nextPlanned, workState } from "./work-state";

const t = (status: "planned" | "in_progress" | "paused" | "completed" | "cancelled" | "blocked_ppe", planned_start: string) => ({ status, planned_start });

describe("workState", () => {
  it("FAULT wins over any task status", () => {
    expect(workState({ health: "fault" }, t("in_progress", "09:00"))).toBe("fault");
  });
  it("maps task status to the state word", () => {
    expect(workState({ health: "ok" }, t("in_progress", "09:00"))).toBe("working");
    expect(workState({ health: "ok" }, t("paused", "09:00"))).toBe("paused");
    expect(workState({ health: "ok" }, t("blocked_ppe", "09:00"))).toBe("blocked");
    expect(workState({ health: "ok" }, t("completed", "09:00"))).toBe("done");
    expect(workState({ health: "caution" }, t("planned", "09:00"))).toBe("ready");
    expect(workState(null, null)).toBe("ready");
  });
});

describe("currentTask and nextPlanned", () => {
  const tasks = [t("completed", "07:00"), t("planned", "11:00"), t("paused", "09:00"), t("planned", "13:00")];
  it("prefers the running or paused task, then the earliest planned one", () => {
    expect(currentTask(tasks)).toEqual(t("paused", "09:00"));
    expect(currentTask([t("completed", "07:00"), t("planned", "13:00"), t("planned", "11:00")])).toEqual(t("planned", "11:00"));
    expect(currentTask([t("completed", "07:00")])).toBeNull();
  });
  it("names the next planned task after the current one", () => {
    const current = currentTask(tasks);
    expect(nextPlanned(tasks, current)).toEqual(t("planned", "11:00"));
    const onlyPlanned = [t("planned", "11:00")];
    expect(nextPlanned(onlyPlanned, currentTask(onlyPlanned))).toBeNull();
  });
});
