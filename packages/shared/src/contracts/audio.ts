/**
 * Audio phrases and manifest (api-contracts §13, D7 Sarvam, UI-17). Clips live at
 * `apps/web/public/audio/{lang}/{phrase_id}.mp3`; `PHRASES` (audio/phrases.ts) and `manifest.json` are
 * written by B23. Dynamic numbers are never spoken from clips.
 */
import { z } from "zod";
import { Hash64, I18nText } from "./enums";

export const PHRASE_ID = /^[a-z0-9_.]+$/;
export const PHRASE_MAX_CHARS = 2500;   // Sarvam bulbul:v3 limit
export const Phrase = z.object({ id: z.string().regex(PHRASE_ID), group: z.enum(["alert", "guardian",
  "sos", "lesson", "replay"]), text: I18nText.extend({ hi: z.string() }) });
export const AudioManifestEntry = z.object({ phrase_id: z.string(), lang: z.enum(["en", "hi"]),
  path: z.string(), bytes: z.number().int(), duration_ms: z.number().int().nullable(),
  provider: z.enum(["sarvam", "gemini"]), model: z.string(), text_sha256: Hash64,
  status: z.enum(["ok", "missing"]) });
export const AUDIO_MANIFEST_ENTRY = AudioManifestEntry;   // the name api-contracts §13 uses
export const AudioManifest = z.array(AudioManifestEntry);

export const audioPath = (lang: "en" | "hi", phraseId: string) => `/audio/${lang}/${phraseId}.mp3`;

export type Phrase = z.infer<typeof Phrase>;
export type AudioManifest = z.infer<typeof AudioManifest>;
