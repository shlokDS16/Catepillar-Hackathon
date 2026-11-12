"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ItemAction, useBecause, useLessonTitle } from "@/components/training/training-bits";
import { Plate } from "@/components/ui/plate";
import type { RecurrenceHint } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import { currentTask } from "@/hero/work-state";
import { lastLessonDone, nextItem, trainingItems, type TrainingItem } from "@/training/assignments";
import { idleMsSince, showWhileYouWait } from "@/components/home/while-you-wait";

/**
 * S1 L4, the end of the loop: my next assignment as a full-width Practise (primary) over a
 * full-width Lesson button, and once a lesson is done the recurrence hint
 * ("Seatbelt: 0 repeats in 7 days", marked SIMULATED). Nothing is shown when nothing is assigned
 * and nothing is done.
 */
export function LoopCard() {
  const snapshot = useAppState((s) => s.snapshot);
  const assignments = useAppState((s) => s.assignments);
  const progress = useAppState((s) => s.training);
  const times = useAppState((s) => s.eventTimes);
  const tasks = useAppState((s) => s.tasks);
  const machine = useAppState((s) => s.machine);
  const simNow = useAppState((s) => s.clock?.sim_now ?? null);
  const status = currentTask(tasks)?.status ?? null;
  const parked = (status === "paused" || status === "blocked_ppe") && machine?.moving === false;
  // Sim time at which this idle spell was first seen; cleared the moment the machine moves or the task resumes.
  const [idleSince, setIdleSince] = useState<number | null>(null);
  const nowMs = simNow ? Date.parse(simNow) : Number.NaN;
  if (parked && idleSince === null && !Number.isNaN(nowMs)) setIdleSince(nowMs);
  else if (!parked && idleSince !== null) setIdleSince(null);
  if (!snapshot) return null;
  const items = trainingItems(assignments, progress, times);
  const next = nextItem(items);
  // The lesson of the same assignment, offered beside Practise while it is still open.
  const lesson = next?.kind === "replay" ? (items.find((i) => i.kind === "lesson" && i.assignmentId === next.assignmentId && i.status === "todo") ?? null) : null;
  const doneCode = lastLessonDone(assignments, progress);
  const waiting = showWhileYouWait({
    taskStatus: status,
    moving: machine ? machine.moving : null,
    hasAssignment: next !== null,
    idleMs: parked ? idleMsSince(idleSince, simNow) : null,
  });
  return (
    <>
      {next && waiting ? <WaitCard item={lesson ?? next} /> : next ? <NextCard item={next} lesson={lesson} /> : null}
      {doneCode ? <RecurrenceCard code={doneCode} /> : null}
    </>
  );
}

function NextCard({ item, lesson }: { item: TrainingItem; lesson: TrainingItem | null }) {
  const t = useTranslations("home");
  const title = useLessonTitle(item.lessonCode);
  const because = useBecause(item.eventAt);
  return (
    <section className="loop" aria-label={t("loopTitle")}>
      <p className="t-caption sec-label">{t("secLoop")}</p>
      <Plate className="flex flex-col gap-3">
        <p className="t-caption sec-because tnum">{because}</p>
        {title ? <p className="t-title">{title}</p> : null}
        <ItemAction item={item} primary block />
        {lesson ? <ItemAction item={lesson} primary={false} block /> : null}
      </Plate>
    </section>
  );
}

/** The paused-and-parked variant: one lesson to do while nothing moves. It leaves the moment the machine moves. */
function WaitCard({ item }: { item: TrainingItem }) {
  const t = useTranslations("wait");
  const title = useLessonTitle(item.lessonCode);
  return (
    <section className="loop wait" aria-label={t("title")}>
      <p className="t-caption sec-label">{t("title")}</p>
      <Plate className="flex flex-col gap-3">
        <p className="t-caption sec-because">{t("why")}</p>
        {title ? <p className="t-title">{title}</p> : null}
        <ItemAction item={item} primary block />
        <p className="t-caption text-ink-2 wait-stops">{t("stops")}</p>
      </Plate>
    </section>
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
      <p className="t-caption sec-because">
        {t("recurrenceTitle")}
        {hint.simulated ? <> · <span className="sim-tag">{t("recurrenceSim")}</span></> : null}
      </p>
      <p className="t-title tnum">{t("recurrence", { topic, n: hint.repeats, days: hint.days })}</p>
    </Plate>
  );
}
