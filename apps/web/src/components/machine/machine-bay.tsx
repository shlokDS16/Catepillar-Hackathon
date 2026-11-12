"use client";

import { useTranslations } from "next-intl";
import { MachineDrawing } from "@/components/machine/machine-drawing";
import { MachineParts } from "@/components/machine/machine-parts";
import { useAppState } from "@/data/store";
import { machineParts, worstPart } from "@/machine/parts";

/** The drawing and the parts list, mounted on Home until the Bay layout lands (D17 phase 2). */
export function MachineBay() {
  const t = useTranslations("bay");
  const machine = useAppState((s) => s.machine);
  const parts = machineParts({ machine });
  if (parts.length === 0) return null;
  const hl = worstPart(parts);
  return (
    <section className="bay" aria-label={t("title")}>
      <div className="bay-stage">
        <MachineDrawing parts={parts} highlight={hl?.id} callouts="tags" />
        <p className="t-caption text-ink-3 bay-cap">{t("drawingNote")}</p>
      </div>
      <MachineParts parts={parts} />
    </section>
  );
}
