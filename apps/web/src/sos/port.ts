"use client";

import { createContext, useContext } from "react";

/** `SosRaiseOut` from api-contracts §4 (mirrored in data/types until IP0). */
export type SosRaiseOut = {
  alert_id: string;
  escalate_at: string;
  server_now: string;
  location_source: "device" | "machine" | "site";
  /** Demo route only: what was dispatched ("Telegram: sent · Call: ringing"). */
  dispatch_line?: string;
};

export type SosRaiseIn = { p_request_id: string; p_lat: number | null; p_lon: number | null; p_note: string | null };

/** The two SOS calls. The fixture answers locally; the Supabase adapter (F13) calls the RPCs. */
export type SosPort = {
  raise(input: SosRaiseIn): Promise<SosRaiseOut>;
  cancel(input: { p_alert_id: string; p_request_id: string }): Promise<void>;
  /** From `my_snapshot.site.emergency_tel` (UI-11); null hides the Call button. */
  emergencyTel: string | null;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fixture: answers in 400 ms with a 60 s escalation, the location from the machine. */
export const fixtureSosPort: SosPort = {
  async raise(input) {
    await wait(400);
    const now = Date.now();
    return {
      alert_id: `fixture-sos-${input.p_request_id.slice(0, 8)}`,
      escalate_at: new Date(now + 60_000).toISOString(),
      server_now: new Date(now).toISOString(),
      location_source: input.p_lat === null ? "machine" : "device",
    };
  },
  async cancel() {
    await wait(300);
  },
  emergencyTel: "+911234567890",
};

type DemoDispatch = { mode: string; telegram: { status: string }; twilio: { status: string } };

/**
 * Review demo: the server route dispatches a real Telegram message and Twilio call (secrets stay
 * on the server; dry run unless SOS_LIVE=1). F13 replaces this with the sos_raise RPC.
 */
export const demoSosPort: SosPort = {
  async raise(input) {
    const res = await fetch("/api/sos-demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request_id: input.p_request_id, lat: input.p_lat, lon: input.p_lon }),
    });
    if (!res.ok) throw new Error(`sos-demo ${res.status}`);
    const data = (await res.json()) as SosRaiseOut & { dispatch: DemoDispatch };
    const d = data.dispatch;
    const line =
      d.mode === "dry_run" ? "Dry run: no message or call sent" : `Telegram: ${d.telegram.status} · Call: ${d.twilio.status}`;
    return { ...data, dispatch_line: line };
  },
  async cancel() {
    await wait(300);
  },
  emergencyTel: fixtureSosPort.emergencyTel,
};

export const SosPortContext = createContext<SosPort>(demoSosPort);
export const useSosPort = () => useContext(SosPortContext);
