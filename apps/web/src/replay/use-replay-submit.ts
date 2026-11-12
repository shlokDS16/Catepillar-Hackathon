"use client";

import { useCallback, useEffect, useState, type Dispatch } from "react";
import { newRequestId, type DataPort } from "@/data/port";
import { buildSubmit, SUBMIT_RETRY_MS, SUBMIT_TIMEOUT_MS, SubmitRequestIds } from "@/replay/decide";
import type { ReplayAction, ReplayState } from "@/replay/machine";

/**
 * T7: the submit is automatic once the last Decide step is done. A failure keeps the answers and
 * retries every 5 s with the SAME request_id, so a flaky network cannot score a practice twice.
 * A request with no answer after 12 s counts as failed, so a dead link cannot hang "Scoring…".
 * `submitFailed` stays true across retries (the failed plate and its button stay mounted) and
 * clears only when the score lands. "Practise again" bumps `attempt`, which takes a new id.
 *
 * Returns `retryNow`, for the [Try again] button.
 */
export function useReplaySubmit(port: DataPort, replayId: string, state: ReplayState, dispatch: Dispatch<ReplayAction>) {
  const [ids] = useState(() => new SubmitRequestIds(newRequestId));
  const [kick, setKick] = useState(0);
  const { phase, attempt, openOrder, choices } = state;

  useEffect(() => {
    if (phase !== "submitting") return;
    let live = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const send = () => {
      let hung: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        hung = setTimeout(() => reject(new Error("submit timed out")), SUBMIT_TIMEOUT_MS);
      });
      Promise.race([port.replaySubmit(buildSubmit(replayId, ids.forAttempt(attempt), openOrder, choices)), timeout])
        .then((debrief) => {
          if (live) dispatch({ type: "submitted", debrief });
        })
        .catch(() => {
          if (!live) return;
          dispatch({ type: "submit_failed" });
          retryTimer = setTimeout(send, SUBMIT_RETRY_MS);
        })
        .finally(() => clearTimeout(hung));
    };
    send();

    return () => {
      live = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [port, replayId, ids, phase, attempt, openOrder, choices, dispatch, kick]);

  return useCallback(() => setKick((k) => k + 1), []);
}
