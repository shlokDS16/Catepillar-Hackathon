import { describe, expect, it } from "vitest";
import type { InboxItem } from "@/inbox/inbox";
import { buildFleetCells, DEMO_ROSTER, PHONE_CELLS } from "./fleet";

const row = (over: Partial<InboxItem> & Pick<InboxItem, "id">): InboxItem => ({
  kind: "idle_excess", tier: "caution", status: "open", needsAck: false, occurrences: 1, firstSeen: "2026-09-24T09:00:00.000+05:30",
  operatorName: null, machineCode: null, taskId: null, taskBlocked: false, missing: [], dispatch: null, anomaly: null, nonPunitive: false, ...over,
});

describe("buildFleetCells", () => {
  it("always returns six cells and three phone cells", () => {
    const cells = buildFleetCells([], null);
    expect(cells).toHaveLength(6);
    expect(cells.filter((c) => c.phone)).toHaveLength(PHONE_CELLS);
    expect(cells.every((c) => c.state === "working" || c.state === "parked")).toBe(true);
  });

  it("uses the worst open tier per machine and sorts it first", () => {
    const cells = buildFleetCells(
      [
        row({ id: "a", machineCode: "EXC-011", tier: "caution" }),
        row({ id: "b", machineCode: "EXC-014", tier: "warning", kind: "guardian_hazard" }),
        row({ id: "c", machineCode: "EXC-014", tier: "caution" }),
      ],
      null,
    );
    expect(cells[0]).toMatchObject({ code: "EXC-014", state: "warning", kind: "guardian_hazard" });
    expect(cells[1]).toMatchObject({ code: "EXC-011", state: "caution" });
  });

  it("ignores rows that are not open", () => {
    const cells = buildFleetCells([row({ id: "a", machineCode: "EXC-014", tier: "critical", status: "resolved" })], null);
    expect(cells.find((c) => c.code === "EXC-014")?.state).toBe("parked");
  });

  it("marks the selected alert's machine and keeps it on phones", () => {
    const items = [row({ id: "sel", machineCode: "DMP-005" })];
    const cells = buildFleetCells(items, "sel");
    const sel = cells.filter((c) => c.selected);
    expect(sel).toHaveLength(1);
    expect(sel[0]).toMatchObject({ code: "DMP-005", phone: true });
    expect(cells.filter((c) => c.phone)).toHaveLength(PHONE_CELLS);
  });

  it("selects nothing when the alert has no machine", () => {
    expect(buildFleetCells([row({ id: "x" })], "x").some((c) => c.selected)).toBe(false);
  });

  it("prefers the operator named on an alert row", () => {
    const cells = buildFleetCells([row({ id: "a", machineCode: "DMP-003", operatorName: "Meena D." })], null);
    expect(cells.find((c) => c.code === "DMP-003")?.operator).toBe("Meena D.");
  });

  it("roster has six unique codes", () => {
    expect(new Set(DEMO_ROSTER.map((r) => r.code)).size).toBe(6);
  });
});
