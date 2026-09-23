"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { useAlertFeedback } from "@/alerts/use-alert-feedback";
import { Pictogram } from "@/components/ui/pictogram";
import type { AlertRecord } from "@/data/types";

/** The Caution tier: an 80 px yellow banner under the strip that leads to Safety and clears itself. */
export function AlertBanner({ alert }: { alert: AlertRecord }) {
  const t = useTranslations();
  useAlertFeedback(alert);
  return (
    <div role="status">
      <Link href="/op/safety" className="alert-banner">
        <Pictogram name={KIND_PICTO[alert.kind]} />
        <span className="t-chip">{t("enums.safety.caution")}</span>
        <span className="t-label">{t(`alerts.kind.${alert.kind}`)}</span>
        {alert.occurrences > 1 ? <span className="t-label tnum">{t("alerts.occurrences", { n: alert.occurrences })}</span> : null}
      </Link>
    </div>
  );
}
