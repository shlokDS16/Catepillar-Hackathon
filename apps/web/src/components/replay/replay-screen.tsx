"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { takeoverQueue } from "@/alerts/selectors";
import { PhaseRail } from "@/components/replay/phase-rail";
import { ReplayBrief } from "@/components/replay/replay-brief";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import { Stub } from "@/components/ui/stub";
import { useAppState, useDataPort } from "@/data/store";
import { heldDestination } from "@/replay/leave-guard";
import { initialReplayState, needsLeaveConfirm, replayReduce } from "@/replay/machine";

/** Where [Leave] goes when the operator pressed Back rather than tapping a destination. */
const TRAINING_HREF = "/op/training";

/**
 * S5b Replay: one route whose phase is internal state, so the browser Back cannot skip into a
 * later phase. The frame label and the phase rail stay on every phase; the persistent chrome and
 * SOS stay; Ask is hidden (AskChip checks the route). R1 builds the shell and Phase 1 Brief;
 * Investigate (R2), Decide (R3) and Debrief (R4) replace their placeholders in the phase block
 * below, reading and dispatching through the same machine.
 */
export function ReplayScreen({ replayId }: { replayId: string }) {
  const port = useDataPort();
  const router = useRouter();
  const t = useTranslations("replay");
  const format = useFormatter();
  const [state, dispatch] = useReducer(replayReduce, undefined, initialReplayState);

  // A live Warning or Critical takes over the screen and freezes the run (visual-language §5.1).
  // It is derived from the alert state during render, never pushed in from an effect; it clears
  // only on an explicit [Resume], so a live alert costs no training time.
  const alerts = useAppState((s) => s.alerts);
  const liveAlert = takeoverQueue(alerts).length > 0;
  if (liveAlert && !state.paused) dispatch({ type: "pause" });

  const { phase, loads } = state;
  useEffect(() => {
    if (phase !== "loading") return;
    let live = true;
    void port
      .replayGet({ p_replay_id: replayId })
      .then((scenario) => {
        if (live) dispatch({ type: "loaded", scenario });
      })
      .catch(() => {
        if (live) dispatch({ type: "load_failed" });
      });
    return () => {
      live = false;
    };
  }, [port, replayId, phase, loads]);

  // T10: Back, or a tap on the nav, the rail or any other link out, asks first. Our own controls
  // call askLeave() directly; this captures the links the persistent chrome owns.
  const guarded = needsLeaveConfirm(phase);
  const leftRef = useRef(false);
  // One sentinel entry for the whole visit. Re-arming the guard (debrief -> practise again) must
  // not push another, or Back needs one extra press per replay and the app reads as frozen.
  const sentinelRef = useRef(false);
  const destRef = useRef(TRAINING_HREF);
  useEffect(() => {
    if (!guarded) return;
    const onClick = (e: MouseEvent) => {
      if (leftRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const href = heldDestination(new URL(anchor.href), window.location.origin, window.location.pathname);
      if (!href) return;
      e.preventDefault();
      dispatch({ type: "ask_leave", href });
    };
    const onPopState = () => {
      // Leaving on purpose: this pop is our own sentinel being consumed, so the current entry is
      // the replay itself. Replace it, and the practice is gone from history for good.
      if (leftRef.current) {
        // A hard replace, not router.replace: inside popstate the App Router's own handling wins
        // and the navigation is dropped (measured — the screen stayed on the replay). Leaving a
        // practice is rare, so the full load is a fair price for a history that is actually clean.
        window.location.replace(destRef.current);
        return;
      }
      window.history.pushState(null, "", window.location.href);
      dispatch({ type: "ask_leave", href: TRAINING_HREF });
    };
    if (!sentinelRef.current) {
      window.history.pushState(null, "", window.location.href);
      sentinelRef.current = true;
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [guarded, router]);

  /**
   * Leaving has to unwind the guard, not navigate over it. `replace` alone would overwrite the
   * sentinel and leave the replay entry underneath, so Back walked straight back into the practice
   * the operator had just abandoned (caught in the browser). Instead: consume the sentinel, then
   * replace the replay entry itself from the popstate handler.
   */
  const leave = useCallback(() => {
    leftRef.current = true;
    destRef.current = state.leavingTo ?? TRAINING_HREF;
    if (sentinelRef.current) window.history.back();
    else router.replace(destRef.current);
  }, [router, state.leavingTo]);

  const askLeave = () => {
    if (needsLeaveConfirm(phase)) dispatch({ type: "ask_leave", href: TRAINING_HREF });
    else router.replace(TRAINING_HREF);
  };

  // The phase block is keyed on `phase`, so React unmounts whatever had focus ([Start]). Put focus
  // on the new block instead of letting it fall to <body>, where the next Tab restarts the page.
  const phaseRef = useRef<HTMLDivElement>(null);
  const firstPhase = useRef(true);
  useEffect(() => {
    if (firstPhase.current) {
      firstPhase.current = false;
      return;
    }
    phaseRef.current?.focus();
  }, [phase]);

  const scenario = state.scenario;
  const frameTime = scenario ? format.dateTime(new Date(scenario.occurred_sim_ts), "time") : null;

  return (
    <div className="replay">
      <header className="replay-head">
        <p className="t-label tnum">{frameTime ? t("frame", { time: frameTime }) : t("frameLoading")}</p>
        <PhaseRail phase={phase} />
        <p className="t-meta text-ink-3">{t("simulatedNote")}</p>
      </header>

      <p className="replay-announce" role="status">{state.paused ? t("paused.title") : ""}</p>

      {state.paused ? (
        <Plate as="section" rule="heavy" className="replay-paused">
          <p className="t-title">{t("paused.title")}</p>
          <p className="t-body">{t("paused.body")}</p>
          <Button variant="primary" onClick={() => dispatch({ type: "resume" })}>
            {t("paused.resume")}
          </Button>
        </Plate>
      ) : null}

      <div className="replay-phase" key={phase} ref={phaseRef} tabIndex={-1}>
        {phase === "loading" ? <Plate loading className="min-h-hit-sos" aria-label={t("loading")} /> : null}

        {phase === "load_failed" ? (
          <Plate as="section" className="replay-failed">
            <p className="t-body">{t("loadFailed")}</p>
            <Button onClick={() => dispatch({ type: "retry_load" })}>{t("retry")}</Button>
          </Plate>
        ) : null}

        {phase === "brief" && scenario ? (
          <ReplayBrief scenario={scenario} attempt={state.attempt} onStart={() => dispatch({ type: "start" })} />
        ) : null}

        {phase === "investigate" ? <Stub task="R2" /> : null}
        {phase === "decide" || phase === "submitting" ? <Stub task="R3" /> : null}
        {phase === "debrief" ? <Stub task="R4" /> : null}
      </div>

      <Button onClick={askLeave}>{t("backToTraining")}</Button>

      <Sheet open={state.leavingTo !== null} onClose={() => dispatch({ type: "cancel_leave" })} title={t("leave.title")}>
        <p className="t-body">{t("leave.body")}</p>
        <div className="replay-leave-actions">
          <Button variant="primary" onClick={leave}>
            {t("leave.confirm")}
          </Button>
          <Button onClick={() => dispatch({ type: "cancel_leave" })}>{t("leave.cancel")}</Button>
        </div>
      </Sheet>
    </div>
  );
}
