import { describe, expect, it } from "vitest";
import { replayDebrief, replayScenario } from "@cat/shared/fixtures";
import type { ReplayDebriefResult, ReplayScenario } from "@cat/shared";
import {
  currentStep,
  initialReplayState,
  investigateBudgetS,
  needsLeaveConfirm,
  openLimitReached,
  replayReduce,
  type ReplayAction,
  type ReplayState,
} from "./machine";

const scenario = replayScenario as ReplayScenario;
const debrief = replayDebrief as ReplayDebriefResult;
const cardIds = scenario.investigate.cards.map((c) => c.id);
const stepCount = scenario.decide.steps.length;

/** Apply a list of actions from the initial state. */
function run(...actions: ReplayAction[]): ReplayState {
  return actions.reduce(replayReduce, initialReplayState());
}

const loaded = (): ReplayState => run({ type: "loaded", scenario });
const investigating = (): ReplayState => run({ type: "loaded", scenario }, { type: "start" });
const deciding = (): ReplayState =>
  replayReduce(replayReduce(investigating(), { type: "open_card", cardId: cardIds[0] }), { type: "decide_now" });

/** Answers every Decide step, which lands the run in SUBMITTING. */
function answerAll(from: ReplayState): ReplayState {
  let s = from;
  for (let i = 0; i < stepCount; i += 1) s = replayReduce(s, { type: "answer", choiceIds: ["x"], ms: 1_000 });
  return s;
}

describe("LOADING", () => {
  it("starts in LOADING with nothing recorded", () => {
    const s = initialReplayState();
    expect(s.phase).toBe("loading");
    expect(s).toMatchObject({ scenario: null, step: 0, openOrder: [], choices: [], paused: false, leavingTo: null });
  });
  it("loaded → BRIEF and keeps the scenario", () => {
    const s = loaded();
    expect(s.phase).toBe("brief");
    expect(s.scenario).toBe(scenario);
    expect(investigateBudgetS(s)).toBe(scenario.brief.time_budget_s);
  });
  it("load_failed → LOAD_FAILED, and retry_load goes back to LOADING with a new load count", () => {
    const failed = run({ type: "load_failed" });
    expect(failed.phase).toBe("load_failed");
    const again = replayReduce(failed, { type: "retry_load" });
    expect(again.phase).toBe("loading");
    expect(again.loads).toBe(1);
  });
  it("ignores a second load answer once it has left LOADING", () => {
    expect(replayReduce(loaded(), { type: "load_failed" })).toEqual(loaded());
    expect(replayReduce(loaded(), { type: "loaded", scenario })).toEqual(loaded());
    expect(replayReduce(loaded(), { type: "retry_load" })).toEqual(loaded());
  });
});

describe("BRIEF", () => {
  it("is untimed and start → INVESTIGATE with an empty record (Decision 2)", () => {
    const s = replayReduce(loaded(), { type: "start" });
    expect(s.phase).toBe("investigate");
    expect(s).toMatchObject({ step: 0, openOrder: [], choices: [], submitFailed: false });
  });
  it("ignores start from any other phase", () => {
    expect(replayReduce(investigating(), { type: "start" }).phase).toBe("investigate");
    expect(replayReduce(initialReplayState(), { type: "start" }).phase).toBe("loading");
  });
});

