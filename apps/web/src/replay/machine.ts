/**
 * The Replay state machine (interaction-map §4.5, D10). Pure and synchronous, so every transition
 * is testable in node and the screen stays a thin renderer.
 *
 *   LOADING ─loaded─► BRIEF ─start─► INVESTIGATE ─(decide_now | timeout)─► DECIDE 1..n
 *                                                     ─(after the last step)─► SUBMITTING ─► DEBRIEF
 *   any phase ── a live Warning/Critical ──► paused (every timer frozen) ── resume ──► the same phase
 *   any phase before DEBRIEF ── back or a nav tap ──► the leave confirmation
 *
 * The answer key never reaches the client before `replay_submit`, so nothing here scores anything.
 */
import type { ReplayDebriefResult, ReplayScenario } from "@cat/shared";

export type ReplayPhase = "loading" | "load_failed" | "brief" | "investigate" | "decide" | "submitting" | "debrief";

/** One recorded Decide step. A step that timed out is absent, which is what `p_choices` needs (UI-18). */
export type ReplayChoice = { step: number; choice_ids: string[]; ms: number };

export type ReplayState = {
  phase: ReplayPhase;
  scenario: ReplayScenario | null;
  /** 1-based position in `decide.steps` while the phase is "decide"; 0 everywhere else. */
  step: number;
  /** Card ids in first-open order (`p_open_order`); re-opening never re-records. */
  openOrder: string[];
  choices: ReplayChoice[];
  debrief: ReplayDebriefResult | null;
  /** Frozen by a live alert. It clears only on an explicit Resume, so an alert costs no training time. */
  paused: boolean;
  /** Where a held navigation was heading; non-null means the leave confirmation is open. */
  leavingTo: string | null;
  /** The submit failed: the answers are kept and the same request_id is reused. */
  submitFailed: boolean;
  /** Bumped by retry_load, so the loading effect runs again. */
  loads: number;
  /** Bumped by practise_again, so timers and the request_id restart. */
  attempt: number;
};

export type ReplayAction =
  | { type: "loaded"; scenario: ReplayScenario }
  | { type: "load_failed" }
  | { type: "retry_load" }
  | { type: "start" }
  | { type: "open_card"; cardId: string }
  | { type: "decide_now" }
  | { type: "investigate_timeout" }
  | { type: "answer"; choiceIds: string[]; ms: number }
  | { type: "step_timeout" }
  | { type: "submitted"; debrief: ReplayDebriefResult }
  | { type: "submit_failed" }
  | { type: "retry_submit" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "ask_leave"; href: string }
  | { type: "cancel_leave" }
  | { type: "practise_again" };

export function initialReplayState(): ReplayState {
  return {
    phase: "loading",
    scenario: null,
    step: 0,
    openOrder: [],
    choices: [],
    debrief: null,
    paused: false,
    leavingTo: null,
    submitFailed: false,
    loads: 0,
    attempt: 0,
  };
}

/** The Debrief is the one phase that leaves without a confirmation (T10). */
export function needsLeaveConfirm(phase: ReplayPhase): boolean {
  return phase !== "debrief";
}

/** The step on screen, or null outside Decide. */
export function currentStep(s: ReplayState) {
  if (s.phase !== "decide" || !s.scenario) return null;
  return s.scenario.decide.steps[s.step - 1] ?? null;
}

/** Investigate's budget in seconds (the Brief itself is untimed, Decision 2). */
export function investigateBudgetS(s: ReplayState): number {
  return s.scenario?.brief.time_budget_s ?? 0;
}

/** At `max_open` the unopened plates are disabled with a reason; null means no limit. */
export function openLimitReached(s: ReplayState): boolean {
  const max = s.scenario?.investigate.max_open ?? null;
  return max !== null && s.openOrder.length >= max;
}

/** A live alert freezes the run; these four actions are the only ones that still apply. */
const WHILE_PAUSED: ReadonlySet<ReplayAction["type"]> = new Set(["pause", "resume", "ask_leave", "cancel_leave"]);
/** Answers from the server land even while frozen: they are not the operator acting. */
const FROM_SERVER: ReadonlySet<ReplayAction["type"]> = new Set(["loaded", "load_failed", "submitted", "submit_failed"]);

/** Moves to the next Decide step, or to SUBMITTING after the last one. */
function advance(s: ReplayState, choices: ReplayChoice[]): ReplayState {
  const total = s.scenario?.decide.steps.length ?? 0;
  const next = s.step + 1;
  if (next > total) return { ...s, phase: "submitting", step: 0, choices, submitFailed: false };
  return { ...s, step: next, choices };
}

export function replayReduce(s: ReplayState, a: ReplayAction): ReplayState {
  if (s.paused && !WHILE_PAUSED.has(a.type) && !FROM_SERVER.has(a.type)) return s;

  switch (a.type) {
    case "loaded":
      return s.phase === "loading" ? { ...s, phase: "brief", scenario: a.scenario } : s;
    case "load_failed":
      return s.phase === "loading" ? { ...s, phase: "load_failed" } : s;
    case "retry_load":
      return s.phase === "load_failed" ? { ...s, phase: "loading", loads: s.loads + 1 } : s;

    case "start":
      return s.phase === "brief"
        ? { ...s, phase: "investigate", step: 0, openOrder: [], choices: [], debrief: null, submitFailed: false }
        : s;

    case "open_card": {
      if (s.phase !== "investigate") return s;
      if (s.openOrder.includes(a.cardId)) return s; // re-opening is free and is never re-recorded
      if (openLimitReached(s)) return s; // max_open is a hard limit (UI-20)
      return { ...s, openOrder: [...s.openOrder, a.cardId] };
    }
    case "decide_now":
      // Disabled until one card is opened (T4); the guard keeps that true for every caller.
      return s.phase === "investigate" && s.openOrder.length > 0 ? { ...s, phase: "decide", step: 1 } : s;
    case "investigate_timeout":
      // At 0 the flow moves on with the cards opened so far, even none.
      return s.phase === "investigate" ? { ...s, phase: "decide", step: 1 } : s;

    case "answer": {
      if (s.phase !== "decide") return s;
      return advance(s, [...s.choices, { step: s.step, choice_ids: a.choiceIds, ms: a.ms }]);
    }
    case "step_timeout":
      // The step is omitted from p_choices; the debrief lists it with `chosen: []`.
      return s.phase === "decide" ? advance(s, s.choices) : s;

    case "submitted":
      return s.phase === "submitting" ? { ...s, phase: "debrief", debrief: a.debrief, submitFailed: false } : s;
    case "submit_failed":
      return s.phase === "submitting" ? { ...s, submitFailed: true } : s;
    case "retry_submit":
      return s.phase === "submitting" && s.submitFailed ? { ...s, submitFailed: false } : s;

    case "pause":
      return s.paused ? s : { ...s, paused: true };
    case "resume":
      return s.paused ? { ...s, paused: false } : s;

    case "ask_leave":
      return needsLeaveConfirm(s.phase) ? { ...s, leavingTo: a.href } : s;
    case "cancel_leave":
      return s.leavingTo === null ? s : { ...s, leavingTo: null };

    case "practise_again":
      // T9: a new attempt from the Brief, reusing the cached scenario with a new request_id.
      if (s.phase !== "debrief" || !s.scenario) return s;
      return { ...initialReplayState(), phase: "brief", scenario: s.scenario, loads: s.loads, attempt: s.attempt + 1 };
  }
}
