"use client";

import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { safetyTone } from "@/alerts/selectors";
import { useSafetyState } from "@/alerts/use-safety-state";
import { Chip } from "@/components/ui/chip";
import { Pictogram, type PictogramName } from "@/components/ui/pictogram";
import { useAppState } from "@/data/store";
import { dataLabel } from "@/chrome/data-label";
import { useDataSource } from "@/data/use-data-source";
import { syncState } from "@/chrome/sync-state";
import { useMotionLock } from "@/hero/use-motion-lock";

const FALLBACK_PICTO: Record<"clear" | "nosignal", PictogramName> = { clear: "seatbelt", nosignal: "sos" };

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
