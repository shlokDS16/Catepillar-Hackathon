"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { localText } from "@/components/alerts/alert-takeover";
import { AnomalyExplain, type Anomaly } from "@/components/map/anomaly-explain";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { useAudio } from "@/audio/use-audio";
import type { AlertRecord, Lang, ProtocolCard } from "@/data/types";
import { compassKey } from "@/map/site-map";
import type { GuardianHazard } from "@cat/shared";
import type { z } from "zod";

export type Hazard = z.infer<typeof GuardianHazard>;

type Props = {
  hazard: Hazard;
  card: ProtocolCard | null;
  anomaly?: Anomaly;
  alert?: AlertRecord;
  onAcknowledge?: () => void;
  ackStatus?: "idle" | "loading" | "error";
};

/**
 * S4 L1: the Guardian protocol card as a bottom sheet on the map: title, 3 steps with their
 * `guardian.{card_id}.step{n}` audio, "Move upwind: go north" from the wind, the distance, and
 * Acknowledge when the alert still needs it. The compact AnomalyExplain says why this machine.
 */
export function GuardianCard({ hazard, card, anomaly, alert, onAcknowledge, ackStatus = "idle" }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const lang = useLocale() as Lang;
  const upwind = hazard.wind_from_deg !== null ? compassKey(hazard.wind_from_deg) : null;
  const needsAck = alert?.needs_ack && alert.status === "open";

  return (
    <Plate as="section" rule="heavy" className="guardian-card flex flex-col gap-4" aria-label={t("map.guardianTitle")}>
      <div className="flex items-center gap-3">
        <Pictogram name="fault" shape="triangle" size="lg" />
        <div>
          <p className="t-title">{card ? localText(card.title, lang).value : t("map.guardianTitle")}</p>
          <p className="t-label tnum">
            {t("map.machineAt", { code: hazard.machine_code, m: format.number(hazard.distance_m, { maximumFractionDigits: 0 }) })}
          </p>
        </div>
      </div>

      {card ? (
        <ol className="list-none p-0 m-0 flex flex-col gap-3">
          {card.steps.map((step, i) => (
            <Step key={i} n={i + 1} cardId={card.id} text={localText(step, lang)} />
          ))}
        </ol>
      ) : null}

      {card?.upwind_hint && upwind ? (
        <p className="t-label flex items-center gap-2">
          <span className="wind-arrow" style={{ transform: `rotate(${hazard.wind_from_deg ?? 0}deg)` }} aria-hidden="true">
            ↑
          </span>
          {t("map.moveUpwind", { dir: t(`map.compass.${upwind}`) })}
        </p>
      ) : null}

      {anomaly ? (
        <div className="border-t border-rule-soft pt-3">
          <p className="t-label text-ink-2">{t("map.whyThisMachine")}</p>
          <AnomalyExplain anomaly={anomaly} variant="compact" live={alert ? alert.status !== "resolved" : true} />
        </div>
      ) : null}

      {needsAck && onAcknowledge ? (
        <Button variant="primary" size="sos" status={ackStatus} note={ackStatus === "error" ? t("alerts.notSent") : undefined} onClick={onAcknowledge}>
          {ackStatus === "error" ? t("chrome.tryAgain") : t("alerts.acknowledge")}
        </Button>
      ) : null}

      <p className="t-meta text-ink-3">{t("map.isoLine")}</p>
    </Plate>
  );
}

function Step({ n, cardId, text }: { n: number; cardId: string; text: { value: string; english: boolean } }) {
  const t = useTranslations("alerts");
  const audio = useAudio(`guardian.${cardId}.step${n}`);
  return (
    <li className="flex items-center gap-3">
      <span className="t-figure tnum">{n}</span>
      <span className="t-body flex-1" lang={text.english ? "en" : undefined}>
        {text.value}
      </span>
      {audio.available ? (
        <Button size="dense" onClick={audio.play} note={audio.blocked ? t("soundBlocked") : undefined}>
          {t("listen")}
        </Button>
      ) : null}
    </li>
  );
}
