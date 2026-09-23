"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAudioState, playClip } from "@/alerts/audio";
import { clipFor, alertAudioLang } from "@/alerts/feedback";
import { STUB_AUDIO_MANIFEST } from "@/alerts/stub-manifest";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import type { Lang } from "@/data/types";
import { secondsUntil, serverNowMs } from "@/lib/clock";
import { SOS_CANCEL_WINDOW_MS } from "@/sos/hold";
import type { SosState } from "@/sos/use-sos";

type SosSheetProps = {
  open: boolean;
  onClose: () => void;
  state: SosState;
  onCancel: () => void;
  emergencyTel: string | null;
  /** From `dispatch.*` events on the operator topic (UI-10); wired in F07/F13. */
  dispatchLine?: string;
};

/** One-second ticker on the server clock. */
function useTick(): number {
  const [now, setNow] = useState(() => serverNowMs());
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNowMs()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * The SOS sheet (A10, A11): SOS SENT + time, location source, countdown to escalate_at on the
 * server clock, the dispatch line, Cancel for 10 s; or "Not sent. No signal." with Call supervisor
 * and an automatic retry. Each state has a `sos.{state}` clip when the manifest lists one.
 */
export function SosSheet({ open, onClose, state, onCancel, emergencyTel, dispatchLine }: SosSheetProps) {
  const t = useTranslations("sos");
  const format = useFormatter();
  const lang = useLocale() as Lang;
  const now = useTick();
  const { blocked } = useAudioState();
  const clip = clipFor(STUB_AUDIO_MANIFEST, `sos.${state.phase}`, alertAudioLang(lang));

  // Each state's clip plays once when the sheet shows it.
  useEffect(() => {
    if (open && clip) void playClip(clip);
  }, [open, clip]);

  const cancelLeft = state.phase === "sent" ? Math.max(0, Math.ceil((state.sentAtMs + SOS_CANCEL_WINDOW_MS - now) / 1000)) : 0;

  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <div className="flex flex-col gap-4">
        {state.phase === "sending" ? (
          <Plate loading>
            <p className="t-title">{t("sending")}</p>
          </Plate>
        ) : null}

        {state.phase === "sent" ? (
          <>
            <Plate tone="critical" rule="heavy">
              <p className="t-state">{t("sent")}</p>
              <p className="t-title tnum">{format.dateTime(new Date(state.result.server_now), "time")}</p>
            </Plate>
            <p className="t-body">{t(`location.${state.result.location_source}`)}</p>
            <p className="t-label tnum" aria-live="off">
              {secondsUntil(state.result.escalate_at, now) > 0
                ? t("escalatesIn", { s: secondsUntil(state.result.escalate_at, now) })
                : t("escalated")}
            </p>
            {dispatchLine ? <p className="t-body">{dispatchLine}</p> : null}
            {cancelLeft > 0 ? (
              <Button onClick={onCancel} status={state.cancelling ? "loading" : "idle"} note={t("cancelWindow", { s: cancelLeft })}>
                {t("cancel")}
              </Button>
            ) : null}
          </>
        ) : null}

        {state.phase === "failed" ? (
          <>
            <Plate rule="heavy">
              <p className="t-title">{t("notSent")}</p>
              <p className="t-meta text-ink-2">{t("retrying", { n: state.attempt })}</p>
            </Plate>
            {emergencyTel ? (
              <Button variant="primary" href={`tel:${emergencyTel}`}>
                {t("callSupervisor")}
              </Button>
            ) : null}
          </>
        ) : null}

        {state.phase === "cancelled" ? (
          <Plate>
            <p className="t-title">{t("cancelled")}</p>
          </Plate>
        ) : null}

        {clip ? (
          <Button onClick={() => void playClip(clip)} note={blocked ? t("soundBlocked") : undefined}>
            {t("listen")}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
