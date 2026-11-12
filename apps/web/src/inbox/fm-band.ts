import type { Machine } from "@/data/types";
import type { InboxItem } from "@/inbox/inbox";
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
export type LastVerify = { ok: boolean; headSeq: number; firstBadSeq: number | null; atMs: number; unavailable?: boolean };

/**
 * A verdict for the band. In Live mode the adapter answers a failed call (forbidden, network, busy) from fixtures:
 * that verdict was never checked against the real chain, so it is stored as unavailable, never as verified.
 * `localOk` is the browser re-check on the Ledger page; both must pass.
 */
export function toLastVerify(
  out: { ok: boolean; chain_ok: boolean; head_seq: number; first_bad_seq: number | null },
  atMs: number,
  fellBack: boolean,
  localOk: boolean = true,
): LastVerify {
  return { ok: out.ok && out.chain_ok && localOk, headSeq: out.head_seq, firstBadSeq: out.first_bad_seq ?? null, atMs, unavailable: fellBack || undefined };
}

export type LedgerBand = { kind: "unknown" } | { kind: "unavailable" } | { kind: "verified"; n: number; atMs: number } | { kind: "check"; n: number };

/** "214 entries · check needed" after a failed verify, "214 entries · verified hh:mm" after a clean one; nothing before the first. */
export function ledgerBand(v: LastVerify | null): LedgerBand {
  if (!v) return { kind: "unknown" };
  if (v.unavailable) return { kind: "unavailable" };
  return v.ok ? { kind: "verified", n: v.headSeq, atMs: v.atMs } : { kind: "check", n: v.headSeq };
}

/** The number the next sealed entry will get (head + 1), or null before any verify. */
export function nextSealNumber(v: LastVerify | null): number | null {
  return v && !v.unavailable ? v.headSeq + 1 : null;
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

/**
 * Guard for the band's re-verify: at most one in flight, and none within `minGapMs` of the last finish.
 * `start()` returns false when the call should be skipped; call `finish()` when the verify settles.
 */
export function createVerifyGate(minGapMs: number, now: () => number = Date.now) {
  let busy = false;
  let lastEnd = Number.NEGATIVE_INFINITY;
  return {
    start(): boolean {
      if (busy || now() - lastEnd < minGapMs) return false;
      busy = true;
      return true;
    },
    finish(): void {
      busy = false;
      lastEnd = now();
    },
  };
}
