"use client";

// maplibre-gl.css is imported in app/globals.css inside the `vendor` cascade layer, not here:
// an unlayered vendor stylesheet would outrank every layered Spotter rule.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "next-intl";
import { Crosshair, Maximize, Minus, Plus } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapOverlay, type Project } from "@/components/map/map-overlay";
import { FrameStamp } from "@/components/map/provenance-stamp";
import { SitePlan } from "@/components/map/site-plan";
import type { MapState } from "@/map/map-state";
import { boundsOf, fitProjector, type LatLon, type SiteMapData } from "@/map/site-map";

type Props = {
  data: SiteMapData;
  state: MapState;
  /** Every point the site view should fit: zones, trails, machines, my rings. Stable between cursor moves. */
  fitPoints: LatLon[];
  /** Where the camera starts: me, my rings and what is near them. Defaults to every point. */
  focusPoints?: LatLon[];
  selectedId: string | null;
  onSelectMachine?: (machineId: string) => void;
  /** Offline: the basemap is not attempted at all; the plan carries the last known positions. */
  offline?: boolean;
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
/** Served unhashed from public/ by scripts/copy-maplibre-worker.mjs; see that file for why. */
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
/** Room for marker labels, which hang below their markers. */
const FIT_PADDING = { top: 72, right: 72, bottom: 112, left: 72 };

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
 * S4 map: the OpenFreeMap positron basemap when it is up, the paper plan otherwise, and ONE overlay
 * (zones, my 15 m / 50 m Guardian rings, trails, machines) on either. The overlay is HTML and SVG
 * positioned by a projector, so it is identical on the basemap and the plan, keyboard-reachable, and
 * redrawn from the time cursor's state without touching MapLibre's layers.
 *
 * The paper plan is the ground floor, not an error state: it renders immediately and the basemap
 * simply replaces it once the style is up, so an operator on a dead network never waits on a timer.
 */
export function MapView({ data, state, fitPoints, focusPoints, selectedId, onSelectMachine, offline = false }: Props) {
  const t = useTranslations("map");
  const wrap = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fitRef = useRef(fitPoints);
  const focusRef = useRef(focusPoints ?? fitPoints);
  const webgl = useWebgl();
  const [mapState, setMapState] = useState<"loading" | "live" | "failed">("loading");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [liveProject, setLiveProject] = useState<Project | null>(null);

  useEffect(() => {
    fitRef.current = fitPoints;
    focusRef.current = focusPoints ?? fitPoints;
  });

  // Offline and no-WebGL are known during render, so they are derived, never set from an effect.
  const blocked: "offline" | "no_webgl" | null = offline ? "offline" : webgl ? null : "no_webgl";
  const status = blocked ? "failed" : mapState;
  const reason: "loading" | "no_webgl" | "tiles_blocked" | "offline" =
    blocked ?? (mapState === "failed" ? "tiles_blocked" : "loading");

  // The frame's size drives both projectors. The map is told too, or it would keep its first size.
  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const measure = () => {
      setSize({ w: node.clientWidth, h: node.clientHeight });
      mapRef.current?.resize();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

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
        const box = boundsOf(focusRef.current);
        const map = new maplibre.Map({
          container: node,
          style: STYLE_URL,
          ...(box
            ? { bounds: [[box.west, box.south], [box.east, box.north]] as [[number, number], [number, number]], fitBoundsOptions: { padding: FIT_PADDING, maxZoom: 18 } }
            : { center: [79.0882, 21.1463] as [number, number], zoom: 16.5 }),
          attributionControl: { compact: true },
          // North stays up: the overlay's heading arrows and the paper plan are screen-relative.
          maxPitch: 0,
          pitchWithRotate: false,
          dragRotate: false,
        });
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;
        // The overlay is positioned by map.project, so it is redrawn synchronously on every camera
        // frame (flushSync): in the same frame as the tiles, never one frame behind them.
        const reproject = () => {
          if (cancelled) return;
          flushSync(() =>
            setLiveProject(() => (p: LatLon) => {
              const q = map.project([p.lon, p.lat]);
              return { x: q.x, y: q.y };
            }),
          );
        };
        map.on("move", reproject);
        map.on("resize", reproject);
        map.on("render", () => undefined);
        map.on("error", (e) => {
          // Third-party basemap: a missing tile or glyph is routine and recoverable, so only a
          // failure before the style is up means "no basemap". The plan is already on screen.
          if (process.env.NODE_ENV !== "production") console.warn("[map]", e?.error?.message ?? e);
          if (!cancelled && map.isStyleLoaded() !== true) setMapState("failed");
        });
        map.on("load", () => {
          if (cancelled) return;
          reproject();
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
      setLiveProject(null);
    };
    // Created once per blocked/unblocked: the overlay follows the store through props, not by rebuilding the map.
  }, [blocked]);

  const planProject = useMemo(() => fitProjector(focusPoints ?? fitPoints, size, FIT_PADDING), [focusPoints, fitPoints, size]);
  const project: Project = status === "live" && liveProject ? liveProject : planProject;

  const fitAll = useCallback(() => {
    const box = boundsOf(fitRef.current);
    if (box)
      mapRef.current?.fitBounds(
        [[box.west, box.south], [box.east, box.north]],
        { padding: FIT_PADDING, maxZoom: 18 },
      );
  }, []);

  const zoomBy = (delta: number) => mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 16) + delta });

  return (
    <div className="map-wrap" data-status={status} data-mode={state.atLive ? "live" : "replay"}>
      {/*
        The container is never unmounted: the Map instance holds this exact node, so taking it away
        on a failure would leave a live map drawing into a detached element. The paper backdrop simply
        covers it until the basemap is up. For assistive tech the canvas is an image; the machine
        buttons over it and the list beside it are the keyboard and screen-reader path to the same facts.
      */}
      <div ref={wrap} className="map-frame">
        <div ref={container} className="map-canvas" role="img" aria-label={t("mapLabel")} />
        {status === "live" ? <div className="map-wash" aria-hidden="true" /> : <SitePlan reason={reason} />}
        <MapOverlay data={data} state={state} project={project} size={size} selectedId={selectedId} onSelect={onSelectMachine} />
        <FrameStamp state={state} />
      </div>
      {status === "live" ? (
        <div className="map-toolbar" role="group" aria-label={t("controls")}>
          <button type="button" className="map-ctl" onClick={fitAll}>
            <Maximize aria-hidden="true" />
            <span>{t("fitSite")}</span>
          </button>
          {state.me ? (
            <button
              type="button"
              className="map-ctl"
              onClick={() => {
                if (state.me) mapRef.current?.flyTo({ center: [state.me.lon, state.me.lat], zoom: 17 });
              }}
            >
              <Crosshair aria-hidden="true" />
              <span>{t("centreOnMe")}</span>
            </button>
          ) : null}
          <button type="button" className="map-ctl" onClick={() => zoomBy(1)} aria-label={t("zoomIn")}>
            <Plus aria-hidden="true" />
            <span aria-hidden="true">{t("zoomInShort")}</span>
          </button>
          <button type="button" className="map-ctl" onClick={() => zoomBy(-1)} aria-label={t("zoomOut")}>
            <Minus aria-hidden="true" />
            <span aria-hidden="true">{t("zoomOutShort")}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
