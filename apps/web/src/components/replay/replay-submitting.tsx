"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { useAppState } from "@/data/store";

/**
 * Between the last Decide step and the Debrief (screens.md, "Loading between Decide and Debrief:
 * Scoring…"). There is no Submit button (T7): the submit is automatic and, on failure, the
 * answers are kept and the same request is retried. Offline says "Waiting for signal".
 */
export function ReplaySubmitting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const t = useTranslations("replay.decide");
  const retry = useTranslations("replay");
  // The same signal as the status strip, so this screen never disagrees with it.
  const online = useAppState((st) => st.connectivity.kind !== "nosignal");

  if (!failed) {
    return (
      <Plate as="section" loading className="replay-scoring" aria-busy="true">
        <p className="t-title" role="status">
          {t("scoring")}
        </p>
      </Plate>
    );
  }

  return (
    <Plate as="section" rule="heavy" className="replay-scoring">
      <p className="t-title" role="status">
        {online ? t("notSaved") : t("waiting")}
      </p>
      {online ? null : <p className="t-body">{t("waitingBody")}</p>}
      <Button variant="primary" onClick={onRetry}>
        {retry("retry")}
      </Button>
    </Plate>
  );
}
