import { CONTRACTS_VERSION, EVENT_REGISTRY, EVENT_TYPES, type EventType } from "@cat/shared";
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
/** State saved under another contract version is ignored, so a reshaped payload can never be replayed into the reducer. */
const CONTRACTS = CONTRACTS_VERSION;
/** Newest events kept; a demo run is a few dozen. */
export const MAX_EVENTS = 150;

export type PersistedState = {
  v: typeof VERSION;
  contracts: string;
  events: AppEvent[];
  ledgerScenario: LedgerScenario;
  vestRestored: boolean;
  overrideUntilMs: number | null;
  seq: number;
  simMs: number;
  progress: number;
};

const SCENARIOS: readonly string[] = ["intact", "rewrite", "chain_break"];

/** A registered event must still match its payload schema; anything that does not is dropped, never replayed. */
function validEvent(e: AppEvent): boolean {
  if (!e || typeof e.seq !== "number" || typeof e.type !== "string") return false;
  if (!(EVENT_TYPES as readonly string[]).includes(e.type)) return true;
  return EVENT_REGISTRY[e.type as EventType].payload.safeParse(e.payload).success;
}

export function serializeState(s: Omit<PersistedState, "v" | "contracts">): string {
  const state: PersistedState = { ...s, v: VERSION, contracts: CONTRACTS, events: s.events.slice(-MAX_EVENTS) };
  return JSON.stringify(state);
}

/** Null for anything missing, from another version or malformed: the caller starts fresh. */
export function parseState(raw: string | null | undefined): PersistedState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PersistedState> | null;
    if (!o || o.v !== VERSION || o.contracts !== CONTRACTS || !Array.isArray(o.events)) return null;
    if (typeof o.ledgerScenario !== "string" || !SCENARIOS.includes(o.ledgerScenario)) return null;
    if (typeof o.seq !== "number" || typeof o.simMs !== "number" || typeof o.progress !== "number") return null;
    if (typeof o.vestRestored !== "boolean") return null;
    if (o.overrideUntilMs !== null && typeof o.overrideUntilMs !== "number") return null;
    const events = o.events.filter(validEvent);
    return { v: VERSION, contracts: CONTRACTS, events, ledgerScenario: o.ledgerScenario as LedgerScenario, vestRestored: o.vestRestored, overrideUntilMs: o.overrideUntilMs ?? null, seq: o.seq, simMs: o.simMs, progress: o.progress };
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

export function savePersisted(s: Omit<PersistedState, "v" | "contracts">): void {
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
