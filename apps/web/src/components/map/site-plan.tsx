"use client";

import { useTranslations } from "next-intl";
import { planBounds, planProject, ringPolygon, RING_M, type LatLon, type SiteMapData } from "@/map/site-map";

type Props = {
  data: SiteMapData;
  me: LatLon | null;
  machines: SiteMapData["machines"];
  /** Why the plan is on screen: while the basemap loads, or because it cannot be shown at all. */
  reason: "loading" | "no_webgl" | "tiles_blocked" | "offline";
};

/**
 * The paper site plan (screens.md S4 "Fallback: the paper site plan"): the same geometry as the
 * map, drawn as flat SVG in metres, for no WebGL, blocked tiles or no network. Ink on paper with
 * the safety colours reserved for live state, exactly like the rest of Site Signage.
 */
export function SitePlan({ data, me, machines, reason }: Props) {
  const t = useTranslations("map");
  const center = me ?? data.center;
  const all: LatLon[] = [
    ...data.zones.flatMap((z) => z.polygon),
    ...data.trail,
    ...machines.map((m) => ({ lat: m.lat, lon: m.lon })),
    ...(me ? ringPolygon(me, RING_M.warning, 16) : []),
  ];
  const box = planBounds(all.length > 0 ? all : [center], center);
  const toXY = (p: LatLon) => planProject(p, center);
  const path = (points: LatLon[]) => points.map((p, i) => `${i === 0 ? "M" : "L"}${toXY(p).x.toFixed(1)} ${toXY(p).y.toFixed(1)}`).join(" ");

  return (
    <div className="site-plan" data-reason={reason}>
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={t("planLabel")} className="site-plan-svg">
        {data.zones.map((z) => (
          <path key={z.id} d={`${path(z.polygon)} Z`} className="plan-zone" />
        ))}
        {data.trail.length > 1 ? <path d={path(data.trail)} className="plan-trail" /> : null}
        {me ? (
          <>
            <path d={`${path(ringPolygon(me, RING_M.warning))} Z`} className="plan-ring" data-ring="warning" />
            <path d={`${path(ringPolygon(me, RING_M.danger))} Z`} className="plan-ring" data-ring="danger" />
            <circle cx={toXY(me).x} cy={toXY(me).y} r={4} className="plan-me" />
          </>
        ) : null}
        {machines.map((m) => {
          const p = toXY({ lat: m.lat, lon: m.lon });
          return <rect key={m.id} x={p.x - 5} y={p.y - 5} width={10} height={10} className="plan-machine" data-health={m.health} />;
        })}
      </svg>
      <p className="t-meta text-ink-3 site-plan-note">{t(`fallback.${reason}`)}</p>
    </div>
  );
}
