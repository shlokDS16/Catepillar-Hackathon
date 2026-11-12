"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { advance, countValue } from "@/replay/reenact";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** `prefers-reduced-motion: reduce` as an external store (false on the server). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** A frame gap above this is a stalled tab, not a real step: clamp it so the machine does not jump. */
const MAX_FRAME_MS = 100;

/**
 * User-controlled playback for the re-enactment (T8). It only owns "which sim time is it": the
 * picture is stateAt(model, t). Plays once, never loops: on the last frame it stops and Play
 * starts again from 0. Autoplays when the Debrief opens unless the user prefers reduced motion;
 * that is derived (no choice yet), not pushed from an effect. `paused` (a live alert or a hidden
 * page) stops the clock without losing the choice, so it carries on after [Resume].
 */
export function useReenactment(durationMs: number, paused: boolean) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const [choice, setChoice] = useState<"play" | "pause" | null>(null);

  const ended = t >= durationMs;
  const wantsPlay = choice === null ? !reduced : choice === "play";
  const playing = wantsPlay && !ended && !paused;

  useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    let id = 0;
    const step = (now: number) => {
      if (last !== null) {
        const dt = Math.min(MAX_FRAME_MS, now - last);
        setT((prev) => advance(prev, dt, durationMs).t);
      }
      last = now;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [playing, durationMs]);

  const play = useCallback(() => {
    if (t >= durationMs) setT(0);
    setChoice("play");
  }, [t, durationMs]);
  const pause = useCallback(() => setChoice("pause"), []);
  const restart = useCallback(() => {
    setT(0);
    setChoice("play");
  }, []);
  /** A user seek (drag or key) pauses, so the frame they chose stays put. */
  const seek = useCallback((to: number) => {
    setT(Math.min(durationMs, Math.max(0, to)));
    setChoice("pause");
  }, [durationMs]);

  return { t, playing, ended, play, pause, restart, seek };
}

/**
 * The score count-up: 0 -> target over `durationMs` (at most 1.2 s), once, on mount. With reduced
 * motion, or a zero duration, it is the final number from the first paint.
 */
export function useCountUp(target: number, durationMs: number, enabled: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const animate = enabled && durationMs > 0;

  useEffect(() => {
    if (!animate) return;
    let start: number | null = null;
    let id = 0;
    const step = (now: number) => {
      start ??= now;
      const e = now - start;
      setElapsed(e);
      if (e < durationMs) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [animate, durationMs]);

  return animate ? countValue(target, elapsed, durationMs) : target;
}
