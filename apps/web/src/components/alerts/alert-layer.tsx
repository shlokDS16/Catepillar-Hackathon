"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { cautionBanner, takeoverQueue } from "@/alerts/selectors";
import { AlertBanner } from "@/components/alerts/alert-banner";
import { AlertTakeover } from "@/components/alerts/alert-takeover";
import { MotionLock } from "@/components/hero/motion-lock";
import { newRequestId } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import type { ProtocolCard } from "@/data/types";
import { useMotionLock } from "@/hero/use-motion-lock";
import { useSafetyState } from "@/alerts/use-safety-state";

/**
 * Mounts what the alert state says (interaction-map §5, §6): the motion-lock view, the Caution
 * banner, and the highest Warning/Critical takeover. Acknowledge goes through the port with one
 * request_id per intent and no optimistic update.
 */
export function AlertLayer() {
  const port = useDataPort();
  const router = useRouter();
  const lang = useLocale();
  const alerts = useAppState((s) => s.alerts);
  const machine = useAppState((s) => s.machine);
  const tasks = useAppState((s) => s.tasks);
  const guardian = useAppState((s) => s.guardian);
  const anomalies = useAppState((s) => s.anomalies);
  const dispatch = useAppState((s) => s.dispatch);
  const serverLocked = useAppState((s) => s.operator?.motion_locked ?? false);
  const locked = useMotionLock(serverLocked);
  const { safety, topAlert } = useSafetyState();

  const queue = takeoverQueue(alerts);
  const top = queue[0];
  const banner = cautionBanner(alerts);

  const [card, setCard] = useState<ProtocolCard | null>(null);
  const cardId = top?.protocol_card_id ?? null;
  useEffect(() => {
    let live = true;
    if (!cardId) {
      const id = window.setTimeout(() => setCard(null), 0);
      return () => window.clearTimeout(id);
    }
    void port.protocolCard(cardId).then((c) => {
      if (live) setCard(c);
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

  const hazard = top?.kind === "guardian_hazard" ? Object.values(guardian)[0] : undefined;
  const anomaly = hazard ? anomalies[hazard.anomaly_id] : undefined;
  const explanation = anomaly ? (lang === "hi" ? anomaly.explanation.hi : anomaly.explanation.en) : undefined;
  const dispatchLine = top && top.tier === "critical" ? dispatch[top.alert_id]?.at(-1) : undefined;

  return (
    <>
      {locked ? <MotionLock machine={machine} tasks={tasks} safety={safety} topAlert={topAlert} /> : null}
      {banner ? <AlertBanner alert={banner} /> : null}
      {top ? (
        <AlertTakeover
          alert={top}
          more={queue.length - 1}
          card={card ?? undefined}
          motionLocked={locked}
          onAcknowledge={() => void acknowledge()}
          ackStatus={ack.id === top.alert_id ? ack.status : "idle"}
          onShowOnMap={() => router.push("/op/map")}
          explanation={explanation}
          dispatchLine={dispatchLine}
        />
      ) : null}
    </>
  );
}
