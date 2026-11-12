import type { z } from "zod";
import type { AnomalyDetected, PpeItem } from "@cat/shared";
import { TIER_RANK, type AlertKind, type AlertStatus, type AlertTier } from "@/data/types";

/**
 * Inbox (S7) view model and its pure rules. Screens render this; nothing here touches the DOM, so
 * the ordering, grouping, reason validation and near-miss privacy are all unit-tested.
 */
export type InboxKind = AlertKind | "near_miss";
export type InboxAnomaly = z.infer<typeof AnomalyDetected>;

export type InboxItem = {
  id: string;
  kind: InboxKind;
  tier: AlertTier;
  status: AlertStatus;
  needsAck: boolean;
  occurrences: number;
  firstSeen: string;
  /** Display name only (never the pseudonym); always null on a non-punitive row. */
  operatorName: string | null;
  machineCode: string | null;
  /** Set on a `ppe_missing` row whose task is `blocked_ppe`: the A21 target. */
  taskId: string | null;
  taskBlocked: boolean;
  missing: z.infer<typeof PpeItem>[];
  /** Last `dispatch.*` line as "channel:status" (for example "telegram:sent"), or null. */
  dispatch: string | null;
  anomaly: InboxAnomaly | null;
  /** Near-miss rows are non-punitive (handoff B→F): no operator, no Acknowledge. */
  nonPunitive: boolean;
};

export const REASON_MIN = 10;
export const REASON_MAX = 500;

export type ReasonError = "too_short" | "too_long" | "control_chars";
export type ReasonCheck = { ok: true; value: string } | { ok: false; error: ReasonError };

// Same rule as the PpeOverrideIn contract: no C0 control characters (data-model §4.3).
const CONTROL = /[\u0000-\u001f]/;

/** 10 to 500 characters, no control characters. Padding with spaces does not count towards the minimum. */
export function validateReason(raw: string): ReasonCheck {
  if (CONTROL.test(raw)) return { ok: false, error: "control_chars" };
  const value = raw.trim();
  if (value.length < REASON_MIN) return { ok: false, error: "too_short" };
  if (value.length > REASON_MAX) return { ok: false, error: "too_long" };
  return { ok: true, value };
}

/** Defence in depth: whatever the adapter sends, a non-punitive row never carries a person. */
export function sanitise(item: InboxItem): InboxItem {
  return item.nonPunitive || item.kind === "near_miss" ? { ...item, operatorName: null, nonPunitive: true } : item;
}

/** Highest tier first, then oldest first (the longest-waiting sits above), then id for a stable order. */
export function orderInbox(items: readonly InboxItem[]): InboxItem[] {
  return [...items].sort(
    (a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || a.firstSeen.localeCompare(b.firstSeen) || a.id.localeCompare(b.id),
  );
}

export type InboxGroups = {
  /** L1-L2: open alerts. */
  needsAction: InboxItem[];
  /** L3: acknowledged, escalating or escalated. */
  handled: InboxItem[];
  /** L5: resolved. */
  resolved: InboxItem[];
  /** L5: suppressed (n). */
  suppressed: InboxItem[];
};

export function groupInbox(items: readonly InboxItem[]): InboxGroups {
  const ordered = orderInbox(items.map(sanitise));
  const pick = (...s: AlertStatus[]) => ordered.filter((i) => s.includes(i.status));
  return {
    needsAction: pick("open"),
    handled: pick("acknowledged", "escalating", "escalated"),
    resolved: pick("resolved"),
    suppressed: pick("suppressed"),
  };
}

/** Which row offers which action. */
export function rowActions(item: InboxItem): { acknowledge: boolean; override: boolean; showOnMap: boolean } {
  const open = item.status === "open";
  return {
    acknowledge: open && item.needsAck && !item.nonPunitive && item.kind !== "near_miss",
    override: open && item.kind === "ppe_missing" && item.taskBlocked && item.taskId !== null,
    showOnMap: item.anomaly !== null || item.kind === "guardian_hazard" || item.kind === "proximity_zone",
  };
}

/** Anomaly rows expand to the full AnomalyExplain; one toggle per row, any number open at once. */
export function toggleExpanded(open: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(open);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** "telegram:sent" to its two parts; null for anything that is not a channel:status pair. */
export function parseDispatch(line: string | null): { channel: string; status: string } | null {
  if (!line) return null;
  const [channel, status] = line.split(":");
  return channel && status ? { channel, status } : null;
}
