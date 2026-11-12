import { afterEach, describe, expect, it, vi } from "vitest";
import { seatbeltBreachEvent } from "@cat/shared/fixtures";
import { MAX_EVENTS, PERSIST_KEY, clearPersisted, loadPersisted, parseState, savePersisted, serializeState } from "./fixture-persist";
import type { AppEvent } from "@/data/types";

const ev = (seq: number): AppEvent => ({ ...seatbeltBreachEvent, seq, audiences: [...seatbeltBreachEvent.audiences] }) as unknown as AppEvent;
const base = { events: [ev(1001)], ledgerScenario: "chain_break" as const, vestRestored: true, overrideUntilMs: null, seq: 1001, simMs: 1_000, progress: 20 };

/** A minimal window with an in-memory sessionStorage. */
function stubWindow(storage: Partial<Storage> | "throws") {
  const mem = new Map<string, string>();
  const real: Storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  };
  const win = storage === "throws" ? Object.defineProperty({}, "sessionStorage", { get: () => { throw new Error("blocked"); } }) : { sessionStorage: { ...real, ...storage } };
  vi.stubGlobal("window", win);
  return mem;
}

afterEach(() => vi.unstubAllGlobals());

describe("serialize and restore", () => {
  it("round-trips the state", () => {
    expect(parseState(serializeState(base))).toEqual({ v: 1, ...base });
  });
  it("keeps only the newest events", () => {
    const many = Array.from({ length: MAX_EVENTS + 20 }, (_, i) => ev(i + 1));
    const back = parseState(serializeState({ ...base, events: many }));
    expect(back?.events).toHaveLength(MAX_EVENTS);
    expect(back?.events.at(-1)?.seq).toBe(MAX_EVENTS + 20);
  });
  it("rejects missing, malformed, other-version and wrongly shaped data", () => {
    expect(parseState(null)).toBeNull();
    expect(parseState("{nope")).toBeNull();
    expect(parseState(JSON.stringify({ v: 2, ...base }))).toBeNull();
    expect(parseState(JSON.stringify({ v: 1, ...base, ledgerScenario: "wild" }))).toBeNull();
    expect(parseState(JSON.stringify({ v: 1, ...base, events: "x" }))).toBeNull();
    expect(parseState(JSON.stringify({ v: 1, ...base, seq: "9" }))).toBeNull();
  });
  it("drops event rows that are not events", () => {
    const raw = JSON.stringify({ v: 1, ...base, events: [ev(1), null, { nope: true }] });
    expect(parseState(raw)?.events).toHaveLength(1);
  });
});

describe("sessionStorage access", () => {
  it("saves, loads and clears", () => {
    const mem = stubWindow({});
    savePersisted(base);
    expect(mem.has(PERSIST_KEY)).toBe(true);
    expect(loadPersisted()?.ledgerScenario).toBe("chain_break");
    clearPersisted();
    expect(loadPersisted()).toBeNull();
  });
  it("never throws when storage is blocked or full", () => {
    stubWindow("throws");
    expect(() => savePersisted(base)).not.toThrow();
    expect(loadPersisted()).toBeNull();
    expect(() => clearPersisted()).not.toThrow();
    stubWindow({ setItem: () => { throw new Error("quota"); }, getItem: () => { throw new Error("denied"); } });
    expect(() => savePersisted(base)).not.toThrow();
    expect(loadPersisted()).toBeNull();
  });
  it("is a no-op on the server (no window)", () => {
    expect(() => savePersisted(base)).not.toThrow();
    expect(loadPersisted()).toBeNull();
  });
});
