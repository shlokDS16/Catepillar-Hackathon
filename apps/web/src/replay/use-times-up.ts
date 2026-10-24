"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** "At 0 a 'Time's up' plate shows for 800 ms" (interaction-map §4.5, Timeout). */
export const TIMES_UP_MS = 800;

/**
 * The timeout hold, shared by Investigate and by each Decide step (R3). The clock calls `expire`
 * from a tick, the plate shows, and only then does the caller move the phase on — so the operator
 * sees why the screen changed instead of being thrown into the next phase mid-read.
 *
 * It is a readable pause, not an animation, so reduced motion keeps it.
 */
export function useTimesUp(onDone: () => void, holdMs: number = TIMES_UP_MS) {
  const [over, setOver] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!over) return;
    const id = setTimeout(() => done.current(), holdMs);
    return () => clearTimeout(id);
  }, [over, holdMs]);

  return { over, expire: useCallback(() => setOver(true), []) };
}
