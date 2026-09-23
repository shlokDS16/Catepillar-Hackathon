/**
 * Realtime (api-contracts §7, G2-19): one private topic per audience. The RLS on `events` uses the same
 * audiences, so a role receives on Realtime exactly what it can select.
 */
import { z } from "zod";
import { Audience, Id, MachineHealth, RunStatus, Speed, Ts } from "./enums";

export const topicFor = {
  operator: (operatorId: string) => `op:${operatorId}`,
  site: (siteId: string) => `site:${siteId}`,
  supervisor: (siteId: string) => `sup:${siteId}`,
  trainer: (siteId: string) => `train:${siteId}`,
} satisfies Record<z.infer<typeof Audience>, (id: string) => string>;

export const ClockTick = z.object({ run_id: Id, status: RunStatus, speed: Speed, sim_now: Ts, server_now: Ts });   // "clock", 1 Hz (UI-4)
export const MachineDelta = z.object({ run_id: Id, sim_ts: Ts, machines: z.array(z.object({     // "machines", delta only
  machine_id: Id, code: z.string(), lat: z.number(), lon: z.number(), moving: z.boolean(),
  health: MachineHealth })) });

export const BROADCAST_EVENTS = { event: "event", clock: "clock", machines: "machines" } as const;
