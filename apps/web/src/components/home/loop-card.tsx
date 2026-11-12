"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ItemAction, useBecause, useLessonTitle } from "@/components/training/training-bits";
import { Plate } from "@/components/ui/plate";
import type { RecurrenceHint } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import { lastLessonDone, nextItem, trainingItems, type TrainingItem } from "@/training/assignments";

/**
 * S1 L4, the end of the loop: my next assignment with one primary action (Practise for a replay,
 * Start lesson for a lesson), and once a lesson is done the recurrence hint
 * ("Seatbelt: 0 repeats in 7 days", labelled simulated). Nothing is shown when nothing is
 * assigned and nothing is done.
 */
export function LoopCard() {
  const snapshot = useAppState((s) => s.snapshot);
  const assignments = useAppState((s) => s.assignments);
  const progress = useAppState((s) => s.training);
  if (!snapshot) return null;
  const items = trainingItems(assignments, progress, snapshot.recent_events);
  const next = nextItem(items);
  const doneCode = lastLessonDone(assignments, progress);
  return (
    <>
      {next ? <NextCard item={next} /> : null}
      {doneCode ? <RecurrenceCard code={doneCode} /> : null}
    </>
  );
}

function NextCard({ item }: { item: TrainingItem }) {
  const t = useTranslations("home");
  const title = useLessonTitle(item.lessonCode);
  const because = useBecause(item.eventAt);
  return (
    <Plate as="section" rule="heavy" className="flex flex-col gap-3" aria-label={t("loopTitle")}>
      <p className="t-label text-ink-2 tnum">{because}</p>
      {title ? <p className="t-title">{title}</p> : null}
      <div className="flex flex-wrap items-center gap-6">
        <ItemAction item={item} primary />
      </div>
    </Plate>
  );
}

function RecurrenceCard({ code }: { code: string }) {
  const t = useTranslations("home");
  const training = useTranslations("training");
  const port = useDataPort();
  const [hint, setHint] = useState<RecurrenceHint | null>(null);
  useEffect(() => {
    let live = true;
    port
      .recurrence(code)
      .then((h) => {
        if (live) setHint(h);
      })
      .catch(() => {
        if (live) setHint(null);
      });
    return () => {
      live = false;
    };
  }, [port, code]);
  if (!hint) return null;
  const topic = training.has(`topic.${code}`) ? training(`topic.${code}`) : code;
  return (
    <Plate as="section" rule="hair" className="flex flex-col gap-1" aria-label={t("recurrenceTitle")}>
      <p className="t-label text-ink-2">{t("recurrenceTitle")}</p>
      <p className="t-title tnum">{t("recurrence", { topic, n: hint.repeats, days: hint.days })}</p>
      {hint.simulated ? <p className="t-meta text-ink-3">{t("recurrenceSim")}</p> : null}
    </Plate>
  );
}
