"use client";

import type { ReactNode } from "react";
import { useAppState } from "@/data/store";
import { useMotionLock } from "@/hero/use-motion-lock";

/**
 * The shell's content region while the motion lock is shown: `inert` removes it (and the rail,
 * via Nav) from the tab order and from pointer input, so only SOS (a sibling, z 40) and the
 * takeover (z 30) stay usable (interaction-map §6, F06-F08 review 3). The strip stays visible
 * above the lock by design and is inerted separately in StatusStrip (its safety chip is a Link).
 */
export function LockableBody({ children }: { children: ReactNode }) {
  const serverLocked = useAppState((s) => s.operator?.motion_locked ?? false);
  const shown = useMotionLock(serverLocked);
  return (
    <div className="shell-body" inert={shown || undefined}>
      {children}
    </div>
  );
}
