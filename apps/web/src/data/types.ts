/**
 * UI-side names for the frozen contracts (@cat/shared v1.0.0). Everything here is a type alias over
 * the shared zod schemas, so the wire format has exactly one definition. Names that @cat/shared
 * exports as types are re-used directly; the rest are inferred from their schema constant.
 */
import type { z } from "zod";
import type {
  ActiveAlert,
  AlertKind,
  AlertTier,
  AnyEvent,
  AudioManifest,
  AudioManifestEntry as AudioManifestEntrySchema,
  ClockTick as ClockTickSchema,
  GenericEvent,
  Lang,
  MachineDelta as MachineDeltaSchema,
  MySnapshotOut,
  ProtocolCard,
} from "@cat/shared";

export type { AlertKind, AlertTier, AudioManifest, Lang, ProtocolCard };
export type AlertRecord = z.infer<typeof ActiveAlert>;
export type AlertStatus = AlertRecord["status"];
export type AudioLang = "en" | "hi";
export type I18nText = { en: string; hi?: string; ta?: string };
export type AudioManifestEntry = z.infer<typeof AudioManifestEntrySchema>;
export type ClockTick = z.infer<typeof ClockTickSchema>;
export type MachineDelta = z.infer<typeof MachineDeltaSchema>;

export type Snapshot = MySnapshotOut;
export type Task = Snapshot["tasks"][number];
export type Machine = NonNullable<Snapshot["machine"]>;
export type OperatorState = NonNullable<Snapshot["operator_state"]>;
export type Weather = NonNullable<Snapshot["weather"]>;
export type Assignment = Snapshot["assignments"][number];

/** A typed event when the registry knows it, a generic row otherwise (unknown types render generically). */
export type AppEvent = AnyEvent | z.infer<typeof GenericEvent>;

export const TIER_RANK: Record<AlertTier, number> = { info: 0, caution: 1, warning: 2, critical: 3 };
