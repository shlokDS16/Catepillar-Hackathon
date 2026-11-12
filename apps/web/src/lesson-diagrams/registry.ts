import { blindspot, type BlindFrame } from "./blindspot";
import { compare, type CompareFrame } from "./compare";
import type { Diagram } from "./core";
import { rollover, type RolloverFrame } from "./rollover";

export type AnyDiagram =
  | { kind: "rollover"; diagram: Diagram<RolloverFrame> }
  | { kind: "compare"; diagram: Diagram<CompareFrame> }
  | { kind: "blindspot"; diagram: Diagram<BlindFrame> };

const BY_PICTOGRAM: Record<string, AnyDiagram> = {
  rollover: { kind: "rollover", diagram: rollover },
  belt_compare: { kind: "compare", diagram: compare },
  blindspot: { kind: "blindspot", diagram: blindspot },
};

/** The diagram a lesson card carries, chosen by its authored pictogram name; null means the plain sign. */
export function diagramFor(pictogram: string | null | undefined): AnyDiagram | null {
  return pictogram ? (BY_PICTOGRAM[pictogram] ?? null) : null;
}
