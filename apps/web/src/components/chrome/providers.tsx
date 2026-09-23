"use client";

import { useState, type ReactNode } from "react";
import { FixtureAdapter } from "@/data/fixture-adapter";
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
 * Data + mode providers for a shell. The port is the FixtureAdapter until F13 swaps in the
 * SupabaseAdapter for live runs; screens never know which one they talk to.
 */
export function AppProviders({ role, children }: { role: ShellRole; children: ReactNode }) {
  const [port] = useState<DataPort>(() => fixtureAdapter());
  return (
    <DataProvider port={port}>
      <ModeProvider fixed={role === "fleet_manager" ? "detailed" : undefined}>{children}</ModeProvider>
    </DataProvider>
  );
}
