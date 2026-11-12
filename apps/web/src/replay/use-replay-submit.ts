"use client";

import { useEffect, useState, type Dispatch } from "react";
import { newRequestId, type DataPort } from "@/data/port";
import { buildSubmit, SUBMIT_RETRY_MS, SubmitRequestIds } from "@/replay/decide";
import type { ReplayAction, ReplayState } from "@/replay/machine";

/**
 * T7: the submit is automatic once the last Decide step is done. A failure keeps the answers and
 * retries every 5 s with the SAME request_id, so a flaky network cannot score a practice twice.
 * "Practise again" bumps `attempt`, which takes a new id.
 */
export function useReplaySubmit(port: DataPort, replayId: string, state: ReplayState, dispatch: Dispatch<ReplayAction>) {
  const [ids] = useState(() => new SubmitRequestIds(newRequestId));
  const { phase, submitFailed, attempt, openOrder, choices } = state;

  useEffect(() => {
    if (phase !== "submitting" || submitFailed) return;
    let live = true;
    void port
      .replaySubmit(buildSubmit(replayId, ids.forAttempt(attempt), openOrder, choices))
      .then((debrief) => {
        if (live) dispatch({ type: "submitted", debrief });
      })
      .catch(() => {
        if (live) dispatch({ type: "submit_failed" });
      });
    return () => {
      live = false;
    };
  }, [port, replayId, ids, phase, submitFailed, attempt, openOrder, choices, dispatch]);

  useEffect(() => {
    if (phase !== "submitting" || !submitFailed) return;
    const id = setInterval(() => dispatch({ type: "retry_submit" }), SUBMIT_RETRY_MS);
    return () => clearInterval(id);
  }, [phase, submitFailed, dispatch]);
}
