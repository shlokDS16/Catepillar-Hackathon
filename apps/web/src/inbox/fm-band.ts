import type { Machine } from "@/data/types";
import { TIER_RANK } from "@/data/types";
import type { InboxGroups, InboxItem } from "@/inbox/inbox";
import { machineParts, worstPart, type MachinePartView, type PartId } from "@/machine/parts";

/** Pure rules for the FM detail pane, the band's ledger cell and the phone triage focus (D17 phase 3). */

export type TierCounts = { critical: number; warning: number; caution: number };

/** Open (needs action) alerts per tier, for "Critical 1 · Warning 1 · Caution 4". */
export function tierCounts(items: readonly InboxItem[]): TierCounts {
  const c: TierCounts = { critical: 0, warning: 0, caution: 0 };
  for (const i of items) if (i.tier === "critical" || i.tier === "warning" || i.tier === "caution") c[i.tier] += 1;
  return c;
}

/** The tiers that have at least one alert, highest first, with their count. Zero tiers are left out. */
export function tierChips(c: TierCounts): { tier: keyof TierCounts; n: number }[] {
  return (["critical", "warning", "caution"] as const).filter((t) => c[t] > 0).map((tier) => ({ tier, n: c[tier] }));
}

/** The result of the last ledger verify, as the band and the detail pane need it. */
export type LastVerify = { ok: boolean; headSeq: number; firstBadSeq: number | null; atMs: number };

export type LedgerBand = { kind: "unknown" } | { kind: "verified"; n: number; atMs: number } | { kind: "check"; n: number };

/** "214 entries · check needed" after a failed verify, "214 entries · verified hh:mm" after a clean one; nothing before the first. */
export function ledgerBand(v: LastVerify | null): LedgerBand {
  if (!v) return { kind: "unknown" };
  return v.ok ? { kind: "verified", n: v.headSeq, atMs: v.atMs } : { kind: "check", n: v.headSeq };
}

/** The number the next sealed entry will get (head + 1), or null before any verify. */
export function nextSealNumber(v: LastVerify | null): number | null {
  return v ? v.headSeq + 1 : null;
}

/** The phone triage focus: the highest-tier open alert (the list is already ordered tier, then age). */
export function triageFocus(groups: InboxGroups): InboxItem | null {
  let best: InboxItem | null = null;
  for (const i of groups.needsAction) if (!best || TIER_RANK[i.tier] > TIER_RANK[best.tier]) best = i;
  return best;
}

/** A ledger break shows Verify and Compare (both open /fm/ledger); every other alert has none of these. */
export function ledgerActions(item: InboxItem): { verify: boolean; compare: boolean } {
  const on = item.kind === "ledger_tamper" && item.status === "open";
  return { verify: on, compare: on };
}

/** Which part of the drawing an alert points at. Only kinds that concern one machine part name one. */
export function faultyPartFor(item: InboxItem, parts: readonly MachinePartView[]): PartId | null {
  switch (item.kind) {
    case "seatbelt_off_moving":
      return "cab";
    case "idle_excess":
      return "engine";
    case "guardian_hazard":
    case "anomaly_machine":
      return worstPart([...parts])?.id ?? null;
    default:
      return null;
  }
}

/**
 * The drawing for an alert: only when the alert is about the machine whose parts we have (the store's
 * machine) and parts exist. Never for a near-miss or any row without a machine code.
 */
export function detailMachine(item: InboxItem, machine: Machine | null | undefined): { parts: MachinePartView[]; highlight: PartId | null } | null {
  if (!machine || item.nonPunitive || !item.machineCode || item.machineCode !== machine.code) return null;
  const parts = machineParts({ machine });
  if (parts.length === 0) return null;
  return { parts, highlight: faultyPartFor(item, parts) };
}
