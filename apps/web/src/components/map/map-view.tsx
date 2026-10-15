"use client";

// maplibre-gl.css is imported in app/globals.css inside the `vendor` cascade layer, not here:
// an unlayered vendor stylesheet would outrank every layered Spotter rule.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { SitePlan } from "@/components/map/site-plan";
import { ringPolygon, RING_M, type LatLon, type SiteMapData } from "@/map/site-map";

type Props = {
  data: SiteMapData;
  /** The operator (or the paired machine when the operator has no fix): centre, rings and trail end. */
  me: LatLon | null;
  /** Anomaly positions to mark, from anomaly.detected payloads. */
  anomalies?: Array<{ id: string; lat: number; lon: number }>;
  /** FM: tapping a machine opens its anomaly detail. */
  onSelectMachine?: (machineId: string) => void;
  /** Offline: the basemap is not attempted at all; the plan carries the last known positions. */
  offline?: boolean;
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
/** Served unhashed from public/ by scripts/copy-maplibre-worker.mjs; see that file for why. */
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/**
 * WebGL2 is MapLibre's requirement; on the server there is no canvas to ask. Probed once per page:
 * this function is a useSyncExternalStore snapshot, so probing per call would open a live WebGL
 * context on every render until the browser's context cap evicts the map's own one. The probe
 * context is released immediately.
 */
let webglProbe: boolean | null = null;
function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  if (webglProbe !== null) return webglProbe;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webglProbe = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}

/** A browser-only fact, read through useSyncExternalStore so the server render is not a mismatch. */
const noopSubscribe = () => () => {};
function useWebgl(): boolean {
  return useSyncExternalStore(noopSubscribe, webglAvailable, () => true);
}

/**
 * S4 map: my dot and the 15 m / 50 m Guardian rings (D11: the radar is folded into these rings),
 * my trail, the zones and the other machines by health, on the OpenFreeMap positron basemap.
 *
 * The paper site plan is not an error state but the ground floor: it draws the same geometry from
 * data we already hold, so it renders immediately and the basemap simply replaces it once the
 * style is up. An operator on a dead network therefore never waits on a timer or sees a blank
 * square, and no arbitrary timeout can mistake a slow network for a missing one.
 */
