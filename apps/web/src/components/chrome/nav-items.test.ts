import { describe, expect, it } from "vitest";
import { FLEET_MANAGER_NAV, OPERATOR_NAV, activeItem, navFor } from "@/components/chrome/nav-items";

describe("operator dock (D14)", () => {
  it("has four destinations and no Map", () => {
    expect(OPERATOR_NAV.map((i) => i.key)).toEqual(["home", "task", "safety", "training"]);
    expect(navFor("operator")).toBe(OPERATOR_NAV);
  });

  it("keeps the Map route reachable and active under Safety", () => {
    expect(activeItem(OPERATOR_NAV, "/op/map")?.key).toBe("safety");
    expect(activeItem(OPERATOR_NAV, "/op/safety")?.key).toBe("safety");
  });

  it("marks Training active for its sub-screens and Home only on /op", () => {
    expect(activeItem(OPERATOR_NAV, "/op/training/replay/r1")?.key).toBe("training");
    expect(activeItem(OPERATOR_NAV, "/op")?.key).toBe("home");
    expect(activeItem(OPERATOR_NAV, "/op/task")?.key).toBe("task");
  });

  it("returns nothing for an unknown route", () => {
    expect(activeItem(OPERATOR_NAV, "/elsewhere")).toBeUndefined();
  });
});

describe("fleet manager rail", () => {
  it("keeps four destinations and resolves the Inbox at /fm", () => {
    expect(FLEET_MANAGER_NAV).toHaveLength(4);
    expect(activeItem(FLEET_MANAGER_NAV, "/fm")?.key).toBe("inbox");
    expect(activeItem(FLEET_MANAGER_NAV, "/fm/map")?.key).toBe("fleetMap");
  });
});
