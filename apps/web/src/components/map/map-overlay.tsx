"use client";

import { useTranslations } from "next-intl";
import { ProvenanceStamp, machineSummary } from "@/components/map/provenance-stamp";
import type { MachineAt, MapState } from "@/map/map-state";
import { ringPolygon, type LatLon, type Px, type SiteMapData } from "@/map/site-map";

export type Project = (p: LatLon) => Px;

type Props = {
  data: SiteMapData;
  state: MapState;
  project: Project;
  size: { w: number; h: number };
  ownCode: string | null;
  selectedId: string | null;
  onSelect?: (id: string) => void;
};

const path = (pts: readonly LatLon[], project: Project, close = false) =>
  pts
    .map((p, i) => {
      const q = project(p);
      return `${i === 0 ? "M" : "L"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    })
    .join(" ") + (close ? " Z" : "");

/** The safety tone a marker may wear: only a live, fresh hazard (state.danger), by what is wrong with it. */
function toneOf(m: MachineAt): "critical" | "warning" | "caution" | null {
  if (!m.danger) return null;
  if (m.health === "fault" || (m.distanceM !== null && m.distanceM <= 15)) return "critical";
  if (m.health === "caution") return "caution";
  return "warning";
}

/**
 * Everything the map draws on top of the basemap or the paper plan, from one MapState and one
 * projector: zones, the Guardian rings with their metres, trails that are drawn up to the cursor,
 * anomaly pins, and the machines as real buttons (the keyboard and screen-reader path to them).
 * The same overlay sits on MapLibre and on the plan, so the two cannot disagree.
 */
export function MapOverlay({ data, state, project, size, ownCode, selectedId, onSelect }: Props) {
  const t = useTranslations("map");
  if (size.w === 0 || size.h === 0) return null;

  const ringTop = (radius: number) => {
    const c = state.rings!.center;
    return project({ lat: c.lat + radius / 111_320, lon: c.lon });
  };

  return (
    <>
      <svg className="map-overlay" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true" focusable="false">
        {data.zones.map((z) => (
          <path key={z.id} d={path(z.polygon, project, true)} className="map-zone" />
        ))}
        {state.rings ? (
          <g className="map-rings" data-live={state.rings.live || undefined}>
            <path d={path(ringPolygon(state.rings.center, state.rings.warning_m), project, true)} className="map-ring" data-ring="warning" />
            <path d={path(ringPolygon(state.rings.center, state.rings.danger_m), project, true)} className="map-ring" data-ring="danger" />
            <text x={ringTop(state.rings.warning_m).x} y={ringTop(state.rings.warning_m).y - 6} className="map-ring-label" textAnchor="middle">
              {state.rings.warning_m} m
            </text>
            <text x={ringTop(state.rings.danger_m).x} y={ringTop(state.rings.danger_m).y - 6} className="map-ring-label" textAnchor="middle">
              {state.rings.danger_m} m
            </text>
          </g>
        ) : null}
        {state.machines.map((m) =>
          m.trail.length > 1 ? (
            <path key={m.id} d={path(m.trail, project)} className="map-trail" pathLength={1} data-tier={m.tier} data-stale={m.stale || undefined} />
          ) : null,
        )}
        {state.pins.map((p) => {
          const q = project(p);
          return <circle key={p.id} cx={q.x} cy={q.y} r={16} className="map-pin" data-live={p.live || undefined} />;
        })}
      </svg>

      <div className="map-markers">
        {state.machines.map((m) => {
          const q = project(m);
          const tone = toneOf(m);
          const selected = selectedId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className="map-marker"
              style={{ left: q.x, top: q.y }}
              data-tier={m.tier}
              data-tone={tone ?? undefined}
              data-stale={m.stale || undefined}
              data-prov={m.provenance}
              data-selected={selected || undefined}
              aria-pressed={onSelect ? selected : undefined}
              aria-label={machineSummary(t, m, ownCode)}
              onClick={() => onSelect?.(m.id)}
              disabled={!onSelect}
            >
              <svg className="map-glyph" viewBox="-20 -20 40 40" aria-hidden="true" focusable="false" style={{ transform: `rotate(${m.heading_deg ?? 0}deg)` }}>
                {m.heading_deg !== null ? (
                  <path d="M0 -17 L13 14 L0 7 L-13 14 Z" className="map-glyph-body" />
                ) : (
                  <rect x="-12" y="-12" width="24" height="24" className="map-glyph-body" />
                )}
              </svg>
              <span className="map-marker-label" aria-hidden="true">
                <span className="map-marker-code">{m.tier === "own" ? t("you", { code: m.code === "—" ? (ownCode ?? m.code) : m.code }) : m.code}</span>
                <span className="map-marker-meta">
                  {m.health !== "ok" ? <b className="map-marker-health">{t(`health.${m.health}`)}</b> : null}
                  {m.distanceM !== null ? <span className="tnum">{t("away", { m: Math.round(m.distanceM) })}</span> : null}
                </span>
                <ProvenanceStamp kind={m.provenance} ageMs={m.ageMs} stale={m.stale} />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
