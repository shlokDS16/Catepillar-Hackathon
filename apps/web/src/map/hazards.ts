import type { AlertRecord, AlertTier } from "@/data/types";

type Hazard = { anomaly_id: string; machine_code: string };
type Anomaly = { severity_tier: AlertTier };

const LIVE: ReadonlySet<AlertRecord["status"]> = new Set(["open", "acknowledged", "escalated"]);

/**
 * The Guardian hazard that belongs to a machine code. Only a hazard names a machine (AnomalyDetected
 * carries no machine reference), so it is the join from a machine to its anomaly. A hazard whose
 * alert is still live wins, so a cleared hazard can never drive the sheet or a safety colour.
 */
export function hazardForMachine<H extends Hazard>(
  code: string,
  guardian: Record<string, H>,
  alerts: readonly AlertRecord[],
  guardianByAlert: Record<string, string>,
): H | undefined {
  const liveIds = new Set(
    alerts
      .filter((a) => LIVE.has(a.status))
      .map((a) => guardianByAlert[a.alert_id])
      .filter((id): id is string => Boolean(id)),
  );
  const candidates = Object.values(guardian).filter((h) => h.machine_code === code);
  return candidates.find((h) => liveIds.has(h.anomaly_id)) ?? candidates[0];
}

/** The tier word a machine's list row may wear: its live hazard's anomaly tier, never "info". */
export function hazardTier(hazard: Hazard | undefined, anomalies: Record<string, Anomaly>): "caution" | "warning" | "critical" | undefined {
  const tier = hazard ? anomalies[hazard.anomaly_id]?.severity_tier : undefined;
  return tier === "caution" || tier === "warning" || tier === "critical" ? tier : undefined;
}
