import { describe, expect, it } from "vitest";
import {
  clampStep,
  GUIDE_MAX_DURATION_MS,
  GUIDE_STEP_COUNT,
  GUIDE_STEP_IDS,
  GUIDE_STEPS,
  isFirstStep,
  isLastStep,
  nextStep,
  prevStep,
  railStateFor,
  stepAt,
  stepForKey,
} from "./guide-steps";

describe("the guide's four steps", () => {
  it("is one step per Replay phase, in the order the operator meets them", () => {
    expect(GUIDE_STEPS.map((s) => s.id)).toEqual(["brief", "investigate", "decide", "debrief"]);
    expect(GUIDE_STEP_COUNT).toBe(4);
    expect(GUIDE_STEP_IDS).toHaveLength(4);
  });
  it("gives every step its own figure", () => {
    expect(new Set(GUIDE_STEPS.map((s) => s.figure)).size).toBe(GUIDE_STEP_COUNT);
  });
  it("keeps every animation inside the training motion budget", () => {
    for (const step of GUIDE_STEPS) {
      expect(step.durationMs).toBeGreaterThan(0);
      expect(step.durationMs).toBeLessThanOrEqual(GUIDE_MAX_DURATION_MS);
    }
  });
});

describe("moving through the sequence", () => {
  it("clamps anything that is not a step index", () => {
    expect(clampStep(-4)).toBe(0);
    expect(clampStep(99)).toBe(3);
    expect(clampStep(1.7)).toBe(1);
    expect(clampStep(Number.NaN)).toBe(0);
  });
  it("stops at both ends instead of wrapping", () => {
    expect(prevStep(0)).toBe(0);
    expect(nextStep(3)).toBe(3);
    expect(nextStep(0)).toBe(1);
    expect(prevStep(3)).toBe(2);
  });
  it("knows the first and last step", () => {
    expect(isFirstStep(0)).toBe(true);
    expect(isFirstStep(1)).toBe(false);
    expect(isLastStep(3)).toBe(true);
    expect(isLastStep(2)).toBe(false);
  });
  it("resolves a step for any index", () => {
    expect(stepAt(2).id).toBe("decide");
    expect(stepAt(50).id).toBe("debrief");
  });
});

describe("keyboard movement", () => {
  it("walks the sequence with the arrow keys and jumps with Home/End", () => {
    expect(stepForKey(1, "ArrowRight")).toBe(2);
    expect(stepForKey(1, "ArrowLeft")).toBe(0);
    expect(stepForKey(1, "PageDown")).toBe(2);
    expect(stepForKey(1, "PageUp")).toBe(0);
    expect(stepForKey(1, "Home")).toBe(0);
    expect(stepForKey(1, "End")).toBe(3);
  });
  it("returns the same step for a key it does not own, so the browser keeps it", () => {
    expect(stepForKey(2, "Tab")).toBe(2);
    expect(stepForKey(2, "Enter")).toBe(2);
    expect(stepForKey(2, " ")).toBe(2);
  });
});

describe("the step rail", () => {
  it("marks the steps behind, on and ahead of the current one", () => {
    expect(railStateFor(0, 2)).toBe("done");
    expect(railStateFor(2, 2)).toBe("current");
    expect(railStateFor(3, 2)).toBe("todo");
  });
});
