"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ReplayClock, type TimerSnapshot } from "@/replay/timer";

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** `document.hidden` as an external store, so no effect has to push it into state. */
export function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

type TimerOptions = {
  /** The phase budget in seconds (`time_budget_s`, or a step's `time_limit_s`). */
  budgetS: number;
  /** The caller's rule, normally timerRuns({ phase, paused, hidden: false }). */
  running: boolean;
  /** Any value identifying this countdown; changing it restarts the clock (a new step, a new attempt). */
  resetKey: string | number;
  /** Fired once when the budget runs out. The caller moves the phase on. */
  onExpire?: () => void;
};

/** The server render and the first paint show a full, stopped clock. */
const IDLE: TimerSnapshot = { secondsLeft: 0, fraction: 1, running: false, expired: false };

/**
 * useReplayTimer: the client's countdown for Investigate and for each Decide step
 * (interaction-map §4.5). It freezes while the tab is hidden and while the caller says the run is
 * paused by a live alert, and resumes where it stopped, so an alert never costs training time.
 */
export function useReplayTimer({ budgetS, running, resetKey, onExpire }: TimerOptions): TimerSnapshot {
  const hidden = useDocumentHidden();
  const run = running && !hidden;
  const budgetMs = Math.max(0, budgetS) * 1000;

  const [clock] = useState(() => new ReplayClock(budgetMs));
  useEffect(() => () => clock.dispose(), [clock]);
  useEffect(() => {
    clock.setOnExpire(onExpire ?? null);
  });
  useEffect(() => {
    clock.reset(budgetMs);
  }, [clock, budgetMs, resetKey]);
  useEffect(() => {
    clock.setRunning(run);
  }, [clock, run]);

  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, () => IDLE);
}