describe("INVESTIGATE", () => {
  it("open_card records the first open only, in order", () => {
    let s = investigating();
    s = replayReduce(s, { type: "open_card", cardId: cardIds[1] });
    s = replayReduce(s, { type: "open_card", cardId: cardIds[0] });
    const before = s;
    s = replayReduce(s, { type: "open_card", cardId: cardIds[1] }); // re-opening is free
    expect(s).toBe(before);
    expect(s.openOrder).toEqual([cardIds[1], cardIds[0]]);
  });
  it("max_open is a hard limit", () => {
    const max = scenario.investigate.max_open;
    expect(max).not.toBeNull();
    let s = investigating();
    for (const id of cardIds) s = replayReduce(s, { type: "open_card", cardId: id });
    expect(s.openOrder).toHaveLength(max as number);
    expect(openLimitReached(s)).toBe(true);
  });
  it("decide_now needs one opened card and moves to DECIDE step 1", () => {
    const none = replayReduce(investigating(), { type: "decide_now" });
    expect(none.phase).toBe("investigate");
    const s = deciding();
    expect(s.phase).toBe("decide");
    expect(s.step).toBe(1);
    expect(currentStep(s)).toEqual(scenario.decide.steps[0]);
  });
  it("investigate_timeout moves on with the cards opened so far, even none", () => {
    const s = replayReduce(investigating(), { type: "investigate_timeout" });
    expect(s.phase).toBe("decide");
    expect(s.step).toBe(1);
    expect(s.openOrder).toEqual([]);
  });
  it("ignores open_card and decide_now outside INVESTIGATE", () => {
    expect(replayReduce(loaded(), { type: "open_card", cardId: cardIds[0] }).openOrder).toEqual([]);
    expect(replayReduce(deciding(), { type: "investigate_timeout" }).step).toBe(1);
  });
});

describe("DECIDE", () => {
  it("answer records {step, choice_ids, ms} and advances", () => {
    const s = replayReduce(deciding(), { type: "answer", choiceIds: ["stop"], ms: 2_400 });
    expect(s.phase).toBe("decide");
    expect(s.step).toBe(2);
    expect(s.choices).toEqual([{ step: 1, choice_ids: ["stop"], ms: 2_400 }]);
  });
  it("a timed-out step is absent from the recorded choices (UI-18)", () => {
    let s = replayReduce(deciding(), { type: "step_timeout" });
    expect(s.step).toBe(2);
    s = replayReduce(s, { type: "answer", choiceIds: ["belt"], ms: 900 });
    expect(s.choices.map((c) => c.step)).toEqual([2]);
  });
  it("the last step goes to SUBMITTING, with no Submit button anywhere", () => {
    const s = answerAll(deciding());
    expect(s.phase).toBe("submitting");
    expect(s.step).toBe(0);
    expect(s.choices).toHaveLength(stepCount);
    expect(currentStep(s)).toBeNull();
  });
  it("every step timing out still reaches SUBMITTING with no choices", () => {
    let s = deciding();
    for (let i = 0; i < stepCount; i += 1) s = replayReduce(s, { type: "step_timeout" });
    expect(s.phase).toBe("submitting");
    expect(s.choices).toEqual([]);
  });
  it("ignores answer and step_timeout outside DECIDE", () => {
    expect(replayReduce(investigating(), { type: "answer", choiceIds: ["a"], ms: 1 }).choices).toEqual([]);
    expect(replayReduce(loaded(), { type: "step_timeout" }).phase).toBe("brief");
  });
});

describe("SUBMITTING → DEBRIEF", () => {
  const submitting = () => answerAll(deciding());
  it("submitted → DEBRIEF with the result", () => {
    const s = replayReduce(submitting(), { type: "submitted", debrief });
    expect(s.phase).toBe("debrief");
    expect(s.debrief).toBe(debrief);
    expect(s.submitFailed).toBe(false);
  });
  it("submit_failed keeps the answers and retry_submit clears the message", () => {
    const failed = replayReduce(submitting(), { type: "submit_failed" });
    expect(failed.phase).toBe("submitting");
    expect(failed.submitFailed).toBe(true);
    expect(failed.choices).toHaveLength(stepCount);
    const retrying = replayReduce(failed, { type: "retry_submit" });
    expect(retrying.submitFailed).toBe(false);
    expect(replayReduce(retrying, { type: "retry_submit" })).toBe(retrying);
  });
  it("ignores a submit answer outside SUBMITTING", () => {
    expect(replayReduce(deciding(), { type: "submitted", debrief }).phase).toBe("decide");
    expect(replayReduce(deciding(), { type: "submit_failed" }).submitFailed).toBe(false);
  });
  it("practise_again restarts at the Brief with the cached scenario and a new attempt", () => {
    const done = replayReduce(submitting(), { type: "submitted", debrief });
    const again = replayReduce(done, { type: "practise_again" });
    expect(again.phase).toBe("brief");
    expect(again.scenario).toBe(scenario);
    expect(again).toMatchObject({ attempt: 1, choices: [], openOrder: [], debrief: null });
    expect(replayReduce(deciding(), { type: "practise_again" }).phase).toBe("decide");
  });
});

