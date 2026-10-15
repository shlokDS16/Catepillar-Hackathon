"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnomalyExplain } from "@/components/map/anomaly-explain";
import { MapView } from "@/components/map/map-view";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import { useAppState, useDataPort } from "@/data/store";
import type { SiteMapData } from "@/map/site-map";

/**
 * S4 /fm/map: every machine on the site. Tapping a machine that carries an active anomaly opens
 * the full AnomalyExplain as a side sheet (screens.md S4 "FM variant"; spec M4/M5 anomaly detail).
 */
export function FmMapScreen() {
  const port = useDataPort();
  const t = useTranslations("map");
  const anomalies = useAppState((s) => s.anomalies);
  const guardian = useAppState((s) => s.guardian);
  const machine = useAppState((s) => s.machine);
  const [data, setData] = useState<SiteMapData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void port
      .siteMap()
      .then((d) => {
        if (live) setData(d);
      })
      .catch(() => {
        if (live) setData(null);
      });
    return () => {
      live = false;
    };
  }, [port]);

  if (!data) return <Plate loading className="map-slot" />;

  const anomalyPins = Object.values(anomalies).map((a) => ({ id: a.anomaly_id, lat: a.lat, lon: a.lon }));
  // The map marks machines by id. Only the Guardian hazard names a machine code, so it is the join
  // from the tapped machine to its anomaly (AnomalyDetected itself carries no machine reference).
  const selectedMachine = data.machines.find((m) => m.id === selected);
  const hazard = selectedMachine ? Object.values(guardian).find((h) => h.machine_code === selectedMachine.code) : undefined;
  const selectedAnomaly = hazard ? anomalies[hazard.anomaly_id] : undefined;

  return (
    <div className="map-screen">
      <MapView data={data} me={machine?.location ?? null} anomalies={anomalyPins} onSelectMachine={setSelected} />
      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selectedMachine ? selectedMachine.code : t("anomalyDetail")}>
        {selectedAnomaly ? (
          <AnomalyExplain anomaly={selectedAnomaly} variant="full" />
        ) : (
          <p className="t-body text-ink-2">{t("noAnomaly")}</p>
        )}
      </Sheet>
    </div>
  );
}
