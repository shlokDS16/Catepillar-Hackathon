import { describe, expect, it } from "vitest";
import {
  biasLine, conditionsPresent, evidenceValue, fmtMin, groupsFor, maxMinutes, modelBeats, parseRows, pickDefault, totalN, weightedMae,
} from "./analytics";
import { DEMO_EVIDENCE, DEMO_ROWS } from "./fixtures";

const rows = parseRows(DEMO_ROWS);

describe("grouping and selector filtering", () => {
  it("returns all 5 task types for hot, in fixed order", () => {
    expect(groupsFor(rows, "hot").map((g) => g.task)).toEqual(["excavation", "trenching", "material_loading", "grading", "demolition"]);
  });
  it("filters by condition and omits absent task types instead of zero-filling", () => {
    const rain = groupsFor(rows, "rain");
    expect(rain.map((g) => g.task)).toEqual(["excavation", "grading"]);
    expect(groupsFor(rows, "fog")).toEqual([]);
  });
  it("lists present conditions in fixed order and defaults to hot, else first present", () => {
    expect(conditionsPresent(rows)).toEqual(["clear", "hot", "rain"]);
    expect(pickDefault(rows)).toBe("hot");
    expect(pickDefault(rows.filter((r) => r.condition !== "hot"))).toBe("clear");
    expect(pickDefault([])).toBeNull();
  });
  it("dims n < 10 and sums n", () => {
    const hot = groupsFor(rows, "hot");
    expect(hot.find((g) => g.task === "grading")?.few).toBe(true);
    expect(hot.find((g) => g.task === "demolition")?.few).toBe(false);
    expect(totalN(hot)).toBe(42 + 31 + 55 + 6 + 18);
  });
});

describe("bias (mean estimate minus actual, minutes)", () => {
  it("negative is short, positive is over, units are whole minutes", () => {
    expect(biasLine(-8.1)).toEqual({ kind: "short", minutes: 8 });
    expect(biasLine(1.6)).toEqual({ kind: "over", minutes: 2 });
  });
  it("under half a minute reads exact; null is unknown, never exact", () => {
    expect(biasLine(0.4, 0.6)).toEqual({ kind: "exact", minutes: 0 });
    expect(biasLine(-0.49, 0.8)).toEqual({ kind: "exact", minutes: 0 });
    // errors that cancel on average are not "on target"
    expect(biasLine(0.1, 9)).toEqual({ kind: "flat", minutes: 0 });
    expect(biasLine(0.1)).toEqual({ kind: "flat", minutes: 0 });
    expect(biasLine(null)).toEqual({ kind: "unknown" });
    expect(biasLine(Number.NaN)).toEqual({ kind: "unknown" });
  });
  it("fixture biases follow estimate minus actual", () => {
    const ex = groupsFor(rows, "hot")[0];
    expect(ex.biasOrganiser).toBeCloseTo(50 - 58.1);
    expect(ex.biasModel).toBeCloseTo(56.4 - 58.1);
  });
});

describe("null handling", () => {
  it("keeps a null model P50 as null, with no bias and no zero", () => {
    const demo = groupsFor(rows, "hot").find((g) => g.task === "demolition")!;
    expect(demo.model).toBeNull();
    expect(demo.biasModel).toBeNull();
    expect(fmtMin(demo.model)).toBeNull();
    expect(modelBeats(demo)).toBeNull();
  });
  it("max scale ignores nulls and never returns 0", () => {
    expect(maxMinutes(groupsFor(rows, "hot"))).toBe(96.3);
    expect(fmtMin(50)).toBe("50.0");
    expect(fmtMin(7)).toBe("7.0");
    expect(maxMinutes([])).toBe(1);
  });
  it("drops rows without task type, condition or n; accepts nullable measures", () => {
    const p = parseRows([
      { task_type: null, condition: "hot", n: 3 },
      { task_type: "grading", condition: "hot", n: null },
      { task_type: "grading", condition: "hot", n: 12, mean_actual_min: null, mean_organiser_estimate_min: 5, mean_model_p50_min: null,
        mae_organiser_min: null, mae_model_min: null, bias_organiser_min: null, bias_model_min: null },
      "garbage",
    ]);
    expect(p).toHaveLength(1);
    expect(groupsFor(p, "hot")[0].actual).toBeNull();
  });
  it("weighted MAE skips groups missing either side", () => {
    const w = weightedMae(groupsFor(rows, "hot"))!;
    // excludes grading (n = 6, few) and demolition (model MAE null)
    expect(w.n).toBe(42 + 31 + 55);
    expect(w.organiser).toBeCloseTo(889.5 / 128, 6);
    expect(w.model).toBeCloseTo(527.3 / 128, 6);
    expect(weightedMae(groupsFor(rows, "rain"))?.n).toBe(41);
    expect(weightedMae([])).toBeNull();
  });
  it("evidence: a missing key is null, per-type rows are matched by details.type", () => {
    expect(evidenceValue(DEMO_EVIDENCE, "rag.hit_at_5")).toBeNull();
    expect(evidenceValue(DEMO_EVIDENCE, "detector.precision", "overheat")?.value).toBe(0.88);
    expect(evidenceValue(DEMO_EVIDENCE, "detector.precision", "idle_excess")?.n).toBe(120);
  });
});
