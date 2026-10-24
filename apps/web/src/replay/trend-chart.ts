/**
 * The telemetry trend card's geometry (S5b: "An SVG line chart per series … on a shared time axis,
 * with the event time marked ⚑. No chart library"). Pure: it turns the card's series into path
 * strings in SVG user units, so the component is a renderer and the maths is tested in node.
 *
 * One lane per series, stacked, all sharing one time domain. Seatbelt is a 0/1 step band; every
 * other metric is a line scaled to its own values, because speed in km/h and pitch in degrees
 * share no axis.
 */
import type { EvidenceCard } from "@cat/shared";

export type TrendCard = Extract<EvidenceCard, { type: "telemetry_trend" }>;
export type TrendSeries = TrendCard["series"];
export type TrendMetric = TrendSeries[number]["metric"];

/** User units. The SVG scales to its box; strokes are non-scaling so they stay 2 px on screen. */
export const LANE = { w: 320, h: 56, padX: 10, padY: 8 } as const;
const X0 = LANE.padX;
const X1 = LANE.w - LANE.padX;
const Y0 = LANE.padY;
const Y1 = LANE.h - LANE.padY;

/** Seatbelt is the one metric with a fixed, meaningful domain: 0 = off, 1 = on. */
const STEP_METRICS: ReadonlySet<TrendMetric> = new Set<TrendMetric>(["seatbelt"]);

export type TrendLane = {
  metric: TrendMetric;
  kind: "line" | "step";
  /** "M… L…" in user units, or null when the series has fewer than two points. */
  path: string | null;
  /** A single reading has no line; it is drawn as one dot so the lane is never blank by accident. */
  dot: { x: number; y: number } | null;
  /** The value domain actually drawn (padded when the series is flat). */
  min: number;
  max: number;
  /** The last reading in the window, for the figure next to the lane; null when there is none. */
  last: number | null;
  empty: boolean;
};

/** The window every lane shares. Equal t0/t1 means a single instant, not a span. */
export function trendSpan(series: TrendSeries): { t0: number; t1: number } {
  const ts = series.flatMap((s) => s.points.map((p) => p.t_ms));
  if (ts.length === 0) return { t0: 0, t1: 0 };
  return { t0: Math.min(...ts), t1: Math.max(...ts) };
}

/** The window's length in whole seconds, for "{s} s before" on the axis. */
export function trendWindowS(series: TrendSeries): number {
  const { t0, t1 } = trendSpan(series);
  return Math.round((t1 - t0) / 1000);
}

/**
 * Where the ⚑ stands. The contract carries no event offset inside the card, and the server builds
 * the window up to the breach (in the fixture the last sample IS the breach: 6.2 km/h at 17.4°),
 * so the flag marks the end of the window and is labelled with the scenario's own event time —
 * a real timestamp, never an invented one. `eventTMs` is here for the day the contract grows one.
 */
export function flagX(series: TrendSeries, eventTMs?: number): number {
  const { t0, t1 } = trendSpan(series);
  return xOf(eventTMs ?? t1, t0, t1);
}

function xOf(t: number, t0: number, t1: number): number {
  if (t1 <= t0) return (X0 + X1) / 2;
  const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return X0 + f * (X1 - X0);
}

/** A flat series would divide by zero; pad it by 1 unit so the line sits in the middle of its lane. */
function domainOf(metric: TrendMetric, values: number[]): { min: number; max: number } {
  if (STEP_METRICS.has(metric)) return { min: 0, max: 1 };
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

function yOf(v: number, min: number, max: number): number {
  if (max <= min) return (Y0 + Y1) / 2;
  const f = Math.min(1, Math.max(0, (v - min) / (max - min)));
  return Y1 - f * (Y1 - Y0);
}

const n = (v: number) => Number(v.toFixed(1));

/** A step band holds its value until the next reading, which is what a 0/1 signal actually does. */
function pathOf(points: Array<{ x: number; y: number }>, kind: "line" | "step"): string {
  const d: string[] = [`M${n(points[0].x)} ${n(points[0].y)}`];
  for (let i = 1; i < points.length; i += 1) {
    if (kind === "step") d.push(`L${n(points[i].x)} ${n(points[i - 1].y)}`);
    d.push(`L${n(points[i].x)} ${n(points[i].y)}`);
  }
  return d.join(" ");
}

export function trendLanes(series: TrendSeries): TrendLane[] {
  const { t0, t1 } = trendSpan(series);
  return series.map((s) => {
    const kind: "line" | "step" = STEP_METRICS.has(s.metric) ? "step" : "line";
    const values = s.points.map((p) => p.v);
    const { min, max } = domainOf(s.metric, values);
    const xy = s.points.map((p) => ({ x: xOf(p.t_ms, t0, t1), y: yOf(p.v, min, max) }));
    return {
      metric: s.metric,
      kind,
      path: xy.length > 1 ? pathOf(xy, kind) : null,
      dot: xy.length === 1 ? xy[0] : null,
      min,
      max,
      last: values.length > 0 ? values[values.length - 1] : null,
      empty: xy.length === 0,
    };
  });
}
