"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useLessonCards } from "@/training/use-lesson-meta";
import type { TrainingItem } from "@/training/assignments";

/** The topic title of a lesson code, or null when no title is written for it. */
export function useLessonTitle(code: string): string | null {
  const home = useTranslations("home");
  return home.has(`lesson.${code}`) ? home(`lesson.${code}`) : null;
}

/** "Because of 09:40" from the event's real time; a neutral line when the event time is not known. */
export function useBecause(eventAt: string | null): string {
  const t = useTranslations("training");
  const format = useFormatter();
  return eventAt ? t("because", { time: format.dateTime(new Date(eventAt), "time") }) : t("becauseUnknown");
}

/** The one action for an item: Practise for a replay, Start lesson for a lesson. Full width on request. */
export function ItemAction({ item, primary, block }: { item: TrainingItem; primary: boolean; block?: boolean }) {
  const t = useTranslations("training");
  const cards = useLessonCards(item.kind === "lesson" ? item.lessonCode : null);
  if (item.kind === "replay") {
    return (
      <Button block={block} variant={primary && item.status === "todo" ? "primary" : "secondary"} href={`/op/training/replay/${item.replayId}`} prefetch={false}>
        {item.status === "done" ? t("practiseAgain") : t("practise")}
      </Button>
    );
  }
  const label = item.status === "done" ? t("lessonAgain") : cards != null ? t("lessonStart", { n: cards }) : t("lessonStartPlain");
  return (
    <Button block={block} variant={primary && item.status === "todo" ? "primary" : "secondary"} href={`/op/training/lesson/${item.lessonCode}`} prefetch={false}>
      {label}
    </Button>
  );
}
