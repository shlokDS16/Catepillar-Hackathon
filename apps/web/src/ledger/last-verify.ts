"use client";

import { useSyncExternalStore } from "react";
import { getLiveState } from "@/data/live-session";
import { toLastVerify, type LastVerify } from "@/inbox/fm-band";

/**
 * The result of the last ledger verify, kept for the session so the FM band and the Inbox seal line can show it
 * without each running its own check. The band publishes after it verifies; nothing here calls out.
 */
let current: LastVerify | null = null;
const listeners = new Set<() => void>();

/** Publish a finished verify. A verdict the live adapter answered from fixtures is stored as unavailable. */
export function publishVerify(out: Parameters<typeof toLastVerify>[0], atMs: number, localOk = true): void {
  setLastVerify(toLastVerify(out, atMs, getLiveState().failed.includes("ledger_verify"), localOk));
}

export function setLastVerify(v: LastVerify | null): void {
  current = v;
  for (const l of listeners) l();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useLastVerify(): LastVerify | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
