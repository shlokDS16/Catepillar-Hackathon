import type { AlertKind, AlertRecord, Machine, OperatorState, Weather } from "@/data/types";
import { TIER_RANK } from "@/data/types";
import { visibleAlerts } from "@/alerts/selectors";

/** The four live checks of S3 level 2. Values are facts; the screen words them and chooses the tone. */
export type SeatbeltCheck = "fastened" | "off" | "unknown";
export type PpeItemState = "on" | "off" | "unknown";
export const PPE_ORDER = ["helmet", "vest", "boots", "gloves"] as const;
export type ProximityCheck = { kind: "none" } | { kind: "near"; what: "person" | "machine"; distance_m: number };

export type SafetyChecks = {
  seatbelt: SeatbeltCheck;
  ppe: Array<{ item: (typeof PPE_ORDER)[number]; state: PpeItemState }>;
  proximity: ProximityCheck;
  wbgt_c: number | null;
};

export function deriveChecks(machine: Machine | null, operator: OperatorState | null, weather: Weather | null | undefined): SafetyChecks {
  const sb = machine?.seatbelt_fastened;
  return {
    seatbelt: sb === true ? "fastened" : sb === false ? "off" : "unknown",
    ppe: PPE_ORDER.map((item) => {
      const v = operator?.ppe[item];
      return { item, state: v === true ? "on" : v === false ? "off" : "unknown" };
    }),
    proximity: operator?.nearest ? { kind: "near", what: operator.nearest.kind, distance_m: Math.round(operator.nearest.distance_m) } : { kind: "none" },
    wbgt_c: weather?.wbgt_c ?? null,
  };
}

export type CheckKey = "seatbelt" | "ppe" | "proximity";
const CHECK_FOR_KIND: Partial<Record<AlertKind, CheckKey>> = { seatbelt_off_moving: "seatbelt", ppe_missing: "ppe", proximity_zone: "proximity" };

/** A check is coloured only while a live alert for it is on (visual-language §0): that tier, else null (ink). */
export function liveTierFor(alerts: readonly AlertRecord[], key: CheckKey): "caution" | "warning" | "critical" | null {
  let best: AlertRecord["tier"] | null = null;
  for (const a of visibleAlerts(alerts)) {
    if (CHECK_FOR_KIND[a.kind] !== key || a.status === "acknowledged") continue;
    if (best === null || TIER_RANK[a.tier] > TIER_RANK[best]) best = a.tier;
  }
  return best === null || best === "info" ? null : best;
}

/** Active = still on the operator's plate; recent = handled or past, newest first. */
export function splitAlerts(alerts: readonly AlertRecord[], recentMax = 5): { active: AlertRecord[]; recent: AlertRecord[] } {
  const active = visibleAlerts(alerts).filter((a) => a.status !== "acknowledged");
  const recent = alerts
    .filter((a) => a.status === "acknowledged" || a.status === "resolved")
    .sort((a, b) => b.first_seen.localeCompare(a.first_seen))
    .slice(0, recentMax);
  return { active, recent };
}
