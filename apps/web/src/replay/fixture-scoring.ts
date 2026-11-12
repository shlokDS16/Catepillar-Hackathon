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
  steps: { step: number; best: string[]; axis: "safety" | "procedure"; weight: number; why: I18nText }[];
  rule: ReplayDebriefResult["rule"];
  lesson_code: string | null;
};

const round1 = (x: number) => Math.round(x * 1000) / 10;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Share of the reference's ordered pairs that `given` also has, in the same order (Kendall-style). */
export function pairCredit(reference: readonly string[], given: readonly string[]): number {
  let total = 0;
  let ok = 0;
  for (let a = 0; a < reference.length; a++) {
    for (let b = a + 1; b < reference.length; b++) {
      total++;
      const ia = given.indexOf(reference[a]);
      const ib = given.indexOf(reference[b]);
      if (ia !== -1 && ib !== -1 && ia < ib) ok++;
    }
  }
  return total === 0 ? 1 : ok / total;
}

/**
 * data-model.md section 2.8 (api-contracts section 5, UI-18), in one place so the fixture and the
 * server (B10b) agree:
 * - Only the first `max_open` opened ids count; repeats are ignored (UI-20).
 * - safety = weighted correct choices on safety-axis steps (a timed-out step is wrong).
 * - procedure = 1/2 protocol order (Kendall pair credit on the order step, 0 if it timed out)
 *   + 1/2 investigation, where investigation = 1/2 net relevance (relevant opened minus irrelevant
 *   opened, over relevant cards, floored at 0) + 1/2 order agreement with `ideal` (pair credit).
 *   The 1/2 splits are this fixture's reading of "plus"; section 2.8 gives no weights.
 * - efficiency = steps answered within their countdown (`ms` <= `time_limit_s` x 1000) over all
 *   steps; a timed-out step (absent from `p_choices`) is not within.
 */
export function scoreReplay(scenario: ReplayScenario, key: AnswerKey, input: SubmitInput): ReplayDebriefResult {
  const max = scenario.investigate.max_open ?? Number.POSITIVE_INFINITY;
  const opened = input.p_open_order.filter((id, i, all) => all.indexOf(id) === i).slice(0, max);
  const relevantIds = new Set(key.cards.filter((c) => c.relevant).map((c) => c.card_id));
  const relevantOpened = opened.filter((id) => relevantIds.has(id)).length;
  const irrelevantOpened = opened.length - relevantOpened;
  const net = relevantIds.size === 0 ? 1 : clamp01((relevantOpened - irrelevantOpened) / relevantIds.size);
  const investigation = (net + pairCredit(key.ideal, opened)) / 2;

  const rows = scenario.decide.steps.map((def) => {
    const k = key.steps.find((s) => s.step === def.step);
    const best = k?.best ?? [];
    const given = input.p_choices.find((c) => c.step === def.step);
    const chosen = given ? [...given.choice_ids] : [];
    const correct = chosen.length > 0 && chosen.length === best.length && (def.kind === "order" ? chosen.every((c, n) => c === best[n]) : best.every((b) => chosen.includes(b)));
    const within = given !== undefined && given.ms <= def.time_limit_s * 1000;
    const credit = def.kind === "order" ? (chosen.length > 0 ? pairCredit(best, chosen) : 0) : correct ? 1 : 0;
    return { def, k, best, chosen, within, credit, weight: k?.weight ?? 1, axis: k?.axis ?? "safety" };
  });

  const safetyRows = rows.filter((r) => r.axis === "safety");
  const safetyW = safetyRows.reduce((n, r) => n + r.weight, 0);
  const orderRows = rows.filter((r) => r.def.kind === "order");
  const protocol = orderRows.length === 0 ? 1 : orderRows.reduce((n, r) => n + r.credit, 0) / orderRows.length;

  return {
    scores: {
      safety: safetyW === 0 ? 100 : round1(safetyRows.reduce((n, r) => n + r.weight * r.credit, 0) / safetyW),
      procedure: round1((protocol + investigation) / 2),
      efficiency: rows.length === 0 ? 100 : round1(rows.filter((r) => r.within).length / rows.length),
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
    { step: 1, best: ["stop"], axis: "safety", weight: 1, why: i("Stop first, before anything else.", "सबसे पहले रोकें।") },
    { step: 2, best: ["belt"], axis: "safety", weight: 1, why: i("Fasten the seatbelt before moving again.", "फिर से चलने से पहले सीटबेल्ट लगाएँ।") },
    { step: 3, best: ["a", "b", "c"], axis: "procedure", weight: 1, why: i("Park, report, then resume.", "पार्क करें, रिपोर्ट करें, फिर शुरू करें।") },
  ],
  rule: {
    card_id: "seatbelt_slopes",
    audio_id: "replay.safety.seatbelt_breach.rule",
    text: i("Seatbelt on before the machine moves; never on a slope without it.", "मशीन चलने से पहले सीटबेल्ट; ढलान पर कभी बिना नहीं।"),
  },
  lesson_code: "seatbelt_slopes",
};
