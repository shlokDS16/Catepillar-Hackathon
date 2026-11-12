"use client";

import type { ReactNode } from "react";
import { shellInert } from "@/components/chrome/inert";
import type { ShellRole } from "@/components/chrome/nav-items";
import { useAppState } from "@/data/store";
import { useMotionLock } from "@/hero/use-motion-lock";

function useShellInert(role: ShellRole): boolean {
  const serverLocked = useAppState((s) => s.operator?.motion_locked ?? false);
  const shown = useMotionLock(serverLocked);
  const alerts = useAppState((s) => s.alerts);
  return shellInert(role, shown, alerts);
}

/**
 * The shell's content region while the motion lock is shown or an operator takeover is up: `inert`
 * removes it (and the rail, via Nav) from the tab order and from pointer input, so only SOS (a
 * sibling, z 40) and the takeover (z 30) stay usable (interaction-map §6, F06-F08 review 3). Never
 * inert in the fleet manager's shell.
 */
export function LockableBody({ role, children }: { role: ShellRole; children: ReactNode }) {
  return (
    <div className="shell-body" inert={useShellInert(role) || undefined}>
      {children}
    </div>
  );
}

/**
 * Wraps the status strip (safety chip, Language, Ask) so it is unreachable under an operator
 * takeover. `display: contents` keeps the strip a direct grid item of the shell.
 */
export function InertRegion({ role, children }: { role: ShellRole; children: ReactNode }) {
  return (
    <div style={{ display: "contents" }} inert={useShellInert(role) || undefined}>
      {children}
    </div>
  );
}
