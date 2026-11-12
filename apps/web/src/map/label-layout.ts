/**
 * Marker label placement, pure: each label goes on the first side (below, above, right, left) where
 * it stays inside the frame and does not touch a label or marker already placed, highest priority
 * first (own machine, then hazards, then the rest). When no side is clear it takes the side with the
 * least overlap, so a label is never hidden, only moved.
 */
export type Side = "below" | "above" | "right" | "left";

export type LabelItem = {
  id: string;
  x: number;
  y: number;
  /** Estimated label size in px. */
  w: number;
  h: number;
  /** Lower is placed first. */
  priority: number;
};

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Half the marker glyph plus a gap: how far a label starts from the marker centre. */
export const LABEL_GAP = 28;
const MARGIN = 8;

/** A rough label width: mono-ish 8.5 px per character plus the plate's padding. */
export function estimateLabel(lines: readonly string[]): { w: number; h: number } {
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return { w: Math.round(longest * 8.5 + 20), h: lines.length * 20 + 8 };
}

function rectFor(it: LabelItem, side: Side): Rect {
  switch (side) {
    case "below":
      return { x0: it.x - it.w / 2, y0: it.y + LABEL_GAP, x1: it.x + it.w / 2, y1: it.y + LABEL_GAP + it.h };
    case "above":
      return { x0: it.x - it.w / 2, y0: it.y - LABEL_GAP - it.h, x1: it.x + it.w / 2, y1: it.y - LABEL_GAP };
    case "right":
      return { x0: it.x + LABEL_GAP, y0: it.y - it.h / 2, x1: it.x + LABEL_GAP + it.w, y1: it.y + it.h / 2 };
    case "left":
      return { x0: it.x - LABEL_GAP - it.w, y0: it.y - it.h / 2, x1: it.x - LABEL_GAP, y1: it.y + it.h / 2 };
  }
}

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** How much of the rect lies outside the frame (px^2). */
function outside(r: Rect, frame: { w: number; h: number }): number {
  const area = (r.x1 - r.x0) * (r.y1 - r.y0);
  const inside = overlap(r, { x0: MARGIN, y0: MARGIN, x1: frame.w - MARGIN, y1: frame.h - MARGIN });
  return area - inside;
}

export function placeLabels(items: readonly LabelItem[], frame: { w: number; h: number }): Record<string, Side> {
  const order = [...items].sort((a, b) => a.priority - b.priority);
  // Every marker's glyph is an obstacle for every label, not only its own.
  const markers: Rect[] = items.map((i) => ({ x0: i.x - 22, y0: i.y - 22, x1: i.x + 22, y1: i.y + 22 }));
  const placed: Rect[] = [];
  const out: Record<string, Side> = {};
  const sides: Side[] = ["below", "above", "right", "left"];
  for (const it of order) {
    let best: { side: Side; cost: number; rect: Rect } | null = null;
    for (const side of sides) {
      const r = rectFor(it, side);
      const cost = outside(r, frame) * 4 + [...placed, ...markers].reduce((sum, o) => sum + overlap(r, o), 0);
      if (best === null || cost < best.cost) best = { side, cost, rect: r };
      if (cost === 0) break;
    }
    if (best) {
      out[it.id] = best.side;
      placed.push(best.rect);
    }
  }
  return out;
}