export function MapView({ data, me, anomalies = [], onSelectMachine, offline = false }: Props) {
  const t = useTranslations("map");
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const webgl = useWebgl();
  const [mapState, setMapState] = useState<"loading" | "live" | "failed">("loading");
  const center = me ?? data.center;

  // Offline and no-WebGL are known during render, so they are derived, never set from an effect.
  const blocked: "offline" | "no_webgl" | null = offline ? "offline" : webgl ? null : "no_webgl";
  const status = blocked ? "failed" : mapState;
  const reason: "loading" | "no_webgl" | "tiles_blocked" | "offline" =
    blocked ?? (mapState === "failed" ? "tiles_blocked" : "loading");

  useEffect(() => {
    if (blocked) return;
    const node = container.current;
    if (!node) return;

    let cancelled = false;
    void (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled) return;
        // Re-entry (offline → online, WebGL probe settling) starts a fresh attempt, so a "failed"
        // verdict from the previous map must not survive into this one.
        setMapState("loading");
        maplibre.setWorkerUrl(WORKER_URL);
        const map = new maplibre.Map({
          container: node,
          style: STYLE_URL,
          center: [center.lon, center.lat],
          zoom: 16.5,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on("error", (e) => {
          // Third-party basemap: a missing tile or glyph is routine and recoverable, so only a
          // failure before the style is up means "no basemap". The plan is already on screen.
          if (process.env.NODE_ENV !== "production") console.warn("[map]", e?.error?.message ?? e);
          if (!cancelled && map.isStyleLoaded() !== true) setMapState("failed");
        });
        map.on("load", () => {
          if (cancelled) return;
          drawLayers(map, data, me, anomalies, onSelectMachine);
          setMapState("live");
        });
      } catch {
        if (!cancelled) setMapState("failed");
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Created once: later data lands through updateSources below, not by rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  // Live updates: my position, rings and trail follow the store without recreating the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "live") return;
    updateSources(map, data, me, anomalies);
  }, [data, me, anomalies, status]);

  return (
    <div className="map-wrap" data-status={status}>
      {/*
        The container is never unmounted: the Map instance holds this exact node, so taking it away
        on a failure would leave a live map drawing into a detached element — and a style that
        recovered afterwards would flip us to "live" over an empty frame. The plan simply covers it
        (inset 0) until the basemap is up. For assistive tech the canvas is an image; the machine
        list below the map is the keyboard and screen-reader path to the same facts.
      */}
      <div ref={container} className="map-canvas" role="img" aria-label={t("mapLabel")} />
      {status !== "live" ? (
        <div className="map-plan">
          <SitePlan data={data} me={me} machines={data.machines} reason={reason} />
        </div>
      ) : null}
      {status === "live" ? (
        <div className="map-controls">
          <Button
            onClick={() => {
              if (me) mapRef.current?.flyTo({ center: [me.lon, me.lat], zoom: 17 });
            }}
          >
            {t("centreOnMe")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const line = (pts: LatLon[]) => ({ type: "Feature", geometry: { type: "LineString", coordinates: pts.map((p) => [p.lon, p.lat]) }, properties: {} });
/** GeoJSON rings must be closed; a zone polygon from the data may list its corners only once. */
const closed = (pts: LatLon[]) => {
  const first = pts[0];
  const last = pts[pts.length - 1];
  return first && last && (first.lat !== last.lat || first.lon !== last.lon) ? [...pts, first] : pts;
};
const polygon = (pts: LatLon[], properties: Record<string, unknown> = {}) => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [closed(pts).map((p) => [p.lon, p.lat])] },
  properties,
});
const points = (items: Array<{ id: string; lat: number; lon: number } & Record<string, unknown>>) => ({
  type: "FeatureCollection",
  features: items.map((i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [i.lon, i.lat] }, properties: { ...i } })),
});

function sources(data: SiteMapData, me: LatLon | null, anomalies: Array<{ id: string; lat: number; lon: number }>) {
  return {
    zones: { type: "FeatureCollection", features: data.zones.map((z) => polygon(z.polygon, { name: z.name })) },
    trail: line(data.trail),
    rings: {
      type: "FeatureCollection",
      features: me ? [polygon(ringPolygon(me, RING_M.warning), { ring: "warning" }), polygon(ringPolygon(me, RING_M.danger), { ring: "danger" })] : [],
    },
    me: points(me ? [{ id: "me", lat: me.lat, lon: me.lon }] : []),
    machines: points(data.machines),
    anomalies: points(anomalies),
  };
}

function updateSources(map: MapLibreMap, data: SiteMapData, me: LatLon | null, anomalies: Array<{ id: string; lat: number; lon: number }>) {
  const next = sources(data, me, anomalies);
  for (const [id, value] of Object.entries(next)) (map.getSource(id) as GeoJSONSource | undefined)?.setData(value as never);
}

/** Ink geometry first, then state colour: zones, trail, rings, machines, anomalies, me on top. */
function drawLayers(
  map: MapLibreMap,
  data: SiteMapData,
  me: LatLon | null,
  anomalies: Array<{ id: string; lat: number; lon: number }>,
  onSelectMachine?: (machineId: string) => void,
) {
  const src = sources(data, me, anomalies);
  for (const [id, value] of Object.entries(src)) map.addSource(id, { type: "geojson", data: value as never });

  map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": "#16150f", "fill-opacity": 0.06 } });
  map.addLayer({ id: "zones-line", type: "line", source: "zones", paint: { "line-color": "#16150f", "line-width": 1.5, "line-dasharray": [3, 2] } });
  map.addLayer({ id: "trail-line", type: "line", source: "trail", paint: { "line-color": "#4b483f", "line-width": 3, "line-opacity": 0.8 } });
  map.addLayer({
    id: "rings-line",
    type: "line",
    source: "rings",
    paint: { "line-color": ["match", ["get", "ring"], "danger", "#b3102a", "#ff6a00"], "line-width": 2, "line-dasharray": [2, 2] },
  });
  map.addLayer({
    id: "machines-dot",
    type: "circle",
    source: "machines",
    paint: {
      "circle-radius": 9,
      "circle-color": ["match", ["get", "health"], "fault", "#b3102a", "caution", "#ffc700", "#f2f0ea"],
      "circle-stroke-color": "#16150f",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "anomalies-dot",
    type: "circle",
    source: "anomalies",
    paint: { "circle-radius": 14, "circle-color": "#ff6a00", "circle-opacity": 0.25, "circle-stroke-color": "#ff6a00", "circle-stroke-width": 2 },
  });
  map.addLayer({
    id: "me-dot",
    type: "circle",
    source: "me",
    paint: { "circle-radius": 7, "circle-color": "#16150f", "circle-stroke-color": "#f2f0ea", "circle-stroke-width": 3 },
  });

  if (onSelectMachine) {
    map.on("click", "machines-dot", (e: MapMouseEvent & { features?: Array<{ properties?: { id?: string } }> }) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onSelectMachine(id);
    });
  }
}
