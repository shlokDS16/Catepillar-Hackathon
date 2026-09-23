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
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
/** The choice lives in localStorage; there is no server call. The server render is always Simple. */
function useStoredMode(): Mode {
  return useSyncExternalStore(subscribe, read, () => "simple");
}

const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "simple", setMode: () => {} });

export function ModeProvider({ children, fixed }: { children: ReactNode; fixed?: Mode }) {
  const stored = useStoredMode();
  const mode = fixed ?? stored;

  useEffect(() => {
    if (mode === "detailed") document.documentElement.dataset.mode = "detailed";
    else delete document.documentElement.dataset.mode;
  }, [mode]);

  const setMode = useCallback(
    (m: Mode) => {
      if (fixed) return;
      try {
        window.localStorage.setItem(KEY, m);
      } catch {
        /* private mode: the choice lasts for this page only */
      }
      listeners.forEach((l) => l());
    },
    [fixed],
  );

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
