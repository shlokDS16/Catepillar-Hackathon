"use client";

import { useEffect, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { localText } from "@/components/alerts/alert-takeover";
import { EvidenceSitePlan } from "@/components/replay/evidence-site-plan";
import { TrendChart } from "@/components/replay/trend-chart";
import { Plate } from "@/components/ui/plate";
import { useDataPort } from "@/data/store";
import type { Lang, ProtocolCard } from "@/data/types";
import { compassKey } from "@/map/site-map";
import { severityWord, windArrowDeg } from "@/replay/evidence";
import type { EvidenceCard } from "@cat/shared";

/** `wind` (S5b): a compass arrow from `from_deg`, with the speed and the gusts underneath. */
function WindCard({ card }: { card: Extract<EvidenceCard, { type: "wind" }> }) {
  const t = useTranslations("replay.evidence");
  const root = useTranslations();
  const format = useFormatter();
  const dir = root(`map.compass.${compassKey(card.from_deg)}`);
  const kmh = format.number(card.kmh, { maximumFractionDigits: 0 });

  return (
    <div className="ev-wind">
      <svg viewBox="0 0 100 100" className="ev-compass" role="img" aria-label={t("wind.arrowLabel", { dir })}>
        <circle cx="50" cy="50" r="42" className="ev-compass-ring" />
        <text x="50" y="15" fontSize={14} textAnchor="middle" className="ev-compass-n">
          {t("wind.north")}
        </text>
        {/* The arrow points the way the air travels; the label always names where it comes FROM. */}
        <g transform={`rotate(${windArrowDeg(card.from_deg)} 50 50)`} className="ev-compass-arrow">
          <line x1="50" y1="74" x2="50" y2="26" />
          <path d="M50 20 L58 36 L42 36 Z" />
        </g>
      </svg>
      <div className="ev-wind-read">
        <p className="t-title">{t("wind.from", { dir })}</p>
        <p className="t-figure tnum">{t("wind.speed", { kmh })}</p>
        <p className="t-body text-ink-2 tnum">
          {card.gust_kmh === null
            ? t("wind.noGust")
            : t("wind.gusts", { kmh: format.number(card.gust_kmh, { maximumFractionDigits: 0 }) })}
        </p>
      </div>
    </div>
  );
}

/** `fault_code`: code · severity word · description. Some of these are distractors by design. */
function FaultCodeCard({ card }: { card: Extract<EvidenceCard, { type: "fault_code" }> }) {
  const t = useTranslations("replay.evidence");
  const root = useTranslations();
  const lang = useLocale() as Lang;

  return (
    <ul className="ev-rows">
      {card.codes.map((c) => {
        const word = severityWord(c.severity);
        const text = localText(c.description, lang);
        return (
          <li key={`${c.code_type}:${c.code}`} className="ev-row">
            <p className="t-label tnum ev-code">{c.code}</p>
            {/* Ink, never a safety fill: inside a replay nothing is live (visual-language §1.1). */}
            <p className="t-label ev-severity">{word ? root(`enums.safety.${word}`) : c.severity}</p>
            <p className="t-body" lang={text.english ? "en" : undefined}>
              {text.value}
            </p>
            <p className="t-meta text-ink-3">{t("fault.codeType", { type: c.code_type })}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** `protocol_card`: the fixed card's steps, fetched by `card_id` (the same card the alerts show). */
function ProtocolCardEvidence({ card }: { card: Extract<EvidenceCard, { type: "protocol_card" }> }) {
  const t = useTranslations("replay.evidence");
  const lang = useLocale() as Lang;
  const port = useDataPort();
  // Keyed by the id it answers for, so a new card_id reads as "loading" without an effect ever
  // setting state synchronously (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{ id: string; card: ProtocolCard | null } | null>(null);

  const cardId = card.card_id;
  useEffect(() => {
    let live = true;
    void port
      .protocolCard(cardId)
      .then((c) => {
        if (live) setLoaded({ id: cardId, card: c });
      })
      .catch(() => {
        if (live) setLoaded({ id: cardId, card: null });
      });
    return () => {
      live = false;
    };
  }, [cardId, port]);

  const ready = loaded?.id === cardId ? loaded : null;
  if (!ready) return <Plate loading className="min-h-hit" aria-label={t("protocol.loading")} />;
  if (!ready.card) return <p className="t-body">{t("protocol.failed")}</p>;

  const title = localText(ready.card.title, lang);
  return (
    <div className="ev-protocol">
      <p className="t-title" lang={title.english ? "en" : undefined}>
        {title.value}
      </p>
      <ol className="ev-steps">
        {ready.card.steps.map((step, i) => {
          const s = localText(step, lang);
          return (
            <li key={s.value} className="ev-step">
              <span className="t-label tnum ev-step-n">{i + 1}</span>
              <span className="t-body" lang={s.english ? "en" : undefined}>
                {s.value}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** `weather`: two figures, temperature and WBGT. WBGT gets its one line of explanation. */
function WeatherCard({ card }: { card: Extract<EvidenceCard, { type: "weather" }> }) {
  const t = useTranslations("replay.evidence");
  const format = useFormatter();
  const degrees = (c: number) => t("weather.degrees", { c: format.number(c, { maximumFractionDigits: 1 }) });

  return (
    <div className="ev-figures">
      <div className="ev-figure">
        <p className="t-label text-ink-2">{t("weather.temperature")}</p>
        <p className="t-figure tnum">{degrees(card.temperature_c)}</p>
      </div>
      <div className="ev-figure">
        <p className="t-label text-ink-2">{t("weather.wbgt")}</p>
        <p className="t-figure tnum">{card.wbgt_c === null ? t("weather.noWbgt") : degrees(card.wbgt_c)}</p>
        <p className="t-meta text-ink-3">{t("weather.wbgtNote")}</p>
      </div>
    </div>
  );
}

/** `shift_hours`: hours on shift plus the circadian band word ("after-lunch dip"). */
function ShiftHoursCard({ card }: { card: Extract<EvidenceCard, { type: "shift_hours" }> }) {
  const t = useTranslations("replay.evidence");
  const format = useFormatter();

  return (
    <div className="ev-figures">
      <div className="ev-figure">
        <p className="t-figure tnum">{t("shift.hours", { h: format.number(card.hours_on_shift, { maximumFractionDigits: 1 }) })}</p>
        <p className="t-label text-ink-2">{t(`shift.band.${card.circadian_band}`)}</p>
      </div>
    </div>
  );
}

/**
 * The open evidence card's body (S5b, "An open card is a sheet, with content by
 * `EvidenceCard.type`"). All seven types, all ink on paper: no safety fills, because a filled
 * safety colour always means a live state and a replay is never live.
 */
export function EvidenceCardBody({ card, eventTime }: { card: EvidenceCard; eventTime: string }) {
  switch (card.type) {
    case "telemetry_trend":
      return <TrendChart card={card} eventTime={eventTime} />;
    case "wind":
      return <WindCard card={card} />;
    case "map_snapshot":
      return <EvidenceSitePlan card={card} />;
    case "fault_code":
      return <FaultCodeCard card={card} />;
    case "protocol_card":
      return <ProtocolCardEvidence card={card} />;
    case "weather":
      return <WeatherCard card={card} />;
    case "shift_hours":
      return <ShiftHoursCard card={card} />;
  }
}
