"use client";

import { useTranslations } from "next-intl";
import { Plate } from "@/components/ui/plate";
import type { ReplayDebriefResult } from "@cat/shared";

/**
 * STUB for R4. R3 hands the scored `ReplayDebriefResult` here; R4 replaces this body with the
 * Debrief (re-enactment, scores, process trace, decisions, the rule, next steps). Keep the prop.
 */
export function ReplayDebrief({ result }: { result: ReplayDebriefResult }) {
  const t = useTranslations("replay.decide");
  return (
    <Plate as="section" className="replay-scoring" data-r4-stub data-lesson={result.lesson_code ?? undefined}>
      <p className="t-title">{t("debriefStub")}</p>
      <p className="t-body">{t("debriefStubNote")}</p>
    </Plate>
  );
}
