/**
 * Fixture-only scoring for the Replay Debrief. The live path never has the answer key on the client
 * (api-contracts §5: it stays server-side until `replay_submit`); this module exists so the
 * FixtureAdapter can answer a submit from what the operator actually did, not from a canned result.
 * The rules are pure so they are unit-tested in node.
 */
import type { ReplayDebriefResult, ReplayScenario } from "@cat/shared";
import type { I18nText } from "@/data/types";

export type SubmitInput = {
  p_open_order: readonly string[];
  p_choices: readonly { step: number; choice_ids: readonly string[]; ms: number }[];
};

export type AnswerKey = {
  /** Every card with whether it mattered and why. */
  cards: { card_id: string; relevant: boolean; why: I18nText }[];
  /** The path a careful operator opens, in order. */
  ideal: string[];
  /** Best choice(s) per step; for an "order" step the correct sequence. */
  steps: { step: number; best: string[]; why: I18nText }[];
  rule: ReplayDebriefResult["rule"];
  lesson_code: string | null;
};

const pct = (n: number, d: number) => (d === 0 ? 100 : Math.round((n / d) * 1000) / 10);

const sameSequence = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Rules (one place, so the screen and the tests agree):
 * - Only the first `max_open` opened ids count; repeats are ignored.
 * - efficiency = relevant cards opened / max(cards opened, ideal path length).
 * - procedure = Decide steps answered exactly right / all steps. A timed-out step is `chosen: []`
 *   and counts wrong. An "order" step is right only in the exact sequence; a "single" step on equal sets.
 * - safety = the same, over "single" steps only (the immediate-action choices).
 */
export function scoreReplay(scenario: ReplayScenario, key: AnswerKey, input: SubmitInput): ReplayDebriefResult {
  const max = scenario.investigate.max_open ?? Number.POSITIVE_INFINITY;
  const opened = input.p_open_order.filter((id, i, all) => all.indexOf(id) === i).slice(0, max);
  const relevantIds = new Set(key.cards.filter((c) => c.relevant).map((c) => c.card_id));
  const relevantOpened = opened.filter((id) => relevantIds.has(id)).length;

  const rows = scenario.decide.steps.map((def) => {
    const k = key.steps.find((s) => s.step === def.step);
    const best = k?.best ?? [];
    const given = input.p_choices.find((c) => c.step === def.step);
    const chosen = given ? [...given.choice_ids] : [];
    const correct =
      chosen.length > 0 &&
      (def.kind === "order"
        ? sameSequence(chosen, best)
        : chosen.length === best.length && best.every((b) => chosen.includes(b)));
    return { def, k, best, chosen, correct };
  });

  const single = rows.filter((r) => r.def.kind === "single");
  return {
    scores: {
      safety: pct(single.filter((r) => r.correct).length, single.length),
      procedure: pct(rows.filter((r) => r.correct).length, rows.length),
      efficiency: pct(relevantOpened, Math.max(opened.length, key.ideal.length)),
    },
    process_trace: { opened, ideal: key.ideal, relevant: key.cards },
    review: rows.map((r) => ({
      step: r.def.step,
      chosen: r.chosen,
      best: r.best,
      why:
        r.chosen.length === 0
          ? { en: `Time ran out. ${r.k?.why.en ?? ""}`.trim(), hi: r.k?.why.hi ? `समय समाप्त। ${r.k.why.hi}` : undefined }
          : (r.k?.why ?? { en: "" }),
    })),
    rule: key.rule,
    lesson_code: key.lesson_code,
  };
}

const i = (en: string, hi: string): I18nText => ({ en, hi });

/** The answer key for the fixture scenario (`replayScenario` in @cat/shared/fixtures). Fixtures only. */
export const fixtureAnswerKey: AnswerKey = {
  cards: [
    { card_id: "c_trend", relevant: true, why: i("Pitch crossed 15° while the machine was moving.", "चलते समय झुकाव 15° से ऊपर गया।") },
    { card_id: "c_map", relevant: true, why: i("Bench 3 is the slope zone where it happened.", "बेंच 3 वही ढलान क्षेत्र है जहाँ यह हुआ।") },
    { card_id: "c_card", relevant: true, why: i("The protocol card sets the seatbelt rule for slopes.", "प्रोटोकॉल कार्ड ढलान पर सीटबेल्ट का नियम बताता है।") },
    { card_id: "c_wind", relevant: false, why: i("Wind was light and did not cause this.", "हवा हल्की थी और कारण नहीं थी।") },
    { card_id: "c_fault", relevant: false, why: i("The oil pressure code is unrelated to the seatbelt.", "तेल दबाव कोड का सीटबेल्ट से संबंध नहीं।") },
    { card_id: "c_weather", relevant: false, why: i("Heat did not cause this.", "गर्मी कारण नहीं थी।") },
    { card_id: "c_shift", relevant: false, why: i("Hours on shift were normal.", "शिफ्ट के घंटे सामान्य थे।") },
  ],
  ideal: ["c_trend", "c_map", "c_card"],
  steps: [
    { step: 1, best: ["stop"], why: i("Stop first, before anything else.", "सबसे पहले रोकें।") },
    { step: 2, best: ["belt"], why: i("Fasten the seatbelt before moving again.", "फिर से चलने से पहले सीटबेल्ट लगाएँ।") },
    { step: 3, best: ["a", "b", "c"], why: i("Park, report, then resume.", "पार्क करें, रिपोर्ट करें, फिर शुरू करें।") },
  ],
  rule: {
    card_id: "seatbelt_slopes",
    audio_id: "replay.safety.seatbelt_breach.rule",
    text: i("Seatbelt on before the machine moves; never on a slope without it.", "मशीन चलने से पहले सीटबेल्ट; ढलान पर कभी बिना नहीं।"),
  },
  lesson_code: "seatbelt_slopes",
};
