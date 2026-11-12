"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { setServerNow } from "@/lib/clock";
import type { DataPort, PortMessage } from "@/data/port";
import { initialState, reduce, type Action, type AppState } from "@/data/reducer";

/**
 * One store for the app: the reducer's state behind useSyncExternalStore, fed by a DataPort.
 * Screens read with useAppState(selector) and act through useDataPort(); components never
 * import an adapter.
 */
class Store {
  private state: AppState = initialState;
  private listeners = new Set<() => void>();
  getState = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  dispatch = (action: Action) => {
    const next = reduce(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.listeners.forEach((l) => l());
    }
  };
}

const StoreContext = createContext<{ store: Store; port: DataPort } | null>(null);

export function DataProvider({ port, children }: { port: DataPort; children: ReactNode }) {
  const [store] = useState(() => new Store());

  useEffect(() => {
    let cancelled = false;
    const onMessage = (m: PortMessage) => {
      const nowMs = Date.now();
      switch (m.kind) {
        case "event":
          store.dispatch({ type: "event", event: m.event, nowMs });
          return;
        case "clock":
          setServerNow(m.tick.server_now, nowMs);
          store.dispatch({ type: "clock", tick: m.tick, nowMs });
          return;
        case "machines": {
          const me = store.getState().machine;
          const mine = me ? m.delta.machines.find((x) => x.machine_id === me.id) : undefined;
          if (mine) store.dispatch({ type: "machine_moved", machine: { location: { lat: mine.lat, lon: mine.lon }, moving: mine.moving, health: mine.health }, nowMs });
          return;
        }
        case "connectivity":
          store.dispatch({ type: "connectivity", connectivity: m.connectivity });
          return;
      }
    };
    const unsubscribe = port.subscribe(onMessage);
    void port.snapshot().then((snapshot) => {
      if (cancelled) return;
      setServerNow(snapshot.server_now);
      store.dispatch({ type: "snapshot", snapshot, nowMs: Date.now() });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [port, store]);

  const value = useMemo(() => ({ store, port }), [store, port]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStoreContext() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("DataProvider is missing above this component");
  return ctx;
}

/** Read a slice of the state. The selector must return a stable value for unchanged state. */
export function useAppState<T>(selector: (s: AppState) => T): T {
  const { store } = useStoreContext();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(initialState),
  );
}

export function useDataPort(): DataPort {
  return useStoreContext().port;
}
