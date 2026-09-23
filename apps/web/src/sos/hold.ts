/**
 * Hold-to-arm timing for SOS (interaction-map A10), kept pure so vitest covers it without a DOM.
 * Hold 1.5 s with haptic ticks at 0.5 s and 1.0 s; release before 1.5 s sends nothing.
 */
export const SOS_HOLD_MS = 1_500;
export const SOS_TICKS_MS = [500, 1_000] as const;
export const SOS_TICK_PATTERN = [40];
/** Cancel is offered for this long after a successful send (A11). */
export const SOS_CANCEL_WINDOW_MS = 10_000;
/** A failed send retries with the same request_id at this cadence. */
export const SOS_RETRY_MS = 5_000;

export type HoldState =
  | { phase: "idle" }
  | { phase: "holding"; startedAt: number; requestId: string; ticksFired: number }
  | { phase: "armed"; requestId: string };

export type HoldEvent = { type: "press"; at: number; requestId: string } | { type: "tick"; at: number } | { type: "release"; at: number };

/** Returns the next state and whether a haptic tick fires now. */
export function holdReducer(state: HoldState, event: HoldEvent): { state: HoldState; tick: boolean } {
  switch (event.type) {
    case "press":
      if (state.phase !== "idle") return { state, tick: false };
      return { state: { phase: "holding", startedAt: event.at, requestId: event.requestId, ticksFired: 0 }, tick: false };
    case "tick": {
      if (state.phase !== "holding") return { state, tick: false };
      const held = event.at - state.startedAt;
      if (held >= SOS_HOLD_MS) return { state: { phase: "armed", requestId: state.requestId }, tick: false };
      const due = SOS_TICKS_MS.filter((t) => held >= t).length;
      if (due > state.ticksFired) return { state: { ...state, ticksFired: due }, tick: true };
      return { state, tick: false };
    }
    case "release":
      // Releasing before 1.5 s sends nothing; the request_id is discarded with the hold.
      if (state.phase === "holding") return { state: { phase: "idle" }, tick: false };
      return { state, tick: false };
  }
}

/** Fraction of the hold completed, for the fill. Stepped to quarters under reduced motion. */
export function holdProgress(state: HoldState, now: number, stepped = false): number {
  if (state.phase === "armed") return 1;
  if (state.phase !== "holding") return 0;
  const p = Math.min(1, (now - state.startedAt) / SOS_HOLD_MS);
  return stepped ? Math.floor(p * 4) / 4 : p;
}
