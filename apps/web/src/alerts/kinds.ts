import type { AlertKind } from "@/data/types";
import type { PictogramName } from "@/components/ui/pictogram";

/** One pictogram per alert kind (visual-language §4: colour + pictogram + word, every time). */
export const KIND_PICTO: Record<AlertKind, PictogramName> = {
  seatbelt_off_moving: "seatbelt",
  guardian_hazard: "fault",
  proximity_zone: "proximity",
  ppe_missing: "vest",
  anomaly_machine: "fault",
  idle_excess: "fault",
  sos: "sos",
  ledger_tamper: "fault",
  alert_flood: "fault",
};