describe("PAUSED (a live Warning or Critical alert)", () => {
  it("freezes the run in any phase and resumes in the same phase", () => {
    for (const s of [loaded(), investigating(), deciding(), answerAll(deciding())]) {
      const paused = replayReduce(s, { type: "pause" });
      expect(paused.paused).toBe(true);
      expect(paused.phase).toBe(s.phase);
      const resumed = replayReduce(paused, { type: "resume" });
      expect(resumed.paused).toBe(false);
      expect(resumed.phase).toBe(s.phase);
    }
  });
  it("pause and resume are idempotent", () => {
    const paused = replayReduce(investigating(), { type: "pause" });
    expect(replayReduce(paused, { type: "pause" })).toBe(paused);
    expect(replayReduce(investigating(), { type: "resume" })).toEqual(investigating());
  });
  it("holds every operator action while frozen", () => {
    const paused = replayReduce(investigating(), { type: "pause" });
    expect(replayReduce(paused, { type: "open_card", cardId: cardIds[0] })).toBe(paused);
    expect(replayReduce(paused, { type: "decide_now" })).toBe(paused);
    expect(replayReduce(paused, { type: "investigate_timeout" })).toBe(paused);
    const pausedBrief = replayReduce(loaded(), { type: "pause" });
    expect(replayReduce(pausedBrief, { type: "start" })).toBe(pausedBrief);
  });
  it("still accepts the answers the server sends back", () => {
    const pausedSubmitting = replayReduce(answerAll(deciding()), { type: "pause" });
    expect(replayReduce(pausedSubmitting, { type: "submitted", debrief }).phase).toBe("debrief");
    expect(replayReduce(pausedSubmitting, { type: "submit_failed" }).submitFailed).toBe(true);
    const pausedLoading = replayReduce(initialReplayState(), { type: "pause" });
    expect(replayReduce(pausedLoading, { type: "loaded", scenario }).phase).toBe("brief");
    expect(replayReduce(pausedLoading, { type: "load_failed" }).phase).toBe("load_failed");
  });
});

describe("leaving (T10)", () => {
  it("every phase before the Debrief asks first", () => {
    for (const s of [initialReplayState(), loaded(), investigating(), deciding(), answerAll(deciding())]) {
      expect(needsLeaveConfirm(s.phase)).toBe(true);
      expect(replayReduce(s, { type: "ask_leave", href: "/op" }).leavingTo).toBe("/op");
    }
  });
  it("the Debrief leaves without a confirmation", () => {
    const done = replayReduce(answerAll(deciding()), { type: "submitted", debrief });
    expect(needsLeaveConfirm(done.phase)).toBe(false);
    expect(replayReduce(done, { type: "ask_leave", href: "/op" })).toBe(done);
  });
  it("cancel_leave closes the confirmation and keeps the phase", () => {
    const asked = replayReduce(deciding(), { type: "ask_leave", href: "/op/safety" });
    const back = replayReduce(asked, { type: "cancel_leave" });
    expect(back.leavingTo).toBeNull();
    expect(back.phase).toBe("decide");
    expect(replayReduce(back, { type: "cancel_leave" })).toBe(back);
  });
  it("can still be asked while the run is frozen", () => {
    const paused = replayReduce(deciding(), { type: "pause" });
    expect(replayReduce(paused, { type: "ask_leave", href: "/op" }).leavingTo).toBe("/op");
  });
});
