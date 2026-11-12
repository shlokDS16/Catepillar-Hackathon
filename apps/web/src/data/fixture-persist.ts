import type { AppEvent } from "@/data/types";
import type { LedgerScenario } from "@/ledger/fixtures";

/**
 * Fixture demo state that survives a full reload (sessionStorage, per tab). The adapter keeps the
 * events it has pushed plus the few flags that are not events; on the next load it replays them
 * after the snapshot, so the store ends up where it was. Every storage access is wrapped: a private
 * window or blocked storage just means the demo starts fresh, never an error.
 */
export const PERSIST_KEY = "spotter-fixture-state";
const VERSION = 1;
/** Newest events kept; a demo run is a few dozen. */
export const MAX_EVENTS = 150;

export type PersistedState = {
  v: typeof VERSION;
  events: AppEvent[];
  ledgerScenario: LedgerScenario;
  vestRestored: boolean;
  overrideUntilMs: number | null;
  seq: number;
  simMs: number;
  progress: number;
};

const SCENARIOS: readonly string[] = ["intact", "rewrite", "chain_break"];

export function serializeState(s: Omit<PersistedState, "v">): string {
  const state: PersistedState = { ...s, v: VERSION, events: s.events.slice(-MAX_EVENTS) };
  return JSON.stringify(state);
}

/** Null for anything missing, from another version or malformed: the caller starts fresh. */
export function parseState(raw: string | null | undefined): PersistedState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PersistedState> | null;
    if (!o || o.v !== VERSION || !Array.isArray(o.events)) return null;
    if (typeof o.ledgerScenario !== "string" || !SCENARIOS.includes(o.ledgerScenario)) return null;
    if (typeof o.seq !== "number" || typeof o.simMs !== "number" || typeof o.progress !== "number") return null;
    if (typeof o.vestRestored !== "boolean") return null;
    if (o.overrideUntilMs !== null && typeof o.overrideUntilMs !== "number") return null;
    const events = o.events.filter((e) => e && typeof e.seq === "number" && typeof e.type === "string");
    return { v: VERSION, events, ledgerScenario: o.ledgerScenario as LedgerScenario, vestRestored: o.vestRestored, overrideUntilMs: o.overrideUntilMs ?? null, seq: o.seq, simMs: o.simMs, progress: o.progress };
  } catch {
    return null;
  }
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadPersisted(): PersistedState | null {
  try {
    return parseState(store()?.getItem(PERSIST_KEY));
  } catch {
    return null;
  }
}

export function savePersisted(s: Omit<PersistedState, "v">): void {
  try {
    store()?.setItem(PERSIST_KEY, serializeState(s));
  } catch {
    // Storage full or blocked: the demo keeps running, it just will not survive a reload.
  }
}

export function clearPersisted(): void {
  try {
    store()?.removeItem(PERSIST_KEY);
  } catch {
    // Nothing to clear.
  }
}
