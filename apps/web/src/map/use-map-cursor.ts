"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveCursor, toCursor } from "@/map/map-state";

/** Replay speed: the 10-minute window plays in 20 s. */
export const REPLAY_SPEED = 30;
/** A frame gap above this is a stalled tab, not a real step. */
const MAX_FRAME_MS = 100;

/** The wall clock, once a second. It is the live edge of the window and what data ages count against. */
export function useNowMs(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * The map's time cursor. `cursor === null` is the live edge (pinned by default: the window slides
 * with the clock and the cursor rides its end). Scrubbing near the edge snaps back to it. Replay is
 * user-started, runs once at REPLAY_SPEED from the cursor (or the window start) to the live edge,
 * then stops pinned; it never loops and never starts by itself.
 */
export function useMapCursor(span: { startMs: number; endMs: number }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const spanRef = useRef(span);
  const tRef = useRef(span.endMs);
  useEffect(() => {
    spanRef.current = span;
  });

  useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    let id = 0;
    const step = (now: number) => {
      if (last !== null) {
        const next = tRef.current + Math.min(MAX_FRAME_MS, now - last) * REPLAY_SPEED;
        if (next >= spanRef.current.endMs) {
          setCursor(null);
          setPlaying(false);
          return;
        }
        tRef.current = next;
        setCursor(next);
      }
      last = now;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  /** A user seek (drag or key) stops any replay, so the frame they chose stays put. */
  const scrub = useCallback((t: number) => {
    setPlaying(false);
    setCursor(toCursor(Math.min(spanRef.current.endMs, Math.max(spanRef.current.startMs, t)), spanRef.current.endMs));
  }, []);
  const goLive = useCallback(() => {
    setPlaying(false);
    setCursor(null);
  }, []);
  const play = useCallback(() => {
    const { startMs, endMs } = spanRef.current;
    // A cursor still near the live edge restarts the replay from the window start.
    tRef.current = cursor === null || cursor >= endMs - 2000 ? startMs : Math.max(startMs, cursor);
    setCursor(tRef.current);
    setPlaying(true);
  }, [cursor]);
  const pause = useCallback(() => setPlaying(false), []);

  return { t: resolveCursor(cursor, span), pinned: cursor === null, playing, scrub, goLive, play, pause };
}
