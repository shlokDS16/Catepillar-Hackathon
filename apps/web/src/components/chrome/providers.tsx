"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { FixtureAdapter } from "@/data/fixture-adapter";
import { LiveAdapter } from "@/data/live-adapter";
import { liveRpc, reportFallback, reportLive, restoreLive, useLiveState } from "@/data/live-session";
import { ModeProvider } from "@/data/mode";
import type { DataPort } from "@/data/port";
import { DataProvider } from "@/data/store";
import type { ShellRole } from "@/components/chrome/nav-items";

let shared: FixtureAdapter | null = null;
/** One adapter per tab, so the director page and the screens share the same event stream. */
export function fixtureAdapter(): FixtureAdapter {
  if (!shared) shared = new FixtureAdapter();
  return shared;
}

/**
 * Data + mode providers for a shell. The port is the FixtureAdapter unless the Live switch is on
 * (D18: signed in as this shell's role), when it is the LiveAdapter: real backend for the snapshot,
 * Replay and the Ledger verdict, fixtures for the rest. Screens never know which one they talk to.
 */
export function AppProviders({ role, children }: { role: ShellRole; children: ReactNode }) {
  const live = useLiveState();
  useEffect(() => {
    void restoreLive();
  }, []);
  const useLive = live.role === role;
  const port = useMemo<DataPort>(
    () => (useLive ? new LiveAdapter(liveRpc, fixtureAdapter(), { onFallback: reportFallback, onLive: reportLive }) : fixtureAdapter()),
    [useLive],
  );
  return (
    <DataProvider key={useLive ? "live" : "demo"} port={port}>
      <ModeProvider fixed={role === "fleet_manager" ? "detailed" : undefined}>{children}</ModeProvider>
    </DataProvider>
  );
}
