"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Mark, Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import type { PpeView } from "@/task/task-state";

/**
 * The PPE block plate (interaction-map §7, Site Signage). Blue mandatory sign per missing item,
 * "Supervisor notified", then one of three outcomes: "Vest detected" (restored), "Override by Anita
 * until 14:17" (override), "Override expired" (blocked again). It is a sign, not an alarm: no motion
 * beyond the one-shot border stamp, no sound, and the live region is polite.
 */
export function PpePlate({ view, dryRun }: { view: PpeView; dryRun: boolean }) {
  const t = useTranslations("task.ppe");
  const format = useFormatter();
  if (view.kind === "clear") return null;

  const item = (i: string) => (t.has(`item.${i}`) ? t(`item.${i}`) : i);

  if (view.kind === "restored") {
    return (
      <Plate key="restored" tone="clear" rule="heavy" role="status" aria-label={t("label")} className="ppe-plate">
        <p className="t-title flex items-center gap-3">
          <Mark kind="check" />
          {t("detected", { items: view.items.length > 0 ? view.items.map(item).join(", ") : t("allItems") })}
        </p>
      </Plate>
    );
  }

  if (view.kind === "override") {
    return (
      <Plate key="override" tone="caution" rule="heavy" role="status" aria-label={t("label")} className="ppe-plate">
        <p className="t-title">{t(view.lapsed ? "overrideLapsed" : "override", { time: format.dateTime(new Date(view.validUntil), "time") })}</p>
        <p className="t-meta">{view.lapsed ? t("lapsedNote") : t("overrideNote", { items: view.missing.map(item).join(", ") })}</p>
      </Plate>
    );
  }

  // blocked and expired share the blue mandatory plate; expired says why it is back.
  return (
    <Plate key={view.kind} tone="mandatory" rule="heavy" stamp role="status" aria-label={t("label")} className="ppe-plate">
      {view.kind === "expired" ? <p className="t-label">{t("expired")}</p> : null}
      <ul className="ppe-items">
        {view.missing.map((i) => (
          <li key={i} className="ppe-item">
            {i === "vest" ? <Pictogram name="vest" size="lg" /> : <Mark kind="info" />}
            <span className="t-title">{t("wear", { item: item(i) })}</span>
          </li>
        ))}
      </ul>
      <p className="t-label">{dryRun ? t("notifiedDryRun") : t("notified")}</p>
    </Plate>
  );
}
