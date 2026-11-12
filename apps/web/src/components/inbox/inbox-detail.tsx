"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { safetyTone } from "@/alerts/selectors";
import { AnomalyExplain } from "@/components/map/anomaly-explain";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Pictogram } from "@/components/ui/pictogram";
import { newRequestId } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import type { Lang } from "@/data/types";
import { rowActions, type InboxAnomaly, type InboxItem } from "@/inbox/inbox";
import { sparkPoints, sparkSeries, timelineSteps } from "@/inbox/split";

export const ageMinutes = (simNow: string | null, firstSeen: string): number | null =>
  simNow ? Math.max(0, Math.floor((Date.parse(simNow) - Date.parse(firstSeen)) / 60_000)) : null;

/** "Ravi · EXC-014 · 5 min ago". A near-miss row names no one and shows only the day word. */
export function useRowMeta(item: InboxItem, simNow: string | null): string {
  const t = useTranslations("inbox");
  const age = ageMinutes(simNow, item.firstSeen);
  return [
    item.nonPunitive ? t("noOperator") : item.operatorName,
    item.machineCode,
    item.nonPunitive ? t("today") : age === null ? null : age === 0 ? t("ageNow") : t("age", { m: age }),
  ]
    .filter(Boolean)
    .join(" · ");
}

type DetailProps = {
  item: InboxItem;
  /** Colour only while the alert is live and open. */
  live: boolean;
  simNow: string | null;
  /** Every dispatch line for this alert from the live store (oldest first). */
  lines: readonly string[];
  granted: boolean;
  onAcknowledged: (id: string) => void;
  onGrant: () => void;
  onShowOnMap: () => void;
  /** `lead` = the expanded card of the mobile triage. */
  variant: "pane" | "lead";
};

/**
 * One alert in full: what it is, the explanation sentence, the signal around the event (simulated),
 * the dispatch timeline and the actions. Used for the desktop detail pane and the mobile lead card.
 * Mount it with `key={item.id}` so the Acknowledge state and its request id belong to one alert.
 */
export function InboxDetail({ item, live, simNow, lines, granted, onAcknowledged, onGrant, onShowOnMap, variant }: DetailProps) {
  const t = useTranslations("inbox");
  const tc = useTranslations("chrome");
  const lang = useLocale() as Lang;
  const port = useDataPort();
  const offline = useAppState((s) => s.connectivity.kind === "nosignal");
  const [ack, setAck] = useState<ButtonStatus>("idle");
  const [requestId] = useState(newRequestId);
  const actions = rowActions(item);
  const anomaly = item.anomaly;
  const meta = useRowMeta(item, simNow);
  const steps = timelineSteps(item, lines, ageMinutes(simNow, item.firstSeen));
  const tone = live ? safetyTone(item.tier) : "outline";
  const picto = item.kind === "near_miss" ? "proximity" : KIND_PICTO[item.kind];

  async function acknowledge() {
    setAck("loading");
    try {
      await port.alertAck({ p_alert_id: item.id, p_request_id: requestId });
      setAck("success");
      onAcknowledged(item.id);
    } catch {
      setAck("error");
    }
  }

  return (
    <article className="inbox-detail" data-variant={variant} data-live={live || undefined} data-tier={live ? item.tier : undefined} aria-label={t(`kind.${item.kind}`)}>
      <header className="inbox-detail-head" data-tone={tone}>
        <Chip tone={tone} word icon={<Pictogram name={picto} />} count={item.occurrences}>
          {t(`tier.${item.tier}`)}
        </Chip>
        <p className="t-label tnum inbox-detail-meta">{meta}</p>
      </header>
      <h2 className="inbox-detail-title">{t(`kind.${item.kind}`)}</h2>

      {item.missing.length > 0 ? <p className="t-body">{t("missing", { items: item.missing.map((m) => t(`ppe.${m}`)).join(", ") })}</p> : null}

      {anomaly ? (
        <>
          <AnomalyExplain anomaly={anomaly} variant="full" live={live} detectedAt={item.firstSeen} onShowOnMap={actions.showOnMap ? onShowOnMap : undefined} />
          <Spark anomaly={anomaly} lang={lang} />
        </>
      ) : null}

      <section aria-label={t("timeline")} className="inbox-section">
        <h3 className="t-label">{t("timeline")}</h3>
        <ol className="inbox-timeline">
          {steps.map((s, i) => (
            <li key={i} data-dry={s.kind === "dispatch" && s.dryRun ? "true" : undefined}>
              {s.kind === "raised" ? (
                <span>{item.nonPunitive ? t("raisedToday") : s.ageMin === null ? t("raised") : s.ageMin === 0 ? t("raisedNow") : t("raisedAgo", { m: s.ageMin })}</span>
              ) : (
                <span>
                  {t("dispatch", { channel: t(`channel.${s.channel}`), status: t(`dispatchStatus.${s.status}`) })}
                </span>
              )}
            </li>
          ))}
          {steps.length === 1 && !item.nonPunitive ? <li className="text-ink-2">{t("noDispatch")}</li> : null}
        </ol>
      </section>

      <div className="inbox-actions" data-inbox-actions>
        {actions.acknowledge ? (
          <Button variant="primary" status={ack} disabled={offline} note={offline ? tc("needsSignal") : ack === "error" ? t("notSent") : undefined} onClick={acknowledge}>
            {t("acknowledge")}
          </Button>
        ) : null}
        {actions.override && !granted ? (
          <Button disabled={offline} note={offline ? tc("needsSignal") : undefined} onClick={onGrant}>
            {t("grantOverride")}
          </Button>
        ) : null}
        {granted ? <Chip tone="outline">{t("overrideGranted")}</Chip> : null}
        {actions.showOnMap && !anomaly ? <Button onClick={onShowOnMap}>{t("showOnMap")}</Button> : null}
      </div>
    </article>
  );
}

const W = 320;
const H = 96;

/** The signal around the event: a plain ink line, the normal level dashed, labelled SIMULATED (no stored series exists). */
function Spark({ anomaly, lang }: { anomaly: InboxAnomaly; lang: Lang }) {
  const t = useTranslations("inbox");
  const series = sparkSeries(anomaly);
  if (!series) return null;
  const { points, normalY } = sparkPoints(series.values, series.normal, W, H);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const end = points[points.length - 1]!;
  const summary = t("signalSr", { normal: series.normal, value: series.value });
  return (
    <figure className="inbox-spark inbox-section" lang={lang === "hi" ? "hi" : undefined}>
      <figcaption className="t-label">
        {t("signal")} <span className="inbox-sim">{t("simulated")}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <line x1="0" x2={W} y1={normalY} y2={normalY} className="spark-normal" />
        <path d={d} className="spark-line" />
        <circle cx={end.x - 3} cy={end.y} r="5" className="spark-dot" />
      </svg>
      <p className="t-meta tnum inbox-spark-legend">
        <span>{t("normalLevel", { v: series.normal })}</span>
        <span>{t("nowLevel", { v: series.value })}</span>
      </p>
    </figure>
  );
}
