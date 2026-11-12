/**
 * Phase 3 Decide, as pure helpers (interaction-map T5, T6, T7) so the rules are tested in node and
 * the components stay thin renderers. The machine owns the transitions; this file owns what a step
 * records and how the submit is built and retried.
 */
import type { ReplayChoice } from "@/replay/machine";

/** T5: the chosen plate shows inverted for this long, the step locked, before it advances. */
export const SELECT_HOLD_MS = 400;
/** T7: while the submit fails, the same request is retried this often. */
export const SUBMIT_RETRY_MS = 5_000;

/** T6: a tap numbers the next choice; a tap on the LAST numbered choice removes its number. */
export function toggleOrder(sequence: readonly string[], id: string): string[] {
  const at = sequence.indexOf(id);
  if (at === -1) return [...sequence, id];
  return at === sequence.length - 1 ? sequence.slice(0, -1) : [...sequence];
}

/** The number shown on a plate (1..n), or null while it is not yet in the sequence. */
export function orderNumber(sequence: readonly string[], id: string): number | null {
  const at = sequence.indexOf(id);
  return at === -1 ? null : at + 1;
}

/** [Confirm order] is enabled when every choice is numbered. */
export function orderComplete(sequence: readonly string[], choiceCount: number): boolean {
  return choiceCount > 0 && sequence.length === choiceCount;
}

/** The `replay_submit` input. A step that timed out is simply absent from `choices`. */
export function buildSubmit(
  replayId: string,
  requestId: string,
  openOrder: readonly string[],
  choices: readonly ReplayChoice[],
) {
  return {
    p_replay_id: replayId,
    p_request_id: requestId,
    p_open_order: [...openOrder],
    p_choices: choices.map((c) => ({ step: c.step, choice_ids: [...c.choice_ids], ms: Math.max(0, Math.round(c.ms)) })),
  };
}

/**
 * One request_id per attempt, reused on every retry (interaction-map §3): the server treats a
 * repeat as the same submission, so a flaky network can never score a practice twice. A new
 * attempt ("Practise again") asks for a new id.
 */
export class SubmitRequestIds {
  private current: { attempt: number; id: string } | null = null;
  constructor(private readonly make: () => string) {}

  forAttempt(attempt: number): string {
    if (this.current === null || this.current.attempt !== attempt) this.current = { attempt, id: this.make() };
    return this.current.id;
  }
}

/** A submit with no answer for this long is treated as failed, so a dead link cannot hang "Scoring…". */
export const SUBMIT_TIMEOUT_MS = 12_000;
