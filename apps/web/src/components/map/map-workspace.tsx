"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MachineList } from "@/components/map/machine-list";
import { MapLegend } from "@/components/map/map-legend";
import { MapTimeline } from "@/components/map/map-timeline";
import { MapView } from "@/components/map/map-view";
import { useAppState } from "@/data/store";
import { provenanceOf } from "@/data/provenance";
import { hazardForMachine, hazardTier } from "@/map/hazards";
import { buildMapModel, eventsFromAlerts, mapStateAt, WINDOW_MS } from "@/map/map-state";
import { distanceM, ringPolygon, RING_M, type LatLon, type SiteMapData } from "@/map/site-map";
import { useMapCursor, useNowMs } from "@/map/use-map-cursor";
import { useReducedMotion } from "@/replay/use-reenactment";

type Props = {
  variant: "op" | "fm";
  data: SiteMapData;
  /** Where I am (operator, else paired machine). Null for a fleet manager: no "me" on site. */
  me: LatLon | null;
  ownCode: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Shown after the map stage: the operator's Guardian card, the FM's detail sheet. */
  children?: ReactNode;
};

/**
 * S4 /op/map and /fm/map share this: ONE time cursor drives the markers, trails, rings, scrubber,
 * list and provenance stamps, all read from `mapStateAt(model, t)`. The live edge is pinned by
 * default; nothing animates unless the user presses Replay. The operator gets the map above the
 * fold with the machine list under it; the FM gets map and list side by side from 1024 px.
 */
export function MapWorkspace({ variant, data, me, ownCode, selectedId, onSelect, children }: Props) {
  const t = useTranslations("map");
  const reduced = useReducedMotion();
  const alerts = useAppState((s) => s.alerts);
  const guardian = useAppState((s) => s.guardian);
  const guardianByAlert = useAppState((s) => s.guardianByAlert);
  const anomalies = useAppState((s) => s.anomalies);
  const lastFrameMs = useAppState((s) => s.lastFrameMs);
  const connectivity = useAppState((s) => s.connectivity);

  const nowMs = useNowMs();
  const [mountedMs] = useState(() => Date.now());
  // Fix times hang off the moment the data was fetched, so a paused cursor never drifts; only the
  // newest report of each machine follows the latest frame, so a stopped feed (no signal) ages it.
  // Alerts already carry wall-clock times (recorded_at), so events need no clock mapping.
  const anchorMs = mountedMs;
  const freshMs = Math.min(lastFrameMs ?? mountedMs, nowMs);

  const assumed = (() => {
    const kind = provenanceOf("machine_state", "location").kind;
    return kind === "assumed" || kind === "simulated";
  })();

  const model = useMemo(() => {
    const startMs = nowMs - WINDOW_MS;
    const hazardCodes = Object.values(guardian).map((h) => h.machine_code);
    return buildMapModel({
      data,
      me,
      ownCode,
      anchorMs,
      freshMs,
      endMs: nowMs,
      assumed,
      events: eventsFromAlerts(alerts, guardian, guardianByAlert, startMs, nowMs),
      pins: Object.values(anomalies).map((a) => ({ id: a.anomaly_id, lat: a.lat, lon: a.lon })),
      hazardCodes,
    });
  }, [data, me, ownCode, anchorMs, freshMs, nowMs, assumed, alerts, guardian, guardianByAlert, anomalies]);

  const cursor = useMapCursor(model);
  const state = useMemo(() => mapStateAt(model, cursor.t), [model, cursor.t]);

  // Every point the site view fits. Kept to the data and me, so a cursor move never refits the camera.
  const fitPoints = useMemo<LatLon[]>(
    () => [
      ...data.zones.flatMap((z) => z.polygon),
      ...data.trail,
      ...data.machines.flatMap((m) => [{ lat: m.lat, lon: m.lon }, ...(m.track ?? [])]),
      ...(me ? [me, ...ringPolygon(me, RING_M.warning, 8)] : []),
    ],
    [data, me],
  );

  // The operator's camera starts on me, my 50 m ring and what is inside 150 m; "Fit site" shows the rest.
  const focusPoints = useMemo<LatLon[]>(() => {
    if (!me) return fitPoints;
    const near = data.machines.filter((m) => distanceM(me, m) <= 150).map((m) => ({ lat: m.lat, lon: m.lon }));
    return [me, ...ringPolygon(me, RING_M.warning, 8), ...near];
  }, [data, me, fitPoints]);

  const tierWord = useMemo(() => {
    const out: Record<string, "caution" | "warning" | "critical"> = {};
    for (const m of state.machines) {
      if (m.tier === "own") continue;
      const tier = hazardTier(hazardForMachine(m.code, guardian, alerts, guardianByAlert), anomalies);
      if (tier) out[m.id] = tier;
    }
    return out;
  }, [state.machines, guardian, alerts, guardianByAlert, anomalies]);

  return (
    <div className="map-screen" data-variant={variant}>
      <div className="map-stage">
        <MapView data={data} state={state} fitPoints={fitPoints} focusPoints={focusPoints} selectedId={selectedId} onSelectMachine={onSelect} offline={connectivity.kind === "nosignal"} />
        <MapTimeline
          model={model}
          t={cursor.t}
          atLive={state.atLive}
          playing={cursor.playing}
          reduced={reduced}
          onScrub={cursor.scrub}
          onLive={cursor.goLive}
          onPlay={cursor.play}
          onPause={cursor.pause}
        />
        <MapLegend rings={state.rings !== null} live={state.atLive} />
      </div>

      <div className="map-side">
        {children}
        <section aria-label={t(variant === "fm" ? "machineList" : "nearby")} className="map-side-list">
          <h2 className="t-title">{t(variant === "fm" ? "machineList" : "nearby")}</h2>
          {state.machines.length === 0 ? (
            <p className="t-body text-ink-2">{t("noMachines")}</p>
          ) : (
            <MachineList machines={state.machines} selectedId={selectedId} onSelect={onSelect} tierWord={tierWord} />
          )}
        </section>
      </div>
    </div>
  );
}
