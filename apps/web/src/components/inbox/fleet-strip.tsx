"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { buildFleetCells, isTier, PHONE_CELLS } from "@/components/inbox/fleet";
import { Chip } from "@/components/ui/chip";
import { Pictogram } from "@/components/ui/pictogram";
import type { InboxItem } from "@/inbox/inbox";

/**
 * T8: six machine cells above the Inbox queue (code, operator and task, a state plate). A tier plate
 * carries colour, pictogram and word and only while that alert is open; Working and Parked are plain
 * outlines. The machine of the alert being read is underlined (aria-current). Phones show three cells
 * and "+3 more". The roster is demo scenario data and the caption says so.
 */
export function FleetStrip({ items, selectedId }: { items: readonly InboxItem[]; selectedId: string | null }) {
  const t = useTranslations("fleet");
  const [open, setOpen] = useState(false);
  const uid = useId();
  const cells = buildFleetCells(items, selectedId);
  const hidden = cells.length - PHONE_CELLS;
  return (
    <section className="fleet" aria-labelledby={`${uid}-h`} data-open={open || undefined}>
      <div className="fleet-head">
        <h2 id={`${uid}-h`} className="t-caption">{t("title")}</h2>
        <p className="t-caption text-ink-2">{t("note")}</p>
      </div>
      <ul id={`${uid}-l`} className="fleet-cells">
        {cells.map((c) => {
          return (
            <li key={c.code} className="fleet-cell" data-phone={c.phone || undefined} data-selected={c.selected || undefined} aria-current={c.selected ? "true" : undefined}>
              <span className="fleet-code t-title tnum">{c.code}</span>
              <span className="fleet-who t-meta text-ink-2">{t("who", { operator: c.operator, task: t(`task.${c.task}`) })}</span>
              <Chip tone={isTier(c.state) ? c.state : "outline"} word icon={isTier(c.state) ? <Pictogram name={c.kind ? KIND_PICTO[c.kind] : "fault"} /> : undefined}>
                {t(`state.${c.state}`)}
              </Chip>
            </li>
          );
        })}
      </ul>
      <button type="button" className="fleet-more t-label" aria-expanded={open} aria-controls={`${uid}-l`} onClick={() => setOpen((v) => !v)}>
        {open ? t("less") : t("more", { n: hidden })}
      </button>
    </section>
  );
}
