"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tweens a number over --dur-value (320 ms) so 58 → 64 % reads as a change, not a jump.
 * Zero duration (reduced motion) snaps. Only used for progress and ETA figures.
 */
export function useTweenNumber(target: number, durationMs = 320): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    const delta = target - start;
    if (delta === 0) return;
    const snap = reduced || durationMs <= 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = snap ? 1 : Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = start + delta * eased;
      from.current = v;
      setValue(v);
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);

  return value;
}
