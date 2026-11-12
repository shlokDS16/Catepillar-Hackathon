import type { PictogramName } from "@/components/ui/pictogram";

/**
 * The pictogram for a shift-tape mark, from what the mark is about (its lesson code, which names the
 * event type), not one icon for all. Heat is its own; an unknown or missing code gets the neutral
 * "fault" triangle (visual-language §4: a pictogram always accompanies colour and word).
 */
export function markPictogram(mark: { kind: "breach" | "heat"; lessonCode: string | null }): PictogramName {
  if (mark.kind === "heat") return "heat";
  const code = (mark.lessonCode ?? "").toLowerCase();
  if (code.includes("seatbelt") || code.includes("belt")) return "seatbelt";
  if (code.includes("proximity") || code.includes("zone")) return "proximity";
  if (code.includes("ppe") || code.includes("vest") || code.includes("helmet")) return "vest";
  if (code.includes("heat")) return "heat";
  return "fault";
}
