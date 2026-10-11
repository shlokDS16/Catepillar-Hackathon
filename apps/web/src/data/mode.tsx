"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

/** A05 Simple / Detailed. Operators start Simple; the fleet manager's shell is always Detailed. */
export type Mode = "simple" | "detailed";
const KEY = "spotter.mode";
const listeners = new Set<() => void>();

function read(): Mode {
  try {
    return window.localStorage.getItem(KEY) === "detailed" ? "detailed" : "simple";
  } catch {
    return "simple";
  }
}
/** Set when a toggle could not be written (private mode / storage full): the choice lasts for the page only. */
let persistFailed = false;
function snapshot(): string {
  return `${read()}|${persistFailed ? "1" : "0"}`;
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
/** The choice lives in localStorage; there is no server call. The server render is always Simple. */
function useStoredMode(): { mode: Mode; persistFailed: boolean } {
  const snap = useSyncExternalStore(subscribe, snapshot, () => "simple|0");
  const [mode, failed] = snap.split("|") as [Mode, string];
  return { mode, persistFailed: failed === "1" };
}

const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void; persistFailed: boolean }>({
  mode: "simple",
  setMode: () => {},
  persistFailed: false,
});

export function ModeProvider({ children, fixed }: { children: ReactNode; fixed?: Mode }) {
  const stored = useStoredMode();
  const mode = fixed ?? stored.mode;

  useEffect(() => {
    if (mode === "detailed") document.documentElement.dataset.mode = "detailed";
    else delete document.documentElement.dataset.mode;
  }, [mode]);

  const setMode = useCallback(
    (m: Mode) => {
      if (fixed) return;
      try {
        window.localStorage.setItem(KEY, m);
        persistFailed = false;
      } catch {
        // Private mode: the choice lasts for this page only, and the toggle says so (F06-F08 review 11).
        persistFailed = true;
      }
      listeners.forEach((l) => l());
    },
    [fixed],
  );

  return <ModeContext.Provider value={{ mode, setMode, persistFailed: fixed ? false : stored.persistFailed }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
