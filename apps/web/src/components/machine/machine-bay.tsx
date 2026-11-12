"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MachineDrawing, type DrawingCallouts } from "@/components/machine/machine-drawing";
import { MachineParts } from "@/components/machine/machine-parts";
import { useAppState } from "@/data/store";
import { machineParts, worstPart } from "@/machine/parts";

/** Tags from 1280 px, number pins from 768 px, none on phones (the parts list carries the state there). */
function subscribe(cb: () => void) {
  const qs = [window.matchMedia("(min-width: 1280px)"), window.matchMedia("(min-width: 768px)")];
  qs.forEach((q) => q.addEventListener("change", cb));
  return () => qs.forEach((q) => q.removeEventListener("change", cb));
}
const snap = (): DrawingCallouts => (window.matchMedia("(min-width: 1280px)").matches ? "tags" : window.matchMedia("(min-width: 768px)").matches ? "numbers" : "none");
export function useBayCallouts(): DrawingCallouts {
  return useSyncExternalStore(subscribe, snap, () => "none");
}

/** The drafting-paper stage: children (the state word row) above the drawing, caption below. */
export function BayStage({ children }: { children?: ReactNode }) {
  const t = useTranslations("bay");
  const machine = useAppState((s) => s.machine);
  const callouts = useBayCallouts();
  const parts = machineParts({ machine });
  const hl = worstPart(parts);
  return (
    <section className="bay bay-stage" aria-label={t("title")}>
      {children}
      {parts.length > 0 ? (
        <div className="bay-fit">
          <MachineDrawing parts={parts} highlight={hl?.id} callouts={callouts} />
        </div>
      ) : null}
      {parts.length > 0 ? <p className="t-caption text-ink-3 bay-cap">{t("drawingNote")}</p> : null}
    </section>
  );
}

/** The parts list: the accessible twin of the drawing (always rendered). */
export function BayParts() {
  const machine = useAppState((s) => s.machine);
  const parts = machineParts({ machine });
  if (parts.length === 0) return null;
  return <MachineParts parts={parts} />;
}
