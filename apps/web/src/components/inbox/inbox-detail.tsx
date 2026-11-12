"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { AnomalyExplain } from "@/components/map/anomaly-explain";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Pictogram } from "@/components/ui/pictogram";
import { newRequestId } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import type { Lang } from "@/data/types";
import { dispatchLabel, parseDispatch, rowActions, type InboxItem } from "@/inbox/inbox";
import { timelineSteps } from "@/inbox/split";

export const ageMinutes = (simNow: string | null, firstSeen: string): number | null =>
  simNow ? Math.max(0, Math.floor((Date.parse(simNow) - Date.parse(firstSeen)) / 60_000)) : null;

/** "Ravi · EXC-014 · 5 min ago". A near-miss row names no one and shows only the day word. `age: false` leaves the age out (list rows show it in their own column). */
export function useRowMeta(item: InboxItem, simNow: string | null, age = true): string {
  const t = useTranslations("inbox");
  const m = ageMinutes(simNow, item.firstSeen);
  return [
    item.nonPunitive ? t("noOperator") : item.operatorName,
    item.machineCode,
    !age ? null : item.nonPunitive ? t("today") : m === null ? null : m === 0 ? t("ageNow") : t("age", { m }),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The short age for a list row's right-hand column: "now", "20m", "today". */
export function useShortAge(item: InboxItem, simNow: string | null): string {
  const t = useTranslations("inbox");
  const m = ageMinutes(simNow, item.firstSeen);
  if (item.nonPunitive) return t("ageShort.today");
  if (m === null) return "";
  return m === 0 ? t("ageShort.now") : t("ageShort.min", { m });
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
  /** "1 of 6" on the lead band. */
  position?: string;
};

/**
 * One alert in full. Pane (desktop): kicker, title, explanation and actions on the left, evidence and
 * dispatch timeline on the right. Lead (mobile): tier band, title, explanation, fact grid, actions.
 * Mount it with `key={item.id}` so the Acknowledge state and its request id belong to one alert.
 */
export function InboxDetail({ item, live, simNow, lines, granted, onAcknowledged, onGrant, onShowOnMap, variant, position }: DetailProps) {
  const t = useTranslations("inbox");
  const tc = useTranslations("chrome");
  const lang = useLocale() as Lang;
  const port = useDataPort();
  const offline = useAppState((s) => s.connectivity.kind === "nosignal");
  const [ack, setAck] = useState<ButtonStatus>("idle");
  const [requestId] = useState(newRequestId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actions = rowActions(item);
  const anomaly = item.anomaly;
  const meta = useRowMeta(item, simNow);
  const steps = timelineSteps(item, lines, ageMinutes(simNow, item.firstSeen));
  const picto = item.kind === "near_miss" ? "proximity" : KIND_PICTO[item.kind];
  const sentence = anomaly ? (lang === "hi" ? anomaly.explanation.hi : anomaly.explanation.en) : t(`kindExplain.${item.kind}`);
  const last = parseDispatch(item.dispatch);
  const age = ageMinutes(simNow, item.firstSeen);

  async function acknowledge() {
    setAck("loading");
    try {
      await port.alertAck({ p_alert_id: item.id, p_request_id: requestId });
      setAck("success");
      onAcknowledged(item.id);
      // The button is about to leave (the alert moves to Handled): keep focus on this alert.
      headingRef.current?.focus();
    } catch {
      setAck("error");
    }
  }

  const facts: [string, string][] = [
    [t("factWho"), item.nonPunitive ? t("noOperator") : (item.operatorName ?? t("none"))],
    ...(item.machineCode ? [[t("factMachine"), item.machineCode] as [string, string]] : []),
    [t("factWhen"), item.nonPunitive ? t("today") : age === null ? "-" : age === 0 ? t("ageNow") : t("age", { m: age })],
    ...(last && !item.nonPunitive ? [[t("factSent"), t(`dispatchStatus.${last.status}`)] as [string, string]] : []),
  ];

  const actionRow = (
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
  );

  return (
    <article className="inbox-detail" data-variant={variant} data-live={live || undefined} data-tier={live ? item.tier : undefined} aria-labelledby={`inbox-h-${item.id}`}>
      {variant === "lead" ? (
        <header className="inbox-band" data-tier={live ? item.tier : undefined}>
          <span className="inbox-band-tier">
            <Pictogram name={picto} />
            {t(`tier.${item.tier}`)}
            {item.occurrences > 1 ? <span className="tnum"> ×{item.occurrences}</span> : null}
          </span>
          {position ? <span className="t-meta tnum">{position}</span> : null}
        </header>
      ) : (
        <p className="inbox-kicker t-caption tnum">
          <span className="inbox-swatch" data-tier={live ? item.tier : undefined} aria-hidden="true" />
          {t(`tier.${item.tier}`)}
          {item.occurrences > 1 ? ` ×${item.occurrences}` : ""} · {meta}
        </p>
      )}
      <h2 id={`inbox-h-${item.id}`} className="inbox-detail-title" tabIndex={-1} ref={headingRef} data-inbox-heading>
        {t(`kind.${item.kind}`)}
      </h2>
      {ack === "success" || item.status === "acknowledged" ? (
        <p className="t-label" role="status">{t("acknowledged")}</p>
      ) : null}

      <div className="inbox-main">
        <p className="inbox-sentence" lang={lang === "hi" ? "hi" : undefined}>{sentence}</p>
        {item.missing.length > 0 ? <p className="t-body">{t("missing", { items: item.missing.map((m) => t(`ppe.${m}`)).join(", ") })}</p> : null}
        {variant === "lead" ? (
          <dl className="inbox-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="t-caption">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {actionRow}
      </div>

      <div className="inbox-side">
        {anomaly ? (
          <AnomalyExplain anomaly={anomaly} variant="full" live={live} detectedAt={item.firstSeen} onShowOnMap={actions.showOnMap ? onShowOnMap : undefined} hideSentence hideTier />
        ) : null}
        <section aria-label={t("timeline")} className="inbox-section">
          <h3 className="t-caption">{t("timeline")}</h3>
          <ol className="inbox-timeline">
            {steps.map((s, i) => (
              <li key={i} data-dry={s.kind === "dispatch" && s.dryRun ? "true" : undefined}>
                {s.kind === "raised" ? (
                  <span>{item.nonPunitive ? t("raisedToday") : s.ageMin === null ? t("raised") : s.ageMin === 0 ? t("raisedNow") : t("raisedAgo", { m: s.ageMin })}</span>
                ) : (
                  <span>{dispatchLabel(t, `${s.channel}:${s.status}`)}</span>
                )}
              </li>
            ))}
            {steps.length === 1 && !item.nonPunitive ? <li className="text-ink-2">{t("noDispatch")}</li> : null}
          </ol>
        </section>
      </div>
    </article>
  );
}
