"use client";

import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { playClip, stopClip } from "@/alerts/audio";
import { feedbackPlan } from "@/alerts/feedback";
import { STUB_AUDIO_MANIFEST } from "@/alerts/stub-manifest";
import { TIER_RANK, type AlertRecord, type Lang } from "@/data/types";

type Feedback = {
  /** Changes only when the SAME alert rises in tier, so the plate replays its 480 ms stamp once. */
  stampKey: number;
  /** The resolved clip for [Listen], or null when the manifest has none. */
  clip: string | null;
  /** Replays the clip on demand (A12 Listen). */
  listen: () => void;
};

/**
 * Applies the feedback plan of the alert that is taking over: vibration and audio at the tier's
 * cadence, restarted on a tier upgrade, stopped the moment the alert leaves (acknowledged or
 * resolved). Vibration and audio are unaffected by reduced motion.
 */
export function useAlertFeedback(alert: AlertRecord | undefined): Feedback {
  const locale = useLocale() as Lang;
  const [stampKey, setStampKey] = useState(0);
  const previous = useRef<{ id: string; tier: AlertRecord["tier"] } | null>(null);

  const id = alert?.alert_id;
  const tier = alert?.tier;
  const kind = alert?.kind;
  const clip = tier && kind ? feedbackPlan(tier, kind, locale, STUB_AUDIO_MANIFEST).clip : null;

  // The stamp: same alert, higher tier (upgraded_from). Never on a swap to another alert.
  useEffect(() => {
    if (!id || !tier) {
      previous.current = null;
      return;
    }
    const prev = previous.current;
    if (prev && prev.id === id && TIER_RANK[tier] > TIER_RANK[prev.tier]) setStampKey((k) => k + 1);
    previous.current = { id, tier };
  }, [id, tier]);

  useEffect(() => {
    if (!id || !tier || !kind) return;
    const plan = feedbackPlan(tier, kind, locale, STUB_AUDIO_MANIFEST);
    const timers: number[] = [];
    let cancelled = false;
    let plays = 0;

    const vibrate = () => {
      if (plan.vibrate && typeof navigator.vibrate === "function") navigator.vibrate(plan.vibrate);
    };
    const play = () => {
      if (!plan.clip || plays >= plan.clipMaxPlays) return;
      plays += 1;
      void playClip(plan.clip).then(() => {
        // Acknowledged while the clip was still starting: stop it now.
        if (cancelled) stopClip();
      });
    };

    vibrate();
    play();
    if (plan.vibrateEveryMs) timers.push(window.setInterval(vibrate, plan.vibrateEveryMs));
    if (plan.clip && plan.clipEveryMs) timers.push(window.setInterval(play, plan.clipEveryMs));

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearInterval(t));
      if (typeof navigator.vibrate === "function") navigator.vibrate(0);
      stopClip();
    };
  }, [id, tier, kind, locale]);

  return {
    stampKey,
    clip,
    listen: () => {
      if (clip) void playClip(clip);
    },
  };
}
