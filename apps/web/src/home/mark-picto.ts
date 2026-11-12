import { KIND_PICTO } from "@/alerts/kinds";
import type { PictogramName } from "@/components/ui/pictogram";
import type { AlertKind } from "@/data/types";

/** Lesson code to pictogram: an explicit table, never a substring guess. */
const LESSON_PICTO: Record<string, PictogramName> = {
  seatbelt_slopes: "seatbelt",
  faulty_machine_nearby: "fault",
};

/**
 * The pictogram for a shift-tape mark, from what the mark is about: heat is its own; an assignment's
 * lesson code goes through the table; a live breach mark (no assignment yet) uses its alert kind;
 * anything else gets the neutral "fault" triangle (visual-language §4: a pictogram always accompanies
 * colour and word).
 */
export function markPictogram(mark: { kind: "breach" | "heat"; lessonCode: string | null; alertKind?: AlertKind | null }): PictogramName {
  if (mark.kind === "heat") return "heat";
  if (mark.lessonCode && LESSON_PICTO[mark.lessonCode]) return LESSON_PICTO[mark.lessonCode]!;
  if (mark.alertKind) return KIND_PICTO[mark.alertKind];
  return "fault";
}
