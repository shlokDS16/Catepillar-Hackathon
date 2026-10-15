/**
 * The guard behind T10 "Leave replay": any navigation out of the replay route before the Debrief
 * is held, and the confirmation sheet asks first. Pure so both rules are tested in node.
 */

/** The replay route (`/op/training/replay/[id]`), where Ask is hidden and the guard is armed. */
export const REPLAY_ROUTE = "/op/training/replay";

/** True inside a replay. Ask is hidden there so the answer key cannot be looked up mid-run. */
export function isReplayRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === REPLAY_ROUTE || pathname.startsWith(`${REPLAY_ROUTE}/`);
}

/**
 * The destination a click should be held for, or null when the click is not a navigation away
 * from the replay (a different origin, an in-page anchor, or the same route).
 */
export function heldDestination(url: URL, origin: string, currentPath: string): string | null {
  if (url.origin !== origin) return null;
  if (url.pathname === currentPath) return null;
  return `${url.pathname}${url.search}`;
}
