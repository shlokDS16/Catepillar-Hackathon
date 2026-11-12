"use client";

import { useTranslations } from "next-intl";
import { GuideEntry } from "@/components/training/guide-entry";
import { ItemAction, useBecause, useLessonTitle } from "@/components/training/training-bits";
import { Button } from "@/components/ui/button";
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
  const times = useAppState((s) => s.eventTimes);

  if (!snapshot) {
    return (
      <div className="training">
        <Plate loading className="min-h-hit-sos" />
        <Plate loading className="min-h-hit" />
      </div>
    );
  }

  const items = trainingItems(assignments, progress, times);
  const next = nextItem(items);
  const anyDone = items.some((i) => i.status === "done");

  return (
    <div className="training">
      {items.length > 0 ? (
        <section className="tr-section" aria-labelledby="tr-assigned">
          <h2 id="tr-assigned" className="t-caption sec-label">
            {t("secAssigned")}
          </h2>
          <ul className="tr-list" aria-label={t("listLabel")}>
            {items.map((item) => (
              <li key={item.key}>
                <AssignmentRow item={item} primary={item.key === next?.key} />
              </li>
            ))}
          </ul>
          {anyDone ? <p className="t-meta text-ink-3">{t("doneNote")}</p> : null}
        </section>
      ) : (
        <section className="tr-section" aria-labelledby="tr-empty">
          <Plate className="tr-empty">
            <h2 id="tr-empty" className="t-title">
              {t("emptyTitle")}
            </h2>
          </Plate>
          <h3 className="t-caption sec-label">{t("secOpen")}</h3>
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
      <p className="t-caption sec-because">
        {t(`kind.${item.kind}`)} · <span className="tr-status" data-status={item.status}>{t(`status.${item.status}`)}</span>
      </p>
      {title ? <p className="t-title">{title}</p> : null}
      <p className="t-caption sec-because tnum">{because}</p>
      {done && item.kind === "replay" && item.scores ? <p className="t-label tnum">{t("scores", item.scores)}</p> : null}
      {done && item.kind === "lesson" && item.quizScore != null ? <p className="t-label tnum">{t("quiz", { n: item.quizScore })}</p> : null}
      <div className="tr-row-action">
        <ItemAction item={item} primary={primary} block />
      </div>
    </Plate>
  );
}

function OpenLessonRow({ code }: { code: string }) {
  const t = useTranslations("training");
  const title = useLessonTitle(code);
  return (
    <Plate as="article" className="tr-row">
      <p className="t-caption sec-because">{t("kind.lesson")}</p>
      {title ? <p className="t-title">{title}</p> : null}
      <div className="tr-row-action">
        <Button block href={`/op/training/lesson/${code}`} prefetch={false}>
          {t("lessonStartPlain")}
        </Button>
      </div>
    </Plate>
  );
}
