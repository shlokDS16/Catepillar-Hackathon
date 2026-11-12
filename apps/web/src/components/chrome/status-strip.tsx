"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { safetyTone } from "@/alerts/selectors";
import { useSafetyState } from "@/alerts/use-safety-state";
import { Chip } from "@/components/ui/chip";
import { Mark, Pictogram, type PictogramName } from "@/components/ui/pictogram";
import { useAppState, useDataPort } from "@/data/store";
import { ledgerBand } from "@/inbox/fm-band";
import { setLastVerify, useLastVerify } from "@/ledger/last-verify";
import { dataLabel } from "@/chrome/data-label";
import { useDataSource } from "@/data/use-data-source";
import { syncState } from "@/chrome/sync-state";
import { useMotionLock } from "@/hero/use-motion-lock";

const FALLBACK_PICTO: Record<"clear" | "nosignal", PictogramName> = { clear: "seatbelt", nosignal: "sos" };

/**
 * FM only: runs a read-only ledger verify when the band mounts and again whenever a ledger_tamper alert
 * appears or goes, and publishes the result (the band cell and the Inbox seal line read it). A failed
 * or offline check keeps the last result; nothing is written or sent.
 */
function useLedgerVerify(enabled: boolean) {
  const port = useDataPort();
  const tamper = useAppState((s) => s.alerts.filter((a) => a.kind === "ledger_tamper").length);
  const simNow = useAppState((s) => s.clock?.sim_now ?? null);
  const clockRef = useRef<string | null>(null);
  useEffect(() => {
    clockRef.current = simNow;
  }, [simNow]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    port
      .ledgerVerify({ p_from: 1, p_to: null })
      .then((out) => {
        if (!live) return;
        setLastVerify({
          ok: out.ok && out.chain_ok,
          headSeq: out.head_seq,
          firstBadSeq: out.first_bad_seq ?? null,
          atMs: clockRef.current ? Date.parse(clockRef.current) : Date.now(),
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, port, tamper]);
}

/**
 * The ink status band: [state plate][connectivity caption][Language][Ask] (operator) or
 * [page title][caption][Language] (fleet manager), all from the store.
 * Colour + pictogram + word, always; NO SIGNAL after 10 s without a frame.
 * While the motion lock shows, the strip stays visible above it but goes inert: its safety chip
 * is a Link, so it must not stay tab-reachable or tappable during the lock (interaction-map §6).
 */
export function StatusStrip({ showSafety = true, title, actions }: { showSafety?: boolean; title?: ReactNode; actions?: ReactNode }) {
  const t = useTranslations();
  const format = useFormatter();
  const { safety, topAlert } = useSafetyState();
  const connectivity = useAppState((s) => s.connectivity);
  const clock = useAppState((s) => s.clock);
  const serverLocked = useAppState((s) => s.operator?.motion_locked ?? false);
  const lockShown = useMotionLock(serverLocked);

  const safetyWord = t(`enums.safety.${safety}`);
  const picto: PictogramName = topAlert ? KIND_PICTO[topAlert.kind] : safety === "nosignal" ? FALLBACK_PICTO.nosignal : FALLBACK_PICTO.clear;

  const source = useDataSource();
  const runStatus = useAppState((s) => s.snapshot?.run?.status ?? null);
  const connText = dataLabel({ connectivity, clock, t, formatTime: (ms) => format.dateTime(new Date(ms), "time"), source, runStatus });
  // The fleet manager's band (no safety chip) also shows the ledger state from the last verify.
  const fm = !showSafety;
  useLedgerVerify(fm);
  const band = ledgerBand(useLastVerify());
  const sync = syncState(connectivity);
  // No outbox exists yet, so "Saved" or "n queued" would claim something nothing measured: the cell shows only when offline.
  const syncText = sync.kind === "offline" ? t("chrome.syncOffline", { n: sync.n }) : null;

  return (
    <header className="strip" inert={lockShown || undefined}>
      {showSafety ? (
        <Chip
          tone={safetyTone(safety)}
          word
          icon={<Pictogram name={picto} />}
          count={topAlert?.occurrences}
          href="/op/safety"
          aria-label={t("chrome.safetyLabel", { state: safetyWord, count: topAlert?.occurrences ?? 1 })}
        >
          {safetyWord}
        </Chip>
      ) : null}
      {title}
      <div className="strip-cells">
        <span className="strip-cap t-caption" data-conn={connectivity.kind} title={source === "live" ? t("chrome.source.liveParts") : undefined}>
          {connText}
        </span>
        {fm && band.kind !== "unknown" ? (
          <span className="strip-ledger t-caption" data-state={band.kind}>
            <Mark kind={band.kind === "verified" ? "check" : "cross"} />
            <span className="sr-only">{t("fmBand.label")}: </span>
            {band.kind === "verified"
              ? t("fmBand.verified", { n: band.n, time: format.dateTime(new Date(band.atMs), "time") })
              : t("fmBand.checkNeeded", { n: band.n })}
          </span>
        ) : null}
        {syncText ? (
          <span className="strip-sync t-caption" data-state={sync.kind}>
            <span className="sr-only">{t("chrome.syncLabel")}: </span>
            {syncText}
          </span>
        ) : null}
      </div>
      <div className="strip-actions">{actions}</div>
    </header>
  );
}
