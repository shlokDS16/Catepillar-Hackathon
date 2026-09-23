"use client";

import { useSyncExternalStore } from "react";

/**
 * One audio channel for the app: a single <audio> element, primed inside a user gesture (A01
 * choosing a language) so later programmatic play() calls are allowed, including on iOS where
 * unlocking an AudioContext would not unlock new media elements. If a play() is still refused we
 * show "Sound blocked, tap Listen" (interaction-map §5).
 */
type AudioState = { unlocked: boolean; blocked: boolean };
let state: AudioState = { unlocked: false, blocked: false };
const listeners = new Set<() => void>();
let channel: HTMLAudioElement | null = null;

/** 44-byte silent WAV, enough to count as a play inside the gesture. */
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

function set(next: Partial<AudioState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useAudioState(): AudioState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

function getChannel(): HTMLAudioElement {
  if (!channel) {
    channel = new Audio();
    channel.preload = "auto";
  }
  return channel;
}

/** Call from a user gesture: plays silence on the shared element so it is unlocked from then on. */
export async function unlockAudio(): Promise<void> {
  const el = getChannel();
  el.src = SILENCE;
  try {
    await el.play();
    set({ unlocked: true, blocked: false });
  } catch {
    set({ blocked: true });
  }
}

/**
 * Play one clip URL on the shared channel, replacing whatever was playing. Resolves when playback
 * starts, or with null. A refused play() (autoplay policy) marks the channel blocked; a missing file
 * is silent because the text always stays on screen.
 */
export function playClip(url: string): Promise<HTMLAudioElement | null> {
  const el = getChannel();
  el.src = url;
  return el
    .play()
    .then(() => {
      set({ blocked: false, unlocked: true });
      return el;
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "NotAllowedError") set({ blocked: true });
      return null;
    });
}

/** Stops the channel (an alert was acknowledged or left). */
export function stopClip() {
  if (channel) {
    channel.pause();
    channel.removeAttribute("src");
  }
}
