"use client";

import { useTranslations } from "next-intl";
import { GuideEntry } from "@/components/training/guide-entry";
import { ItemAction, useBecause, useLessonTitle } from "@/components/training/training-bits";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Plate } from "@/components/ui/plate";
import { useAppState } from "@/data/store";
import { nextItem, OPEN_LESSONS, trainingItems, type TrainingItem } from "@/training/assignments";

/**
 * S5a Training: my assignments (replays and lessons, open first), the done scores, and the way
 * into "How practice works". With nothing assigned: "Nothing assigned. Well done." and the lessons
 * that can be opened freely.
 */
export function TrainingScreen() {
  const t = useTranslations("training");
  const snapshot = useAppState((s) => s.snapshot);
  const assignments = useAppState((s) => s.assignments);
  const progress = useAppState((s) => s.training);

  if (!snapshot) {
    return (
      <div className="training">
        <Plate loading className="min-h-hit-sos" />
        <Plate loading className="min-h-hit" />
      </div>
    );
  }

  const items = trainingItems(assignments, progress, snapshot.recent_events);
  const next = nextItem(items);

  return (
    <div className="training">
      {items.length > 0 ? (
        <section className="tr-section" aria-labelledby="tr-assigned">
          <h2 id="tr-assigned" className="t-title">
            {t("assignedTitle")}
          </h2>
          <ul className="tr-list" aria-label={t("listLabel")}>
            {items.map((item) => (
              <li key={item.key}>
                <AssignmentRow item={item} primary={item.key === next?.key} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="tr-section" aria-labelledby="tr-empty">
          <Plate rule="heavy" className="tr-empty">
            <h2 id="tr-empty" className="t-title">
              {t("emptyTitle")}
            </h2>
          </Plate>
          <h3 className="t-label text-ink-2">{t("openLessonsTitle")}</h3>
          <ul className="tr-list">
            {OPEN_LESSONS.map((code) => (
              <li key={code}>
                <OpenLessonRow code={code} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <GuideEntry />
    </div>
  );
}

function AssignmentRow({ item, primary }: { item: TrainingItem; primary: boolean }) {
  const t = useTranslations("training");
  const title = useLessonTitle(item.lessonCode);
  const because = useBecause(item.eventAt);
  const done = item.status === "done";
  return (
    <Plate as="article" className="tr-row" data-status={item.status} aria-label={title ? t(item.kind === "replay" ? "replayTitle" : "lessonTitle", { title }) : undefined}>
      <div className="tr-row-top">
        <Chip tone="outline" word>
          {t(`kind.${item.kind}`)}
        </Chip>
        <Chip tone={done ? "ink" : "outline"} word>
          {t(`status.${item.status}`)}
        </Chip>
      </div>
      {title ? <p className="t-title">{title}</p> : null}
      <p className="t-meta text-ink-2 tnum">{because}</p>
      {done && item.kind === "replay" && item.scores ? (
        <p className="t-label tnum">{t("scores", item.scores)}</p>
      ) : null}
      {done && item.kind === "lesson" && item.quizScore != null ? <p className="t-label tnum">{t("quiz", { n: item.quizScore })}</p> : null}
      <div className="tr-row-action">
        <ItemAction item={item} primary={primary} />
      </div>
    </Plate>
  );
}

function OpenLessonRow({ code }: { code: string }) {
  const t = useTranslations("training");
  const title = useLessonTitle(code);
  return (
    <Plate as="article" className="tr-row">
      <Chip tone="outline" word>
        {t("kind.lesson")}
      </Chip>
      {title ? <p className="t-title">{title}</p> : null}
      <div className="tr-row-action">
        <Button href={`/op/training/lesson/${code}`} prefetch={false}>
          {t("lessonStartPlain")}
        </Button>
      </div>
    </Plate>
  );
}
