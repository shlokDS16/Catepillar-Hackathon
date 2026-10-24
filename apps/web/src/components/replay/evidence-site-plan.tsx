"use client";

import { useTranslations } from "next-intl";
import { flagPoint, planCentroid, snapshotPoints, type MapSnapshotCard } from "@/replay/evidence";
import { planBounds, planProject, type LatLon } from "@/map/site-map";

/**
 * The `map_snapshot` evidence card: the site plan as flat SVG in metres — zones, the operator's
 * trail, the machine track and the ⚑ where the event happened. No map tiles, and the same pure
 * projection helpers the live fallback plan uses (@/map/site-map), so the two never drift apart.
 *
 * This is the renderer the Debrief re-enactment animates in R4, which is why the geometry is
 * built from the card rather than from the live `SiteMapData`.
 */
export function EvidenceSitePlan({ card }: { card: MapSnapshotCard }) {
  const t = useTranslations("replay.evidence");
  const center = card.center;
  const box = planBounds(snapshotPoints(card), center);
  const toXY = (p: LatLon) => planProject(p, center);
  const path = (points: readonly LatLon[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${toXY(p).x.toFixed(1)} ${toXY(p).y.toFixed(1)}`).join(" ");

  // Marks are in metres like everything else, so they are sized from the plan's own extent:
  // a fixed 10 m square is a dot on a quarry and a billboard on one bench.
  const u = Math.min(box.w, box.h) / 14;
  const trail = card.trail.map((p) => ({ lat: p.lat, lon: p.lon }));
  const track = card.machine_track.map((p) => ({ lat: p.lat, lon: p.lon }));
  const flag = toXY(flagPoint(card));

  return (
    <div className="site-plan">
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={t("map.label")} className="site-plan-svg">
        {card.zones.map((z) => {
          const c = planCentroid(z.polygon, center);
          return (
            <g key={z.id}>
              <path d={`${path(z.polygon)} Z`} className="plan-zone" />
              {c ? (
                <text x={c.x} y={c.y} fontSize={u} className="plan-zone-name" textAnchor="middle">
                  {z.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {trail.length > 1 ? <path d={path(trail)} className="plan-trail" /> : null}
        {track.length > 1 ? <path d={path(track)} className="plan-track" /> : null}
        {track.map((p, i) => {
          const xy = toXY(p);
          return (
            <rect key={i} x={xy.x - u / 2} y={xy.y - u / 2} width={u} height={u} className="plan-machine" />
          );
        })}
        {/* The flag is drawn, not typed: a ⚑ glyph is not guaranteed in our display font. */}
        <g className="plan-flag" transform={`translate(${flag.x.toFixed(1)} ${flag.y.toFixed(1)})`}>
          <line x1="0" y1="0" x2="0" y2={-3 * u} className="plan-flag-pole" />
          <path d={`M0 ${-3 * u} L${1.8 * u} ${-2.4 * u} L0 ${-1.8 * u} Z`} className="plan-flag-cloth" />
        </g>
      </svg>
      <ul className="plan-key t-meta text-ink-2">
        <li>
          <span className="plan-key-mark" data-mark="trail" aria-hidden="true" />
          {t("map.trail")}
        </li>
        <li>
          <span className="plan-key-mark" data-mark="track" aria-hidden="true" />
          {t("map.track")}
        </li>
        <li>
          <span className="plan-key-mark" data-mark="flag" aria-hidden="true" />
          {t("map.flag")}
        </li>
      </ul>
    </div>
  );
}
