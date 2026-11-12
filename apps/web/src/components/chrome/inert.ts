import { takeoverQueue } from "@/alerts/selectors";
import type { ShellRole } from "@/components/chrome/nav-items";
import type { AlertRecord } from "@/data/types";

/**
 * The operator shell's content, dock and strip go inert while the motion lock shows OR a
 * Warning/Critical takeover is up, so keyboard and screen-reader users cannot reach what the
 * takeover covers. The takeover and SOS are siblings of the inerted regions and stay usable.
 * Only the operator shell mounts the AlertLayer (the takeover), so the fleet manager's shell is
 * never inert, even though the fixture store carries the operator's open alerts.
 */
export function shellInert(role: ShellRole, lockShown: boolean, alerts: readonly AlertRecord[]): boolean {
  if (role !== "operator") return false;
  return lockShown || takeoverQueue(alerts).length > 0;
}
