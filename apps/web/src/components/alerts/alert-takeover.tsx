"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useAudioState } from "@/alerts/audio";
import { KIND_PICTO } from "@/alerts/kinds";
import { useAlertFeedback } from "@/alerts/use-alert-feedback";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import type { AlertRecord, I18nText, Lang, ProtocolCard } from "@/data/types";
import { secondsUntil, serverNowMs } from "@/lib/clock";

export function localText(text: I18nText, lang: Lang): { value: string; english: boolean } {
  const value = text[lang];
  return value ? { value, english: false } : { value: text.en, english: true };
}

type TakeoverProps = {
  alert: AlertRecord;
  /** Alerts queued behind this one ("+n more"). */
  more?: number;
  card?: ProtocolCard;
  /** Motion lock: Acknowledge is replaced by the "Fix it" line (interaction-map §6). */
  motionLocked?: boolean;
  onAcknowledge: () => void;
  ackStatus?: "idle" | "loading" | "error";
  onShowOnMap?: () => void;
  /** Guardian only: the compact anomaly sentence (AnomalyExplain lands in F12). */
  explanation?: string;
  /** Critical: the dispatch line from `dispatch.*` events ("Telegram to Anita: sent"). */
  dispatchLine?: string;
};

/**
 * The Warning (orange, chrome stays) or Critical (red, full screen) takeover. Colour changes at
 * 0 ms; a tier rise replays the 480 ms border stamp once. Vibration and audio come from the hook.
 */
export function AlertTakeover({ alert, more = 0, card, motionLocked, onAcknowledge, ackStatus = "idle", onShowOnMap, explanation, dispatchLine }: TakeoverProps) {
  const t = useTranslations();
  const lang = useLocale() as Lang;
  const { stampKey, clip, listen } = useAlertFeedback(alert);
  const { blocked } = useAudioState();
  const tierWord = t(`enums.safety.${alert.tier}`);
  const heading = useRef<HTMLHeadingElement>(null);

  // A new alert takes focus so keyboard and screen-reader users land on it; the chip stays reachable.
  useEffect(() => {
    heading.current?.focus();
  }, [alert.alert_id]);

  return (
    <section className="takeover" data-tier={alert.tier} role="alert" aria-label={t("alerts.takeover", { tier: tierWord })}>
      <Plate key={stampKey} rule="heavy" stamp={stampKey > 0} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Pictogram name={KIND_PICTO[alert.kind]} shape={alert.tier === "critical" ? "octagon" : "triangle"} size="lg" />
          <h2 ref={heading} tabIndex={-1} className="t-state outline-none">
            {tierWord}
          </h2>
        </div>
        <p className="t-title">{t(`alerts.kind.${alert.kind}`)}</p>
        {alert.occurrences > 1 ? <p className="t-meta text-ink-2">{t("alerts.occurrences", { n: alert.occurrences })}</p> : null}
        {alert.upgraded_from ? (
          <p className="t-meta text-ink-2">{t("alerts.upgraded", { tier: t(`enums.safety.${alert.upgraded_from}`) })}</p>
        ) : null}
        {explanation ? <p className="t-body">{explanation}</p> : null}
        {dispatchLine ? <p className="t-label">{dispatchLine}</p> : null}
      </Plate>

      {card ? <ProtocolSteps card={card} lang={lang} /> : null}

      {alert.escalate_at ? <Escalation key={`${alert.alert_id}:${alert.escalate_at}`} escalateAt={alert.escalate_at} /> : null}

      <div className="flex flex-wrap items-start gap-6">
        {motionLocked ? (
          <p className="t-label">{t("alerts.fixIt")}</p>
        ) : (
          <Button variant="primary" size="sos" status={ackStatus} note={ackStatus === "error" ? t("alerts.notSent") : undefined} onClick={onAcknowledge}>
            {ackStatus === "error" ? t("chrome.tryAgain") : t("alerts.acknowledge")}
          </Button>
        )}
        {clip ? (
          <Button onClick={listen} note={blocked ? t("alerts.soundBlocked") : undefined}>
            {t("alerts.listen")}
          </Button>
        ) : null}
        {alert.kind === "guardian_hazard" && onShowOnMap ? <Button onClick={onShowOnMap}>{t("alerts.showOnMap")}</Button> : null}
      </div>

      {more > 0 ? <p className="t-label">{t("alerts.more", { n: more })}</p> : null}
    </section>
  );
}

function ProtocolSteps({ card, lang }: { card: ProtocolCard; lang: Lang }) {
  const title = localText(card.title, lang);
  return (
    <Plate as="ol" className="flex list-none flex-col gap-2 p-4">
      <li className="t-label">{title.value}</li>
      {card.steps.map((step, i) => {
        const s = localText(step, lang);
        return (
          <li key={i} className="t-body flex gap-3">
            <span className="t-figure tnum">{i + 1}</span>
            <span lang={s.english ? "en" : undefined}>{s.value}</span>
          </li>
        );
      })}
    </Plate>
  );
}

/**
 * Countdown to `escalate_at` on the server clock. The bar drains linearly (a 1 s linear transition
 * between ticks; zero under reduced motion, so it steps). Keyed by the parent on alert + escalate_at,
 * so the total is fixed for its lifetime. Only the final "alerted" line is announced.
 */
function Escalation({ escalateAt }: { escalateAt: string }) {
  const t = useTranslations("alerts");
  const [left, setLeft] = useState(() => secondsUntil(escalateAt));
  const [total] = useState(() => Math.max(1, secondsUntil(escalateAt)));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(secondsUntil(escalateAt, serverNowMs())), 1000);
    return () => window.clearInterval(id);
  }, [escalateAt]);
  const done = left <= 0;
  return (
    <div className="flex flex-col gap-2">
      {done ? (
        <p className="t-label" role="status">
          {t("escalated")}
        </p>
      ) : (
        <p className="t-label tnum">{t("escalatesIn", { s: left })}</p>
      )}
      <div className="countdown" style={{ transform: `scaleX(${Math.min(1, left / total)})` }} aria-hidden="true" />
    </div>
  );
}
