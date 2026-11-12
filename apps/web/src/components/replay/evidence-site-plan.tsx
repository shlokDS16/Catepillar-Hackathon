"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { flagPoint, planCentroid, snapshotPoints, type MapSnapshotCard } from "@/replay/evidence";
import { planBounds, planProject, type LatLon } from "@/map/site-map";

type Zone = { id: string; name: string; polygon: LatLon[] };

export type PlanGeometry = {
  toXY: (p: LatLon) => { x: number; y: number };
  path: (points: readonly LatLon[]) => string;
  /** A mark unit in metres, sized from the plan's own extent. */
  u: number;
  box: { x: number; y: number; w: number; h: number };
};

/**
 * The shared SVG frame: viewBox fitted to `points`, the zones and their names, then whatever the
 * caller draws on top. The evidence card and the Debrief re-enactment both render through it, so
 * they share one projection and one look.
 */
export function SitePlanFrame({
  center,
  points,
  zones,
  label,
  children,
}: {
  center: LatLon;
  points: LatLon[];
  zones: Zone[];
  label: string;
  children: (g: PlanGeometry) => ReactNode;
}) {
  const locale = useLocale();
  // Zone names are data; the one pattern the fixtures use ("Bench 3") is localised for Hindi.
  const zoneLabel = (name: string) => (locale === "hi" ? name.replace(/^Bench (\d+)$/, "बेंच $1") : name);
  const box = planBounds([...zones.flatMap((z) => z.polygon), ...points, center], center);
  const toXY = (p: LatLon) => planProject(p, center);
  const path = (pts: readonly LatLon[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${toXY(p).x.toFixed(1)} ${toXY(p).y.toFixed(1)}`).join(" ");
  // Marks are in metres like everything else, so they are sized from the plan's own extent:
  // a fixed 10 m square is a dot on a quarry and a billboard on one bench.
  const u = Math.min(box.w, box.h) / 14;
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={label} className="site-plan-svg">
      {zones.map((z) => {
        const c = planCentroid(z.polygon, center);
        return (
          <g key={z.id}>
            <path d={`${path(z.polygon)} Z`} className="plan-zone" />
            {c ? (
              <text x={c.x} y={c.y} fontSize={u} className="plan-zone-name" textAnchor="middle">
                {zoneLabel(z.name)}
              </text>
            ) : null}
          </g>
        );
      })}
      {children({ toXY, path, u, box })}
    </svg>
  );
}

/** The flag is drawn, not typed: a flag glyph is not guaranteed in our display font. */
export function PlanFlag({ at, u, passed }: { at: { x: number; y: number }; u: number; passed?: boolean }) {
  return (
    <g
      className="plan-flag"
      data-passed={passed === undefined ? undefined : passed}
      transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}
    >
      <line x1="0" y1="0" x2="0" y2={-3 * u} className="plan-flag-pole" />
      <path d={`M0 ${-3 * u} L${1.8 * u} ${-2.4 * u} L0 ${-1.8 * u} Z`} className="plan-flag-cloth" />
    </g>
  );
}

/**
 * The `map_snapshot` evidence card: the site plan as flat SVG in metres: zones, the operator's
 * trail, the machine track and the flag where the event happened. No map tiles, and the same pure
 * projection helpers the live fallback plan uses (@/map/site-map), so the two never drift apart.
 */
export function EvidenceSitePlan({ card }: { card: MapSnapshotCard }) {
  const t = useTranslations("replay.evidence");
  const trail = card.trail.map((p) => ({ lat: p.lat, lon: p.lon }));
  const track = card.machine_track.map((p) => ({ lat: p.lat, lon: p.lon }));

  return (
    <div className="site-plan">
      <SitePlanFrame center={card.center} points={snapshotPoints(card)} zones={card.zones} label={t("map.label")}>
        {({ toXY, path, u }) => (
          <>
            {trail.length > 1 ? <path d={path(trail)} className="plan-trail" /> : null}
            {track.length > 1 ? <path d={path(track)} className="plan-track" /> : null}
            {track.map((p, i) => {
              const xy = toXY(p);
              return <rect key={i} x={xy.x - u / 2} y={xy.y - u / 2} width={u} height={u} className="plan-machine" />;
            })}
            <PlanFlag at={toXY(flagPoint(card))} u={u} />
          </>
        )}
      </SitePlanFrame>
      <ul className="plan-key t-meta text-ink-2">
        {trail.length > 1 ? (
          <li>
            <span className="plan-key-mark" data-mark="trail" aria-hidden="true" />
            {t("map.trail")}
          </li>
        ) : null}
        {track.length > 1 ? (
          <li>
            <span className="plan-key-mark" data-mark="track" aria-hidden="true" />
            {t("map.track")}
          </li>
        ) : null}
        <li>
          <span className="plan-key-mark" data-mark="flag" aria-hidden="true" />
          {t("map.flag")}
        </li>
      </ul>
    </div>
  );
}
