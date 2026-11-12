import { takeoverQueue } from "@/alerts/selectors";
import type { AlertRecord } from "@/data/types";

/**
 * The shell's content and dock go inert while the motion lock shows OR a Warning/Critical takeover
 * is up, so keyboard and screen-reader users cannot reach what the takeover covers. The takeover
 * itself and SOS are siblings of the inerted regions and stay usable.
 */
export function shellInert(lockShown: boolean, alerts: readonly AlertRecord[]): boolean {
  return lockShown || takeoverQueue(alerts).length > 0;
}
