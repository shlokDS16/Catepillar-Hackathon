"use client";

import { FUEL_PRICE, type AnomalyDetected } from "@cat/shared";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { z } from "zod";
import { safetyTone } from "@/alerts/selectors";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ProvenanceChip } from "@/components/ui/provenance";
import { useMode } from "@/data/mode";
import type { Lang } from "@/data/types";

export type Anomaly = z.infer<typeof AnomalyDetected>;

type Props = {
  anomaly: Anomaly;
  /** compact: Guardian card and the takeover; full: FM side sheet and the expanded Inbox row. */
  variant: "compact" | "full";
  /** Colour only while the alert is live; ink outline once resolved. */
  live?: boolean;
  detectedAt?: string;
  onShowOnMap?: () => void;
};

/**
 * S4a AnomalyExplain: the fixed-template sentence (rendered in SQL, never by an LLM), the cost row,
 * the severity, and in full mode the method, inputs with provenance, and Show on map.
 */
export function AnomalyExplain({ anomaly, variant, live = true, detectedAt, onShowOnMap }: Props) {
  const t = useTranslations("map");
  const format = useFormatter();
  const lang = useLocale() as Lang;
  const { mode } = useMode();
  const english = lang !== "hi";
  const sentence = english ? anomaly.explanation.en : anomaly.explanation.hi;
  const tierWord = t(`tier.${anomaly.severity_tier}`);
  const detailed = mode === "detailed" || variant === "full";

  return (
    <div className="flex flex-col gap-3">
      <p className="t-body" lang={english ? "en" : undefined}>
        {sentence}
        {lang === "ta" ? <span className="t-meta text-ink-3"> ({t("english")})</span> : null}
      </p>

      {anomaly.fuel_l !== null && anomaly.cost_inr !== null ? (
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="t-figure tnum">{t("litres", { l: format.number(anomaly.fuel_l, { maximumFractionDigits: 0 }) })}</span>
          <span className="t-figure tnum">{format.number(anomaly.cost_inr, "inr")}</span>
          <span className="t-meta text-ink-3">{t("atPrice", { price: format.number(FUEL_PRICE.diesel_inr_per_l, "inr") })}</span>
        </div>
      ) : null}

      {detailed ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="t-label tnum">{t("severity", { score: anomaly.severity_score })}</span>
          <div className="bar flex-1 min-w-hit" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${anomaly.severity_score}%` }} />
          </div>
          <Chip tone={live ? safetyTone(anomaly.severity_tier) : "outline"} word>
            {tierWord}
          </Chip>
        </div>
      ) : null}

      {variant === "full" ? (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 t-meta text-ink-2">
            <dt>{t("method")}</dt>
            <dd>{t(`methodName.${anomaly.method}`)}</dd>
            {detectedAt ? (
              <>
                <dt>{t("detected")}</dt>
                <dd className="tnum">{format.dateTime(new Date(detectedAt), "time")}</dd>
              </>
            ) : null}
            {Object.entries(anomaly.features).map(([key, value]) => (
              <FeatureRow key={key} name={key} value={value} />
            ))}
          </dl>
          {onShowOnMap ? <Button onClick={onShowOnMap}>{t("showOnMap")}</Button> : null}
        </>
      ) : null}
    </div>
  );
}

/** Input values with their provenance chip: hydraulic temp is an assumed sensor, idle_pct is organiser data. */
function FeatureRow({ name, value }: { name: string; value: number }) {
  const t = useTranslations("map");
  const format = useFormatter();
  const field = name === "value" || name === "mean" ? "hydraulic_temp_c" : name === "idle_pct" ? "idle_hours" : name;
  const table = field === "hydraulic_temp_c" ? "machine_state" : "telemetry_readings";
  return (
    <>
      <dt>{t.has(`feature.${name}`) ? t(`feature.${name}`) : name}</dt>
      <dd className="tnum flex items-center gap-2">
        {format.number(value, { maximumFractionDigits: 1 })} <ProvenanceChip table={table} field={field} />
      </dd>
    </>
  );
}
