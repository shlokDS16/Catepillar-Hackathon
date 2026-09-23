"use client";

import { useState } from "react";
import { unlockAudio } from "@/alerts/audio";
import { cautionBanner, takeoverQueue } from "@/alerts/selectors";
import { AlertBanner } from "@/components/alerts/alert-banner";
import { AlertTakeover } from "@/components/alerts/alert-takeover";
import { Button } from "@/components/ui/button";
import type { AlertRecord, AlertTier, ProtocolCard } from "@/data/types";

const CARD: ProtocolCard = {
  id: "hydraulic_fault",
  title: { en: "Hydraulic fault nearby", hi: "पास में हाइड्रोलिक ख़राबी" },
  steps: [
    { en: "Stay clear of the machine", hi: "मशीन से दूर रहें" },
    { en: "Move upwind: go north", hi: "हवा की उल्टी दिशा में जाएँ: उत्तर" },
    { en: "Tell your supervisor", hi: "सुपरवाइज़र को बताएँ" },
  ],
  pictogram: "fault",
  upwind_hint: true,
  version: 1,
};

function make(tier: AlertTier, kind: AlertRecord["kind"], id: string, over: Partial<AlertRecord> = {}): AlertRecord {
  return {
    alert_id: id,
    kind,
    tier,
    needs_ack: tier === "warning" || tier === "critical",
    escalate_at: tier === "warning" || tier === "critical" ? new Date(Date.now() + 20_000).toISOString() : null,
    occurrences: 1,
    protocol_card_id: kind === "guardian_hazard" ? CARD.id : null,
    upgraded_from: null,
    status: "open",
    first_seen: new Date().toISOString(),
    ...over,
  };
}

/** Drives the alert tiers on fixtures: vibration, audio, stamp on upgrade, "+n more", acknowledge. */
export function KitAlerts() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const queue = takeoverQueue(alerts);
  const banner = cautionBanner(alerts);
  const top = queue[0];

  const ack = () => setAlerts((all) => all.map((a) => (a.alert_id === top?.alert_id ? { ...a, status: "acknowledged" } : a)));
  const upgrade = () =>
    setAlerts((all) => all.map((a) => (a.alert_id === "g1" ? { ...a, tier: "critical", upgraded_from: "warning" } : a)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-6">
        <Button onClick={() => void unlockAudio()}>Unlock audio</Button>
        <Button onClick={() => setAlerts((a) => [...a, make("caution", "ppe_missing", `c${a.length}`)])}>Caution</Button>
        <Button onClick={() => setAlerts((a) => [...a, make("warning", "seatbelt_off_moving", `w${a.length}`, { occurrences: 3 })])}>Warning ×3</Button>
        <Button onClick={() => setAlerts((a) => [...a, make("warning", "guardian_hazard", "g1")])}>Guardian warning</Button>
        <Button onClick={upgrade}>Upgrade g1 → critical</Button>
        <Button onClick={() => setAlerts([])}>Clear all</Button>
      </div>
      <p className="t-meta text-ink-3">
        queue {queue.length} · banner {banner ? banner.kind : "none"} · top {top ? `${top.kind} ${top.tier}` : "none"}
      </p>
      {banner ? <AlertBanner alert={banner} /> : null}
      {top ? (
        <AlertTakeover
          alert={top}
          more={queue.length - 1}
          card={top.protocol_card_id ? CARD : undefined}
          onAcknowledge={ack}
          onShowOnMap={() => {}}
          explanation={top.kind === "guardian_hazard" ? "EXC-014 hydraulic oil is at 86 °C, rising above its normal 71 °C." : undefined}
        />
      ) : null}
    </div>
  );
}
