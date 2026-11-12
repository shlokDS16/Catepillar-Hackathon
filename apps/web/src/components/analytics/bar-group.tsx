import type { ReactNode } from "react";

export type BarPattern = "solid" | "outline" | "hatch" | "light";
export type BarRow = {
  key: string;
  label: string;
  /** null = no data: a dashed gap and the note, never a zero-length bar. */
  value: number | null;
  /** Printed value (already formatted); ignored when value is null. */
  text?: string;
  pattern: BarPattern;
};

export const BAR_ROW_H = 30;
const GAP = 6;

/** The three fills, defined once per page; bars reference them by id. Ink only: patterns carry the meaning. */
export function BarPatterns() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <pattern id="bp-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" style={{ fill: "var(--surface)" }} />
          <line x1="0" y1="0" x2="0" y2="8" strokeWidth="3.5" style={{ stroke: "var(--ink)" }} />
        </pattern>
        <pattern id="bp-light" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" style={{ fill: "var(--surface)" }} />
          <circle cx="3" cy="3" r="1.2" style={{ fill: "var(--ink)" }} />
        </pattern>
      </defs>
    </svg>
  );
}

/** A little swatch for the legend, same fill as the bars. */
export function Swatch({ pattern }: { pattern: BarPattern }) {
  return (
    <svg className="bar-swatch" width="28" height="16" aria-hidden="true" focusable="false">
      <Rect pattern={pattern} x="1" width="26" y={1} h={14} />
    </svg>
  );
}

function Rect({ pattern, x, width, y, h }: { pattern: BarPattern; x: string; width: string; y: number; h: number }) {
  const fill = pattern === "solid" ? "var(--ink)" : pattern === "hatch" ? "url(#bp-hatch)" : pattern === "light" ? "url(#bp-light)" : "var(--surface)";
  return (
    <rect x={x} y={y} width={width} height={h} fill={fill} strokeWidth={pattern === "outline" ? 3 : 2} style={{ stroke: "var(--ink)" }} />
  );
}

/**
 * Horizontal grouped bars on one shared scale (`max`). Bars are SVG rects sized in percent; the printed values
 * sit in an HTML column of equal row height so Indic text and numbers stay crisp at 360 px.
 * `dim` draws the group at 40 % ink (few tasks).
 */
export function BarGroup({
  rows, max, dim = false, noData, caption, children,
}: {
  rows: BarRow[]; max: number; dim?: boolean; noData: string; caption?: string; children?: ReactNode;
}) {
  const h = rows.length * BAR_ROW_H;
  return (
    <div className="bg" data-dim={dim || undefined}>
      <div className="bg-plot">
        <svg className="bg-svg" width="100%" height={h} role="presentation" aria-hidden="true" focusable="false">
          <line x1="0" x2="0" y1="0" y2={h} strokeWidth="2" style={{ stroke: "var(--ink)" }} />
          {rows.map((r, i) => {
            const y = i * BAR_ROW_H + GAP / 2;
            const bh = BAR_ROW_H - GAP;
            if (r.value === null) {
              return <line key={r.key} x1="2" x2="40%" y1={y + bh / 2} y2={y + bh / 2} strokeWidth="2" strokeDasharray="4 5" style={{ stroke: "var(--ink-3)" }} />;
            }
            const pct = Math.max(0, Math.min(100, (r.value / max) * 100));
            return <Rect key={r.key} pattern={r.pattern} x="1" width={`${pct}%`} y={y} h={bh} />;
          })}
        </svg>
        <ul className="bg-vals t-mono" aria-hidden="true" style={{ ["--rh" as string]: `${BAR_ROW_H}px` }}>
          {rows.map((r) => (
            <li key={r.key} data-null={r.value === null || undefined}>
              {r.value === null ? noData : r.text}
            </li>
          ))}
        </ul>
      </div>
      {caption ? <p className="bg-cap t-meta">{caption}</p> : null}
      {children}
    </div>
  );
}
