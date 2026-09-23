"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";
import { playClip, useAudioState } from "@/alerts/audio";
import { clipFor } from "@/alerts/feedback";
import { STUB_AUDIO_MANIFEST } from "@/alerts/stub-manifest";
import type { AudioLang, AudioManifest, Lang } from "@/data/types";

/**
 * The manifest B23 writes (packages/shared/src/audio/manifest.json, committed by the integrator).
 * Until it lands the stub lists the demo-beat alerts only, so every other [Listen] stays hidden.
 */
export const AUDIO_MANIFEST: AudioManifest = STUB_AUDIO_MANIFEST;

/** Alerts fall back to `en` in the Tamil UI; every other group is hidden there (screens.md i18n rules). */
export function audioLangFor(phraseId: string, lang: Lang): AudioLang | null {
  if (lang === "hi" || lang === "en") return lang;
  return phraseId.startsWith("alert.") ? "en" : null;
}

/**
 * useAudio(phraseId): `available` decides whether [Listen] renders; `play` replays the clip.
 * A missing or `missing`-status entry hides the button; the text always stays on screen.
 */
export function useAudio(phraseId: string | null | undefined) {
  const lang = useLocale() as Lang;
  const { blocked } = useAudioState();
  const audioLang = phraseId ? audioLangFor(phraseId, lang) : null;
  const clip = phraseId && audioLang ? clipFor(AUDIO_MANIFEST, phraseId, audioLang) : null;
  const play = useCallback(() => {
    if (clip) void playClip(clip);
  }, [clip]);
  return { available: clip !== null, blocked, play };
}
