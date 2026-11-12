/** Pure view-models for the Debrief's process trace and decision review (screens.md S5b Phase 4). */
import type { I18nText } from "@/data/types";
import type { ReplayDebriefResult, ReplayScenario } from "@cat/shared";

export type TraceKind =
  /** Opened and it mattered: a filled tick chip. */
  | "relevant"
  /** Opened and it did not matter: an outlined cross chip. */
  | "irrelevant"
  /** It mattered and was never opened: a dashed "missed" chip. */
  | "missed"
  /** The ideal row: what a careful operator opens. */
  | "ideal";

export type TraceChip = { id: string; kind: TraceKind; why: I18nText | null };

/** A card matters if the server says so, else if the ideal path includes it. */
export function isRelevant(result: ReplayDebriefResult, cardId: string): boolean {
  const entry = result.process_trace.relevant.find((r) => r.card_id === cardId);
  return entry ? entry.relevant : result.process_trace.ideal.includes(cardId);
}

function whyFor(result: ReplayDebriefResult, cardId: string): I18nText | null {
  return result.process_trace.relevant.find((r) => r.card_id === cardId)?.why ?? null;
}

/**
 * The two chip rows. "You" is what was opened in order, each marked relevant or irrelevant, then
 * the relevant cards that were never opened as "missed" chips. "Ideal" is the server's path.
 */
export function traceRows(result: ReplayDebriefResult): { you: TraceChip[]; ideal: TraceChip[] } {
  const { opened, ideal, relevant } = result.process_trace;
  const you: TraceChip[] = opened.map((id) => ({
    id,
    kind: isRelevant(result, id) ? "relevant" : "irrelevant",
    why: whyFor(result, id),
  }));
  const missedIds = [...ideal, ...relevant.filter((r) => r.relevant).map((r) => r.card_id)].filter(
    (id, i, all) => !opened.includes(id) && all.indexOf(id) === i,
  );
  for (const id of missedIds) you.push({ id, kind: "missed", why: whyFor(result, id) });
  return { you, ideal: ideal.map((id) => ({ id, kind: "ideal", why: whyFor(result, id) })) };
}

export type ReviewRow = {
  step: number;
  prompt: I18nText | null;
  /** Labels in the order chosen; empty when the step timed out (`chosen: []`). */
  chosen: I18nText[];
  best: I18nText[];
  answered: boolean;
  correct: boolean;
  why: I18nText;
  kind: "single" | "order";
};

/** Joins the review with the scenario's step prompts and choice labels. `chosen: []` is kept. */
export function reviewRows(result: ReplayDebriefResult, scenario: ReplayScenario): ReviewRow[] {
  return result.review.map((r) => {
    const def = scenario.decide.steps.find((s) => s.step === r.step);
    const label = (id: string): I18nText => def?.choices.find((c) => c.id === id)?.label ?? { en: id };
    return {
      step: r.step,
      prompt: def?.prompt ?? null,
      chosen: r.chosen.map(label),
      best: r.best.map(label),
      answered: r.chosen.length > 0,
      correct: r.chosen.length === r.best.length && r.chosen.every((id, i) => id === r.best[i]),
      why: r.why,
      kind: def?.kind ?? "single",
    };
  });
}
