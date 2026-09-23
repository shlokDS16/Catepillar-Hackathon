import { TIER_RANK, type AlertRecord, type AlertTier } from "@/data/types";

/** After this long without a frame the chips read NO SIGNAL and a stale CLEAR is never shown. */
export const NO_SIGNAL_AFTER_MS = 10_000;

export type SafetyState = AlertTier | "clear" | "nosignal";

/** Chip tone for a safety state: Info has no colour of its own (a row, not a plate). */
export function safetyTone(s: SafetyState): Exclude<SafetyState, "info"> | "outline" {
  return s === "info" ? "outline" : s;
}

/** Still waiting for the operator: open, or escalated past them without an acknowledgement. */
const UNACKNOWLEDGED: ReadonlySet<AlertRecord["status"]> = new Set(["open", "escalating", "escalated"]);

/** Alerts the operator can see: the fleet manager sees "Suppressed (n)" instead; resolved ones drop. */
export function visibleAlerts(alerts: readonly AlertRecord[]): AlertRecord[] {
  return alerts.filter((a) => a.status !== "suppressed" && a.status !== "resolved");
}

/** Highest tier first, then oldest first, so the takeover and the chip agree. */
export function byPrecedence(alerts: readonly AlertRecord[]): AlertRecord[] {
  return [...alerts].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || a.first_seen.localeCompare(b.first_seen));
}

/** The alert the safety chip shows: the highest visible one, or none. */
export function topAlert(alerts: readonly AlertRecord[]): AlertRecord | undefined {
  return byPrecedence(visibleAlerts(alerts))[0];
}

/** Chip state: NO SIGNAL beats everything once frames stop; otherwise the top tier or CLEAR. */
export function safetyState(alerts: readonly AlertRecord[], lastFrameMs: number | null, nowMs: number): SafetyState {
  if (lastFrameMs === null || nowMs - lastFrameMs > NO_SIGNAL_AFTER_MS) return "nosignal";
  return topAlert(alerts)?.tier ?? "clear";
}

/**
 * Takeover candidates: open Warning and Critical alerts that still need Acknowledge.
 * Only the highest shows as the takeover; the rest count as "+n more". Criticals stack.
 */
export function takeoverQueue(alerts: readonly AlertRecord[]): AlertRecord[] {
  return byPrecedence(visibleAlerts(alerts)).filter(
    (a) => (a.tier === "warning" || a.tier === "critical") && a.needs_ack && UNACKNOWLEDGED.has(a.status),
  );
}

/** The Caution banner under the strip: the newest open Caution, only when nothing is taking over. */
export function cautionBanner(alerts: readonly AlertRecord[]): AlertRecord | undefined {
  if (takeoverQueue(alerts).length > 0) return undefined;
  return byPrecedence(visibleAlerts(alerts)).find((a) => a.tier === "caution" && a.status === "open");
}

/** Count for the Safety nav badge: alerts that need Acknowledge and have not been acknowledged. */
export function needsAckCount(alerts: readonly AlertRecord[]): number {
  return visibleAlerts(alerts).filter((a) => a.needs_ack && UNACKNOWLEDGED.has(a.status)).length;
}
