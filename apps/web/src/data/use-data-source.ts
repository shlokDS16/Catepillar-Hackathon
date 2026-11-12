"use client";

import { LiveAdapter } from "@/data/live-adapter";
import { useLiveState, type DataSource } from "@/data/live-session";
import { useDataPort } from "@/data/store";

/** What this screen is really reading: "live", "fallback" (live failed, fixtures shown) or "demo". */
export function useDataSource(): DataSource {
  const port = useDataPort();
  const live = useLiveState();
  return port instanceof LiveAdapter ? live.source : "demo";
}
