"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SOS_CANCEL_WINDOW_MS, SOS_RETRY_MS } from "@/sos/hold";
import { useSosPort, type SosRaiseOut } from "@/sos/port";
import { serverNowMs, setServerNow } from "@/lib/clock";

/**
 * SOS lifecycle after the hold arms (A10, A11). One request_id per hold, reused on every retry.
 * sending → sent (cancel offered for 10 s) | failed (retry every 5 s, Call supervisor offered).
 */
export type SosState =
  | { phase: "idle" }
  | { phase: "sending"; requestId: string; attempt: number }
  | { phase: "failed"; requestId: string; attempt: number }
  | { phase: "sent"; requestId: string; result: SosRaiseOut; sentAtMs: number; cancelling: boolean }
  | { phase: "cancelled" };

type Location = { lat: number; lon: number } | null;

/** Device location with a short timeout; null lets the server fall back to the machine, then the site (UI-14). */
function deviceLocation(timeoutMs = 2_000): Promise<Location> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const done = (v: Location) => resolve(v);
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => done(null),
      { timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export function useSos() {
  const port = useSosPort();
  const [state, setState] = useState<SosState>({ phase: "idle" });
  const retryTimer = useRef<number | null>(null);

  const send = useCallback(
    async (requestId: string, attempt: number) => {
      setState({ phase: "sending", requestId, attempt });
      const loc = await deviceLocation();
      try {
        const result = await port.raise({ p_request_id: requestId, p_lat: loc?.lat ?? null, p_lon: loc?.lon ?? null, p_note: null });
        setServerNow(result.server_now);
        setState({ phase: "sent", requestId, result, sentAtMs: serverNowMs(), cancelling: false });
      } catch {
        setState({ phase: "failed", requestId, attempt });
      }
    },
    [port],
  );

  // A failed send retries every 5 s with the same request_id until it lands or the phone is offline forever.
  useEffect(() => {
    if (state.phase !== "failed") return;
    const { requestId, attempt } = state;
    retryTimer.current = window.setTimeout(() => void send(requestId, attempt + 1), SOS_RETRY_MS);
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, [state, send]);

  /** Called once when the hold arms. Ignored while an SOS is already open (the button opens the sheet instead). */
  const raise = useCallback(
    (requestId: string) => {
      if (state.phase !== "idle" && state.phase !== "cancelled") return;
      void send(requestId, 1);
    },
    [send, state.phase],
  );

  const cancel = useCallback(async () => {
    if (state.phase !== "sent" || serverNowMs() - state.sentAtMs > SOS_CANCEL_WINDOW_MS) return;
    setState({ ...state, cancelling: true });
    try {
      await port.cancel({ p_alert_id: state.result.alert_id, p_request_id: `${state.requestId}-cancel` });
      setState({ phase: "cancelled" });
    } catch {
      setState({ ...state, cancelling: false });
    }
  }, [port, state]);

  const active = state.phase === "sending" || state.phase === "failed" || state.phase === "sent";
  return { state, active, raise, cancel, emergencyTel: port.emergencyTel };
}
