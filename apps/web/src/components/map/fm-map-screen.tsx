"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnomalyExplain } from "@/components/map/anomaly-explain";
import { MapWorkspace } from "@/components/map/map-workspace";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import { useAppState, useDataPort } from "@/data/store";
import { hazardForMachine } from "@/map/hazards";
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

  // The join from a machine to its anomaly is a Guardian hazard (see hazardForMachine).
  const selectedMachine = data.machines.find((m) => m.id === selected);
  const selectedHazard = selectedMachine ? hazardForMachine(selectedMachine.code, guardian, alerts, guardianByAlert) : undefined;
  const selectedAnomaly = selectedHazard ? anomalies[selectedHazard.anomaly_id] : undefined;

  return (
    <MapWorkspace variant="fm" data={data} me={null} ownCode={null} selectedId={selected} onSelect={setSelected}>
      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selectedMachine ? selectedMachine.code : t("anomalyDetail")}>
        {selectedAnomaly ? <AnomalyExplain anomaly={selectedAnomaly} variant="full" /> : <p className="t-body text-ink-2">{t("noAnomaly")}</p>}
      </Sheet>
    </MapWorkspace>
  );
}
