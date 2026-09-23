/**
 * Local mirror of the frozen contracts in docs/architecture/api-contracts.md (§2-§4, §13).
 * TEMPORARY until IP0 lands `@cat/shared` on main; F07 replaces every import from here with
 * `@cat/shared` types. Field names and enums are copied verbatim so the swap is mechanical.
 */

export type AlertTier = "info" | "caution" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "escalating" | "escalated" | "resolved" | "suppressed";
export type AlertKind =
  | "seatbelt_off_moving"
  | "guardian_hazard"
  | "proximity_zone"
  | "ppe_missing"
  | "anomaly_machine"
  | "idle_excess"
  | "sos"
  | "ledger_tamper"
  | "alert_flood";
export type Lang = "en" | "hi" | "ta";
export type AudioLang = "en" | "hi";

export type I18nText = { en: string; hi?: string; ta?: string };

/** `alert.raised` payload plus the snapshot's status fields (`MySnapshotOut.active_alerts`). */
export type AlertRecord = {
  alert_id: string;
  kind: AlertKind;
  tier: AlertTier;
  needs_ack: boolean;
  escalate_at: string | null;
  occurrences: number;
  protocol_card_id: string | null;
  upgraded_from: AlertTier | null;
  status: AlertStatus;
  first_seen: string;
};

export type ProtocolCard = {
  id: string;
  title: I18nText;
  steps: I18nText[];
  pictogram: string;
  upwind_hint: boolean;
  version: number;
};

export type AudioManifestEntry = {
  phrase_id: string;
  lang: AudioLang;
  path: string;
  bytes: number;
  duration_ms: number | null;
  provider: "sarvam" | "gemini";
  model: string;
  text_sha256: string;
  status: "ok" | "missing";
};
export type AudioManifest = AudioManifestEntry[];

export const TIER_RANK: Record<AlertTier, number> = { info: 0, caution: 1, warning: 2, critical: 3 };
