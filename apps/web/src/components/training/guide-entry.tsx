"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GuideSheet } from "@/components/training/guide-sheet";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { guideIsOpen, guideSeenStore, parseGuideSeen, type GuideRequest } from "@/training/guide-seen";

/**
 * The way into "How practice works" on S5a /op/training: a labelled control that is always there,
 * plus the one automatic showing before an operator's first practice.
 *
 * "Seen" is a device flag in localStorage read through useSyncExternalStore, so nothing is pushed
 * into state from an effect and the server render is stable. The server snapshot says "seen", so
 * a returning operator never gets a flash of the guide on load; the one operator who has not seen
 * it gets it on the first client paint instead.
 */
export function GuideEntry() {
  const t = useTranslations("guide");
  const snapshot = useSyncExternalStore(
    guideSeenStore.subscribe,
    guideSeenStore.getSnapshot,
    guideSeenStore.getServerSnapshot,
  );
  const { seen, persistFailed } = parseGuideSeen(snapshot);
  const [request, setRequest] = useState<GuideRequest>("auto");
  const open = guideIsOpen(request, seen);

  // No useCallback: the React Compiler memoises this, and a manual one it cannot verify is a
  // lint error here.
  const close = () => {
    setRequest("closed");
    guideSeenStore.markSeen();
  };

  /*
   * The sheet hands focus back to whatever opened it. The automatic first showing had no opener,
   * so focus would land on <body> and the next Tab would restart at the skip link. This puts it
   * on the control that reopens the guide instead. It runs after the sheet's own focus effect
   * (child effects first) and only when nothing else has claimed focus.
   */
  const actionRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    // Only on a true close. Without the previous-state guard this also ran on first paint, when
    // activeElement is <body> for every visitor, so simply loading /op/training stole focus onto
    // this button — defeating the skip link the effect exists to protect.
    const justClosed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!justClosed) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    actionRef.current?.querySelector("button")?.focus();
  }, [open]);

  return (
    <>
      <Plate as="section" className="guide-entry" aria-labelledby="guide-entry-title">
        <h2 id="guide-entry-title" className="t-title">
          {t("entryTitle")}
        </h2>
        <p className="t-body">{t("entryBody")}</p>
        <div className="guide-entry-action" ref={actionRef}>
          <Button onClick={() => setRequest("open")}>{t("open")}</Button>
        </div>
      </Plate>
      <GuideSheet open={open} onClose={close} persistNote={persistFailed ? t("notSaved") : undefined} />
    </>
  );
}
