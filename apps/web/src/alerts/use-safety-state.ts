"use client";

import { useEffect, useState } from "react";
import { safetyState, topAlert, type SafetyState } from "@/alerts/selectors";
import { useAppState } from "@/data/store";
import type { AlertRecord } from "@/data/types";

/** The chip's state, re-evaluated every second so NO SIGNAL appears 10 s after the last frame. */
export function useSafetyState(): { safety: SafetyState; topAlert: AlertRecord | undefined } {
  const alerts = useAppState((s) => s.alerts);
  const lastFrameMs = useAppState((s) => s.lastFrameMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return { safety: safetyState(alerts, lastFrameMs, now), topAlert: topAlert(alerts) };
}
