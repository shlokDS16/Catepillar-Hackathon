"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { takeoverQueue } from "@/alerts/selectors";
import { GuardianCard } from "@/components/map/guardian-card";
import { MapView } from "@/components/map/map-view";
import { Plate } from "@/components/ui/plate";
import { ProvenanceLine } from "@/components/ui/provenance";
import { newRequestId } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import type { ProtocolCard } from "@/data/types";
import type { SiteMapData } from "@/map/site-map";

/**
 * S4 /op/map: the map with me, my rings and trail, and — while a Guardian hazard is open — its
 * protocol card as a bottom sheet with "why this machine". Offline shows the paper plan with
 * "as of" and hides the Guardian card (screens.md S4 "Offline").
 */
export function OpMapScreen() {
  const port = useDataPort();
  const t = useTranslations("map");
  const format = useFormatter();
  const machine = useAppState((s) => s.machine);
  const operator = useAppState((s) => s.operator);
  const alerts = useAppState((s) => s.alerts);
  const guardian = useAppState((s) => s.guardian);
  const guardianByAlert = useAppState((s) => s.guardianByAlert);
  const anomalies = useAppState((s) => s.anomalies);
  const connectivity = useAppState((s) => s.connectivity);

  const [data, setData] = useState<SiteMapData | null>(null);
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

  const top = takeoverQueue(alerts).find((a) => a.kind === "guardian_hazard");
  const hazard = top ? guardian[guardianByAlert[top.alert_id] ?? ""] : undefined;
  const anomaly = hazard ? anomalies[hazard.anomaly_id] : undefined;
  const offline = connectivity.kind === "nosignal";

  const [card, setCard] = useState<{ id: string; card: ProtocolCard } | null>(null);
  const cardId = top?.protocol_card_id ?? null;
  useEffect(() => {
    if (!cardId) return;
    let live = true;
    void port
      .protocolCard(cardId)
      .then((c) => {
        if (live) setCard(c ? { id: cardId, card: c } : null);
      })
      .catch(() => {
        if (live) setCard(null);
      });
    return () => {
      live = false;
    };
  }, [cardId, port]);

  const [ack, setAck] = useState<{ id: string; requestId: string; status: "idle" | "loading" | "error" }>({ id: "", requestId: "", status: "idle" });
  const acknowledge = async () => {
    if (!top) return;
    const requestId = ack.id === top.alert_id ? ack.requestId : newRequestId();
    setAck({ id: top.alert_id, requestId, status: "loading" });
    try {
      await port.alertAck({ p_alert_id: top.alert_id, p_request_id: requestId });
      setAck({ id: top.alert_id, requestId, status: "idle" });
    } catch {
      setAck({ id: top.alert_id, requestId, status: "error" });
    }
  };

  if (!data) return <Plate loading className="map-slot" />;

  const me = operator?.location ?? machine?.location ?? null;
  const anomalyPins = Object.values(anomalies).map((a) => ({ id: a.anomaly_id, lat: a.lat, lon: a.lon }));

  return (
    <div className="map-screen">
      <MapView data={data} me={me} anomalies={anomalyPins} offline={offline} />
      {offline && operator?.ts ? (
        <p className="t-meta text-ink-3">{t("asOf", { time: format.dateTime(new Date(operator.ts), "time") })}</p>
      ) : null}
      {hazard && !offline ? (
        <GuardianCard
          hazard={hazard}
          card={card && card.id === cardId ? card.card : null}
          anomaly={anomaly}
          alert={top}
          onAcknowledge={() => void acknowledge()}
          ackStatus={ack.id === top?.alert_id ? ack.status : "idle"}
        />
      ) : null}
      <ProvenanceLine fields={[["operator_state", "location"], ["machine_state", "location"]]} />
    </div>
  );
}
