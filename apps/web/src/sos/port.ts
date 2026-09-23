"use client";

import { createContext, useContext } from "react";

/** `SosRaiseOut` from api-contracts §4 (mirrored in data/types until IP0). */
export type SosRaiseOut = {
  alert_id: string;
  escalate_at: string;
  server_now: string;
  location_source: "device" | "machine" | "site";
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

export const SosPortContext = createContext<SosPort>(fixtureSosPort);
export const useSosPort = () => useContext(SosPortContext);
