"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnomalyExplain } from "@/components/map/anomaly-explain";
import { MapView } from "@/components/map/map-view";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import { useAppState, useDataPort } from "@/data/store";
import type { SiteMapData } from "@/map/site-map";

/**
 * S4 /fm/map: every machine on the site. Selecting a machine that carries an active anomaly opens
 * the full AnomalyExplain as a side sheet (screens.md S4 "FM variant"; spec M4/M5 anomaly detail).
 * Selection works from the map and from the machine list, so it is reachable by keyboard and to a
 * screen reader — a canvas click is not an accessible path on its own.
 */
export function FmMapScreen() {
  const port = useDataPort();
  const t = useTranslations("map");
  const anomalies = useAppState((s) => s.anomalies);
  const guardian = useAppState((s) => s.guardian);
  const guardianByAlert = useAppState((s) => s.guardianByAlert);
  const alerts = useAppState((s) => s.alerts);
  const machine = useAppState((s) => s.machine);
  const connectivity = useAppState((s) => s.connectivity);
  const [data, setData] = useState<SiteMapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void port
      .siteMap()
      .then((d) => {
        if (!live) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [port, attempt]);

  // A failed load must say so and offer a retry, not spin on a loading plate forever.
  if (failed && !data) {
    return (
      <Plate as="section" className="flex flex-col items-start gap-4" aria-label={t("mapLabel")}>
        <p className="t-body">{t("loadFailed")}</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>{t("retry")}</Button>
      </Plate>
    );
  }
  if (!data) return <Plate loading className="map-slot" />;

  const anomalyPins = Object.values(anomalies).map((a) => ({ id: a.anomaly_id, lat: a.lat, lon: a.lon }));
  // Only a Guardian hazard names a machine code, so it is the join from a machine to its anomaly
  // (AnomalyDetected carries no machine reference). Prefer a hazard whose alert is still live, so
  // a cleared hazard can never drive the sheet.
  const liveAnomalyIds = new Set(
    alerts
      .filter((a) => a.status === "open" || a.status === "acknowledged" || a.status === "escalated")
      .map((a) => guardianByAlert[a.alert_id])
      .filter((id): id is string => Boolean(id)),
  );
  const hazardFor = (code: string) => {
    const candidates = Object.values(guardian).filter((h) => h.machine_code === code);
    return candidates.find((h) => liveAnomalyIds.has(h.anomaly_id)) ?? candidates[0];
  };
  const selectedMachine = data.machines.find((m) => m.id === selected);
  const selectedHazard = selectedMachine ? hazardFor(selectedMachine.code) : undefined;
  const selectedAnomaly = selectedHazard ? anomalies[selectedHazard.anomaly_id] : undefined;

  return (
    <div className="map-screen">
      <MapView
        data={data}
        me={machine?.location ?? null}
        anomalies={anomalyPins}
        onSelectMachine={setSelected}
        offline={connectivity.kind === "nosignal"}
      />

      <section aria-label={t("machineList")} className="flex flex-col gap-2">
        <h2 className="t-title">{t("machineList")}</h2>
        <ul className="list-none p-0 m-0 flex flex-wrap gap-4">
          {data.machines.map((m) => {
            const anomaly = (() => {
              const h = hazardFor(m.code);
              return h ? anomalies[h.anomaly_id] : undefined;
            })();
            return (
              <li key={m.id}>
                <Button onClick={() => setSelected(m.id)}>
                  {m.code}
                  {anomaly ? (
                    <Chip tone={anomaly.severity_tier === "critical" ? "critical" : anomaly.severity_tier === "warning" ? "warning" : "caution"} word>
                      {t(`tier.${anomaly.severity_tier}`)}
                    </Chip>
                  ) : null}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selectedMachine ? selectedMachine.code : t("anomalyDetail")}>
        {selectedAnomaly ? <AnomalyExplain anomaly={selectedAnomaly} variant="full" /> : <p className="t-body text-ink-2">{t("noAnomaly")}</p>}
      </Sheet>
    </div>
  );
}
