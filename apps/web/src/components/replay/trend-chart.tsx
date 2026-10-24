"use client";

import { useFormatter, useTranslations } from "next-intl";
import { LANE, flagX, trendLanes, trendWindowS, type TrendCard, type TrendLane, type TrendMetric } from "@/replay/trend-chart";

/** 0/1 is a state, not a quantity: the seatbelt lane prints On / Off, never "1". */
function BeltWord({ v }: { v: number }) {
  const t = useTranslations("replay.evidence");
  return <>{t(v >= 0.5 ? "belt.on" : "belt.off")}</>;
}

function LaneValue({ metric, v }: { metric: TrendMetric; v: number }) {
  const format = useFormatter();
  const t = useTranslations("replay.evidence");
  if (metric === "seatbelt") return <BeltWord v={v} />;
  return <>{t(`value.${metric}`, { v: format.number(v, { maximumFractionDigits: 1 }) })}</>;
}

/** The ⚑ at the end of the window, drawn rather than typed: a glyph font cannot be relied on. */
function Flag({ x }: { x: number }) {
  return (
    <g className="trend-flag" transform={`translate(${x} 0)`}>
      <line x1="0" y1="0" x2="0" y2={LANE.h} className="trend-flag-pole" />
      <path d="M0 2 L9 6 L0 10 Z" className="trend-flag-cloth" />
    </g>
  );
}

function Lane({ lane, flag }: { lane: TrendLane; flag: number }) {
  const t = useTranslations("replay.evidence");
  const metric = t(`metric.${lane.metric}`);

  return (
    <li className="trend-lane">
      <div className="trend-lane-head">
        <span className="t-label">{metric}</span>
        <span className="t-label tnum text-ink-2">
          {lane.last === null ? t("trend.noData") : <LaneValue metric={lane.metric} v={lane.last} />}
        </span>
      </div>
      {/* Uniform scaling (the default): "none" would stretch the flag and the step corners. */}
      <svg viewBox={`0 0 ${LANE.w} ${LANE.h}`} className="trend-svg" role="img" aria-label={t("trend.laneLabel", { metric })}>
        <line x1="0" y1={LANE.h - 1} x2={LANE.w} y2={LANE.h - 1} className="trend-base" />
        {lane.path ? <path d={lane.path} className="trend-line" data-kind={lane.kind} /> : null}
        {lane.dot ? <circle cx={lane.dot.x} cy={lane.dot.y} r="3" className="trend-dot" /> : null}
        <Flag x={flag} />
      </svg>
    </li>
  );
}

/**
 * The `telemetry_trend` evidence card (S5b): one SVG lane per series on a shared time axis, the
 * event marked with a flag. No chart library, ink only — no safety fills, because inside a replay
 * nothing is live. Each lane is scaled to its own metric; the geometry is in @/replay/trend-chart.
 */
export function TrendChart({ card, eventTime }: { card: TrendCard; eventTime: string }) {
  const t = useTranslations("replay.evidence");
  const lanes = trendLanes(card.series);
  const flag = flagX(card.series);
  const windowS = trendWindowS(card.series);

  if (lanes.length === 0) return <p className="t-body">{t("trend.noData")}</p>;

  return (
    <div className="trend">
      <ul className="trend-lanes">
        {lanes.map((lane) => (
          <Lane key={lane.metric} lane={lane} flag={flag} />
        ))}
      </ul>
      <div className="trend-axis t-meta text-ink-3">
        <span className="tnum">{t("trend.before", { s: windowS })}</span>
        <span className="tnum">{t("trend.flag", { time: eventTime })}</span>
      </div>
    </div>
  );
}
