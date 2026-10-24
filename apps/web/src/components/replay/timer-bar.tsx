"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import { ANNOUNCE_FROM_S, type TimerSnapshot } from "@/replay/timer";

type Props = {
  timer: TimerSnapshot;
  /** The line that says what the clock is for ("Open the cards you need…"). */
  children?: ReactNode;
};

/**
 * The Replay countdown (interaction-map §4.5 "Timer behaviour"): a full-width bar that drains
 * linearly plus the seconds left as a --t-figure number. Shared by Investigate and, in R3, by
 * each Decide step.
 *
 * The bar is ink and never a safety colour — urgency in training must not look like a live alarm —
 * and there is no vibration and no alarm sound. From 5 s the number is announced once a second.
 * Reduced motion zeroes --dur-tick, so the bar steps once per second instead of sliding.
 */
export function ReplayTimerBar({ timer, children }: Props) {
  const t = useTranslations("replay.investigate");
  const seconds = timer.secondsLeft;
  const announce = seconds !== null && seconds <= ANNOUNCE_FROM_S ? t("secondsLeft", { s: seconds }) : "";

  return (
    <div className="replay-timer">
      <div className="replay-timer-track" aria-hidden="true">
        <span className="replay-timer-fill" style={{ "--fill": timer.fraction } as CSSProperties} />
      </div>
      <div className="replay-timer-row">
        <p className="replay-timer-figure">
          <span className="t-figure tnum">{seconds ?? "—"}</span>
          <span className="t-label text-ink-2">{t("secondsUnit")}</span>
        </p>
        {children}
      </div>
      {/* Always mounted: a live region that appears together with its text is never announced. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
