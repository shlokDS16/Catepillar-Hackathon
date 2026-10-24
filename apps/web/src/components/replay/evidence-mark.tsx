import { ChartLine, ClipboardList, Clock, Map as MapGlyph, Thermometer, Wind, Wrench } from "lucide-react";
import type { EvidenceType } from "@/replay/evidence";

/**
 * The card-type glyph on an Investigate plate. These are category marks, so they are lucide UI
 * icons (visual-language §4), never one of our six safety pictograms: a triangle sign next to
 * "Wind" would read as a live hazard, and inside a replay nothing is live.
 */
const GLYPH: Record<EvidenceType, typeof ChartLine> = {
  telemetry_trend: ChartLine,
  wind: Wind,
  map_snapshot: MapGlyph,
  fault_code: Wrench,
  protocol_card: ClipboardList,
  weather: Thermometer,
  shift_hours: Clock,
};

/** Decorative: the card's title is always next to it. */
export function EvidenceMark({ type }: { type: EvidenceType }) {
  const Glyph = GLYPH[type];
  return <Glyph className="ev-mark" aria-hidden="true" strokeWidth={2} />;
}
