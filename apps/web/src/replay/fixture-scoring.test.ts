import { describe, expect, it } from "vitest";
import { ReplayDebriefResult, type ReplayScenario } from "@cat/shared";
import { replayScenario } from "@cat/shared/fixtures";
import { traceRows } from "./debrief";
import { fixtureAnswerKey, scoreReplay } from "./fixture-scoring";

const scenario = replayScenario as ReplayScenario;
const ms = 1000;

describe("scoreReplay (fixture answer key)", () => {
  it("a perfect run scores 100 and lists every step", () => {
    const r = scoreReplay(scenario, fixtureAnswerKey, {
      p_open_order: ["c_trend", "c_map", "c_card"],
      p_choices: [
        { step: 1, choice_ids: ["stop"], ms },
        { step: 2, choice_ids: ["belt"], ms },
        { step: 3, choice_ids: ["a", "b", "c"], ms },
      ],
    });
    expect(r.scores).toEqual({ safety: 100, procedure: 100, efficiency: 100 });
    expect(r.review.map((x) => x.chosen)).toEqual([["stop"], ["belt"], ["a", "b", "c"]]);
    expect(ReplayDebriefResult.safeParse(r).success).toBe(true);
  });

  it("keeps a step-2 answer and lists a timed-out step 3 as chosen: [] (QA1 HIGH)", () => {
    const r = scoreReplay(scenario, fixtureAnswerKey, {
      p_open_order: ["c_trend", "c_wind"],
      p_choices: [
        { step: 1, choice_ids: ["stop"], ms },
        { step: 2, choice_ids: ["belt"], ms },
      ],
    });
    expect(r.review).toHaveLength(3);
    expect(r.review[1].chosen).toEqual(["belt"]);
    expect(r.review[2]).toMatchObject({ step: 3, chosen: [], best: ["a", "b", "c"] });
    expect(r.scores.safety).toBe(100);
    expect(r.scores.procedure).toBe(66.7);
    expect(r.process_trace.opened).toEqual(["c_trend", "c_wind"]);
  });

  it("a wrong order or a wrong single choice counts wrong", () => {
    const r = scoreReplay(scenario, fixtureAnswerKey, {
      p_open_order: [],
      p_choices: [
        { step: 1, choice_ids: ["continue"], ms },
        { step: 2, choice_ids: ["belt"], ms },
        { step: 3, choice_ids: ["c", "b", "a"], ms },
      ],
    });
    expect(r.scores).toEqual({ safety: 50, procedure: 33.3, efficiency: 0 });
  });

  it("scores only the first max_open cards and ignores repeats", () => {
    const r = scoreReplay(scenario, fixtureAnswerKey, {
      p_open_order: ["c_wind", "c_wind", "c_fault", "c_weather", "c_shift", "c_trend"],
      p_choices: [],
    });
    expect(r.process_trace.opened).toEqual(["c_wind", "c_fault", "c_weather", "c_shift"]);
    expect(r.scores).toEqual({ safety: 0, procedure: 0, efficiency: 0 });
  });

  it("carries a why for every card so missed chips can be explained", () => {
    const r = scoreReplay(scenario, fixtureAnswerKey, { p_open_order: [], p_choices: [] });
    for (const c of scenario.investigate.cards) expect(r.process_trace.relevant.some((x) => x.card_id === c.id)).toBe(true);
  });

  it("shows opened irrelevant cards and gives every missed chip a why (QA1 MED, LOW)", () => {
    const r = scoreReplay(scenario, fixtureAnswerKey, { p_open_order: ["c_trend", "c_wind"], p_choices: [] });
    const you = traceRows(r).you;
    expect(you.map((c) => [c.id, c.kind])).toEqual([
      ["c_trend", "relevant"],
      ["c_wind", "irrelevant"],
      ["c_map", "missed"],
      ["c_card", "missed"],
    ]);
    expect(you.every((c) => c.why !== null)).toBe(true);
  });
});
