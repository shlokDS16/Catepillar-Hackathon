"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** `navigator.onLine` as an external store. The server render assumes a signal. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Between the last Decide step and the Debrief (screens.md, "Loading between Decide and Debrief:
 * Scoring…"). There is no Submit button (T7): the submit is automatic and, on failure, the
 * answers are kept and the same request is retried. Offline says "Waiting for signal".
 */
export function ReplaySubmitting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const t = useTranslations("replay.decide");
  const retry = useTranslations("replay");
  const online = useOnline();

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
