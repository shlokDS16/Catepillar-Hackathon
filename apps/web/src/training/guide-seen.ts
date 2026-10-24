/**
 * "Seen the guide" is a device preference, not account data: it lives in localStorage with no
 * server call, exactly like the Simple/Detailed choice in src/data/mode.tsx. Private mode makes
 * both getItem and setItem throw, so the store falls back to remembering for this page only and
 * reports `persistFailed` so the UI can say so instead of silently re-opening on every visit.
 */

export const GUIDE_SEEN_KEY = "spotter.guideSeen";
const SEEN_VALUE = "1";

/** Only the two methods we use, so a test can pass a throwing stub for private mode. */
export type GuideStorage = Pick<Storage, "getItem" | "setItem">;

export type GuideSeenSnapshot = { seen: boolean; persistFailed: boolean };

/** The snapshot is a string so useSyncExternalStore compares by value and never loops. */
export function parseGuideSeen(snapshot: string): GuideSeenSnapshot {
  const [seen, failed] = snapshot.split("|");
  return { seen: seen === "1", persistFailed: failed === "1" };
}

export type GuideSeenStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string;
  /** The server render always reports "seen": a flash of the guide on every page load is worse
   *  than showing it one paint late to the operator who has genuinely never seen it. */
  getServerSnapshot: () => string;
  markSeen: () => void;
};

export function createGuideSeenStore(getStorage: () => GuideStorage | null): GuideSeenStore {
  // Survives a failed write: the operator who dismissed the guide in private mode is not shown it
  // again while this page is open.
  let memorySeen = false;
  let persistFailed = false;
  const listeners = new Set<() => void>();

  function read(): boolean {
    if (memorySeen) return true;
    try {
      return getStorage()?.getItem(GUIDE_SEEN_KEY) === SEEN_VALUE;
    } catch {
      return false;
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => `${read() ? "1" : "0"}|${persistFailed ? "1" : "0"}`,
    getServerSnapshot: () => "1|0",
    markSeen() {
      memorySeen = true;
      try {
        const storage = getStorage();
        if (!storage) throw new Error("no storage");
        storage.setItem(GUIDE_SEEN_KEY, SEEN_VALUE);
        persistFailed = false;
      } catch {
        persistFailed = true;
      }
      listeners.forEach((listener) => listener());
    },
  };
}

/** What the sheet is doing: following the stored flag, or overridden by an explicit tap. */
export type GuideRequest = "auto" | "open" | "closed";

/**
 * The guide opens by itself exactly once — before the operator's first practice — and after that
 * only when the control is tapped. It is never a gate: closing it is always one tap away, and it
 * sits below SOS in the z-order, so it can never hide the SOS plate.
 */
export function guideIsOpen(request: GuideRequest, seen: boolean): boolean {
  if (request === "open") return true;
  if (request === "closed") return false;
  return !seen;
}

export const guideSeenStore = createGuideSeenStore(() =>
  typeof window === "undefined" ? null : window.localStorage,
);
