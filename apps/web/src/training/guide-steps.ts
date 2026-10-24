/**
 * "How practice works": the four steps of the guided introduction, one per Replay phase
 * (D10, screens.md S5b). Pure data and pure navigation, so the sequence can be tested without a
 * DOM. Every string is a message key under the `guide` namespace; nothing user-visible lives here.
 */

/** The four Replay phases, in the order the operator meets them. Mirrors RAIL_PHASES (R1). */
export const GUIDE_STEP_IDS = ["brief", "investigate", "decide", "debrief"] as const;
export type GuideStepId = (typeof GUIDE_STEP_IDS)[number];

/** Which figure a step draws. One figure per step; the figure demonstrates the step's one idea. */
export type GuideFigureId = "read" | "fan" | "clock" | "trace";

export type GuideStep = {
  id: GuideStepId;
  figure: GuideFigureId;
  /**
   * How long the step's animation runs, in ms. The sheet does not wait for it — this is the
   * budget the CSS is written against, kept here so the test can hold it to the carve-out
   * (visual-language §5.1 allows a longer animation inside training only).
   */
  durationMs: number;
};

/** The longest single animation allowed inside the training carve-out, excluding the re-enactment. */
export const GUIDE_MAX_DURATION_MS = 2400;

export const GUIDE_STEPS: readonly GuideStep[] = [
  { id: "brief", figure: "read", durationMs: 1800 },
  { id: "investigate", figure: "fan", durationMs: 2200 },
  { id: "decide", figure: "clock", durationMs: 2000 },
  { id: "debrief", figure: "trace", durationMs: 2400 },
];

export const GUIDE_STEP_COUNT = GUIDE_STEPS.length;

/** Clamps any index into the sequence; a bad index can only come from a stale render. */
export function clampStep(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(GUIDE_STEP_COUNT - 1, Math.max(0, Math.trunc(index)));
}

export function stepAt(index: number): GuideStep {
  return GUIDE_STEPS[clampStep(index)];
}

/** The last step's "next" stays on the last step: finishing is a separate action, not a step. */
export function nextStep(index: number): number {
  return clampStep(clampStep(index) + 1);
}

export function prevStep(index: number): number {
  return clampStep(clampStep(index) - 1);
}

export function isFirstStep(index: number): boolean {
  return clampStep(index) === 0;
}

export function isLastStep(index: number): boolean {
  return clampStep(index) === GUIDE_STEP_COUNT - 1;
}

/**
 * Keyboard movement through the sequence (left/right, home/end). Returns the same index when the
 * key is not ours, so the caller can tell "handled" from "let the browser have it".
 */
export function stepForKey(index: number, key: string): number {
  // Arrows only. PageUp/PageDown/Home/End belong to the sheet, which scrolls at 375 px, and
  // taking them made a reachable panel unscrollable by keyboard. The caller additionally
  // refuses any modified key, so Alt+Left still means Back.
  switch (key) {
    case "ArrowRight":
      return nextStep(index);
    case "ArrowLeft":
      return prevStep(index);
    default:
      return clampStep(index);
  }
}

/** Marker state for the step rail: the same three words the Replay phase rail uses. */
export type GuideRailState = "done" | "current" | "todo";

export function railStateFor(stepIndex: number, currentIndex: number): GuideRailState {
  const current = clampStep(currentIndex);
  if (stepIndex < current) return "done";
  if (stepIndex === current) return "current";
  return "todo";
}

/**
 * What the Investigate phase actually allows, shown in the guide's Investigate rule. Taken from
 * the scenario the fixtures ship (replayScenario.brief.time_budget_s is the Investigate budget,
 * per the contract comment, and investigate.max_open is the hard cap). When a scenario is loaded
 * from the server these should come from it; until the guide is opened from inside a replay it
 * describes the shape every scenario has.
 */
export const INVESTIGATE_BUDGET_S = 60;
export const INVESTIGATE_MAX_OPEN = 4;
