import type { AlertKind, AlertTier, AudioLang, AudioManifest, Lang } from "@/data/types";

/**
 * The feedback plan for one alert (interaction-map §5). Pure, so vitest covers it without a DOM;
 * useAlertFeedback applies it with navigator.vibrate and an <audio> element.
 */
export type FeedbackPlan = {
  /** Vibration pattern in ms, or null for silence. */
  vibrate: number[] | null;
  /** Repeat the vibration every n ms; null means once. */
  vibrateEveryMs: number | null;
  /** Clip URL, or null when the manifest has no `ok` entry for this phrase and language. */
  clip: string | null;
  clipEveryMs: number | null;
  /** Maximum plays including the first; Infinity for Critical (until acknowledged). */
  clipMaxPlays: number;
};

const SILENT: FeedbackPlan = { vibrate: null, vibrateEveryMs: null, clip: null, clipEveryMs: null, clipMaxPlays: 0 };

/** Alert audio exists in `en` and `hi` only; the Tamil UI falls back to `en` (safety audio beats silence). */
export function alertAudioLang(lang: Lang): AudioLang {
  return lang === "hi" ? "hi" : "en";
}

/** Resolve a phrase to its clip URL, or null when the manifest does not list it as `ok`. */
export function clipFor(manifest: AudioManifest, phraseId: string, lang: AudioLang): string | null {
  const entry = manifest.find((e) => e.phrase_id === phraseId && e.lang === lang && e.status === "ok");
  return entry ? entry.path : null;
}

export function feedbackPlan(tier: AlertTier, kind: AlertKind, lang: Lang, manifest: AudioManifest): FeedbackPlan {
  switch (tier) {
    case "info":
      return SILENT;
    case "caution":
      return { ...SILENT, vibrate: [200] };
    case "warning":
      return {
        vibrate: [400, 200, 400],
        vibrateEveryMs: 5_000,
        clip: clipFor(manifest, `alert.${kind}.warning`, alertAudioLang(lang)),
        clipEveryMs: 10_000,
        clipMaxPlays: 6,
      };
    case "critical":
      return {
        vibrate: [800, 200, 800, 200, 800],
        vibrateEveryMs: 4_000,
        clip: clipFor(manifest, `alert.${kind}.critical`, alertAudioLang(lang)),
        clipEveryMs: 10_000,
        clipMaxPlays: Number.POSITIVE_INFINITY,
      };
  }
}
