import { describe, expect, it, vi } from "vitest";
import { replayScenario } from "@cat/shared/fixtures";
import type { ReplayScenario } from "@cat/shared";
import { buildSubmit, orderComplete, orderNumber, stepTotal, SubmitRequestIds, toggleOrder } from "./decide";
import { currentStep, initialReplayState, replayReduce, type ReplayAction, type ReplayState } from "./machine";

const scenario = replayScenario as ReplayScenario;
const run = (...a: ReplayAction[]): ReplayState => a.reduce(replayReduce, initialReplayState());
const deciding = () =>
  run({ type: "loaded", scenario }, { type: "start" }, { type: "open_card", cardId: scenario.investigate.cards[0].id }, { type: "decide_now" });

describe("Decide steps (single and order)", () => {
  it("records a single step as {step, choice_ids:[id], ms} and advances", () => {
    const s = replayReduce(deciding(), { type: "answer", choiceIds: ["stop"], ms: 3_210 });
    expect(s.choices).toEqual([{ step: 1, choice_ids: ["stop"], ms: 3_210 }]);
    expect(s.step).toBe(2);
    expect(currentStep(s)?.kind).toBe("single");
  });

  it("records an order step with the ids in the tapped sequence", () => {
    let s = deciding();
    s = replayReduce(s, { type: "answer", choiceIds: ["stop"], ms: 1 });
    s = replayReduce(s, { type: "answer", choiceIds: ["belt"], ms: 1 });
    expect(currentStep(s)?.kind).toBe("order");
    s = replayReduce(s, { type: "answer", choiceIds: ["b", "a", "c"], ms: 9_000 });
    expect(s.choices[2]).toEqual({ step: 3, choice_ids: ["b", "a", "c"], ms: 9_000 });
    expect(s.phase).toBe("submitting");
  });

  it("a timed-out step is absent from p_choices", () => {
    let s = deciding();
    s = replayReduce(s, { type: "answer", choiceIds: ["stop"], ms: 100 });
    s = replayReduce(s, { type: "step_timeout" });
    s = replayReduce(s, { type: "answer", choiceIds: ["a", "b", "c"], ms: 100 });
    expect(s.phase).toBe("submitting");
    const input = buildSubmit("r", "q", s.openOrder, s.choices);
    expect(input.p_choices.map((c) => c.step)).toEqual([1, 3]);
    expect(input.p_choices.every((c) => c.choice_ids.length >= 1)).toBe(true);
  });

  it("all steps timed out submits an empty p_choices", () => {
    let s = deciding();
    for (let i = 0; i < stepTotal(scenario); i += 1) s = replayReduce(s, { type: "step_timeout" });
    expect(s.phase).toBe("submitting");
    expect(buildSubmit("r", "q", s.openOrder, s.choices).p_choices).toEqual([]);
  });
});

describe("order selection (T6)", () => {
  it("numbers taps in order and only removes the last number", () => {
    let seq: string[] = [];
    seq = toggleOrder(seq, "a");
    seq = toggleOrder(seq, "b");
    expect(orderNumber(seq, "b")).toBe(2);
    expect(toggleOrder(seq, "a")).toEqual(["a", "b"]); // not the last: ignored
    expect(toggleOrder(seq, "b")).toEqual(["a"]); // last: removed
    expect(orderNumber(seq, "c")).toBeNull();
  });

  it("Confirm is enabled only when every choice is numbered", () => {
    expect(orderComplete(["a", "b"], 3)).toBe(false);
    expect(orderComplete(["a", "b", "c"], 3)).toBe(true);
    expect(orderComplete([], 0)).toBe(false);
  });
});

describe("submit (T7)", () => {
  it("keeps the same request_id across retries and takes a new one per attempt", () => {
    const make = vi.fn().mockReturnValueOnce("id-1").mockReturnValueOnce("id-2");
    const ids = new SubmitRequestIds(make);
    expect(ids.forAttempt(0)).toBe("id-1");
    expect(ids.forAttempt(0)).toBe("id-1");
    expect(ids.forAttempt(0)).toBe("id-1");
    expect(ids.forAttempt(1)).toBe("id-2");
    expect(make).toHaveBeenCalledTimes(2);
  });

  it("a failed submit keeps the answers, and retry rebuilds the identical request", () => {
    let s = deciding();
    for (let i = 0; i < stepTotal(scenario); i += 1) s = replayReduce(s, { type: "answer", choiceIds: ["x"], ms: 5 });
    const first = buildSubmit("r", "q", s.openOrder, s.choices);
    const failed = replayReduce(s, { type: "submit_failed" });
    const retried = replayReduce(failed, { type: "retry_submit" });
    expect(retried.phase).toBe("submitting");
    expect(buildSubmit("r", "q", retried.openOrder, retried.choices)).toEqual(first);
  });
});
