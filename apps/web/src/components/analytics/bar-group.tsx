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
 * Horizontal grouped bars on one shared scale (`max`). Each row is an SVG bar whose width is a share of the
 * plot minus a fixed label gutter, followed by its value 8 px after the bar end (HTML text: Indic scripts and
 * numbers stay crisp). A null value is a 24 px dashed stub with the "no data" note, never a bar.
 * `dim` draws the group at 40 % ink (few tasks). Screen readers get the label and value of each row.
 */
export function BarGroup({
  rows, max, dim = false, noData, caption, children,
}: {
  rows: BarRow[]; max: number; dim?: boolean; noData: string; caption?: string; children?: ReactNode;
}) {
  return (
    <div className="bg" data-dim={dim || undefined}>
      <ul className="sr-only">
        {rows.map((r) => (
          <li key={r.key}>{r.label}: {r.value === null ? noData : r.text}</li>
        ))}
      </ul>
      <div className="bg-plot" aria-hidden="true" style={{ ["--rh" as string]: `${BAR_ROW_H}px` }}>
        {rows.map((r) => {
          const bh = BAR_ROW_H - GAP;
          const share = r.value === null ? 0 : Math.max(0, Math.min(1, r.value / max));
          return (
            <div className="bg-row" key={r.key}>
              {r.value === null ? (
                <svg className="bg-bar" width="24" height={BAR_ROW_H} focusable="false">
                  <line x1="2" x2="24" y1={BAR_ROW_H / 2} y2={BAR_ROW_H / 2} strokeWidth="2" strokeDasharray="4 4" style={{ stroke: "var(--ink-3)" }} />
                </svg>
              ) : (
                <svg className="bg-bar" height={BAR_ROW_H} focusable="false" style={{ width: `calc((100% - 6.5rem) * ${share})`, minWidth: 3 }}>
                  <Rect pattern={r.pattern} x="1" width="calc(100% - 2px)" y={GAP / 2} h={bh} />
                </svg>
              )}
              <span className="bg-val t-mono" data-null={r.value === null || undefined}>{r.value === null ? noData : r.text}</span>
            </div>
          );
        })}
      </div>
      {caption ? <p className="bg-cap t-meta">{caption}</p> : null}
      {children}
    </div>
  );
}
