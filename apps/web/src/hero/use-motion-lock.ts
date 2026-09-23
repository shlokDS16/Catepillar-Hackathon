"use client";

import { useEffect, useState } from "react";

/** The client holds the lock view for 3 s after the server unlocks, so it never flickers (interaction-map §6). */
export const LOCK_DISPLAY_HOLD_MS = 3_000;

/**
 * Source of truth is `operator_state.motion_locked` (server-computed). This hook only adds the
 * display hold on the way out; it never affects calls, which the server decides.
 */
export function useMotionLock(serverLocked: boolean): boolean {
  const [shown, setShown] = useState(serverLocked);
  useEffect(() => {
    if (serverLocked) {
      const id = window.setTimeout(() => setShown(true), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setShown(false), LOCK_DISPLAY_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [serverLocked]);
  return shown || serverLocked;
}
