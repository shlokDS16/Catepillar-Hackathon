import type { AudioManifest } from "@/data/types";

/**
 * Stub AUDIO_MANIFEST until B23 writes packages/shared/src/audio/manifest.json (api-contracts §13).
 * Only the two demo-beat alerts are listed, so every other [Listen] stays hidden, as it should.
 * The clip files themselves land on main with B23; until then play() fails silently and the text stays.
 */
export const STUB_AUDIO_MANIFEST: AudioManifest = (
  [
    ["alert.seatbelt_off_moving.warning", "en"],
    ["alert.seatbelt_off_moving.warning", "hi"],
    ["alert.guardian_hazard.warning", "en"],
    ["alert.guardian_hazard.warning", "hi"],
    ["alert.guardian_hazard.critical", "en"],
    ["alert.guardian_hazard.critical", "hi"],
  ] as const
).map(([phrase_id, lang]) => ({
  phrase_id,
  lang,
  path: `/audio/${lang}/${phrase_id}.mp3`,
  bytes: 0,
  duration_ms: null,
  provider: "sarvam",
  model: "bulbul:v3",
  text_sha256: "0".repeat(64),
  status: "ok",
}));
