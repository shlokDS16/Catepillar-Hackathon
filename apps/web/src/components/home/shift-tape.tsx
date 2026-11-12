"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useLessonTitle } from "@/components/training/training-bits";
import { Pictogram } from "@/components/ui/pictogram";
import { useAppState } from "@/data/store";
import { buildShiftSegments, tapePct, type SegmentKind, type ShiftMark } from "@/home/shift-segments";

const KEY: SegmentKind[] = ["working", "waiting", "break", "planned"];

/**
 * The shift tape: Working (solid ink), Waiting (dotted), Break (blank), Planned (hatched) across the
 * shift, a now-line that steps once per sim minute (no tween), and marks for events with a replay
 * (linked to Replay) and the forecast heat peak. The marks above the tape are labels; the rows under it
 * are the targets (80 px on phones), so nothing depends on hitting a small pin.
 */
export function ShiftTape() {
  const t = useTranslations("home.tape");
  const format = useFormatter();
  const tasks = useAppState((s) => s.tasks);
  const taskWork = useAppState((s) => s.taskWork);
  const alerts = useAppState((s) => s.alerts);
  const assignments = useAppState((s) => s.assignments);
  const eventTimes = useAppState((s) => s.eventTimes);
  const clock = useAppState((s) => s.clock);
  const weather = useAppState((s) => s.snapshot?.weather ?? null);
  if (!clock || tasks.length === 0) return null;

  const tape = buildShiftSegments({ tasks, taskWork, alerts, assignments, eventTimes, weather }, clock.sim_now);
  const time = (ms: number) => format.dateTime(new Date(ms), "time");
  const pct = (ms: number) => tapePct(tape, ms);
  const edge = (ms: number) => (pct(ms) < 14 ? "start" : pct(ms) > 86 ? "end" : undefined);
  const summary = tape.segments.map((s) => `${t(s.kind)} ${time(s.startMs)} - ${time(s.endMs)}`).join("; ");

  return (
    <section className="tape" aria-label={t("title")}>
      <h2 className="t-title">{t("title")}</h2>
      <div className="tape-track">
        {tape.marks.map((m) => (
          <Pin key={m.id} mark={m} time={time(m.atMs)} edge={edge(m.atMs)} left={pct(m.atMs)} />
        ))}
        <div className="tape-lane" role="img" aria-label={`${t("range", { from: time(tape.startMs), to: time(tape.endMs) })}. ${summary}`}>
          {tape.segments.map((s, i) => (
            <i key={`${s.kind}-${i}`} className="tape-seg" data-kind={s.kind} style={{ insetInlineStart: `${pct(s.startMs)}%`, width: `${pct(s.endMs) - pct(s.startMs)}%` }} />
          ))}
        </div>
        <div className="tape-hours" aria-hidden="true">
          {tape.hours.map((h) => (
            <span key={h} className="tnum" style={{ insetInlineStart: `${pct(h)}%` }}>
              {time(h)}
            </span>
          ))}
        </div>
        <span className="tape-now" data-edge={edge(tape.nowMs)} style={{ insetInlineStart: `${pct(tape.nowMs)}%` }}>
          <span className="tnum">{t("now", { time: time(tape.nowMs) })}</span>
        </span>
      </div>
      <ul className="tape-key t-caption" aria-hidden="true">
        {KEY.map((k) => (
          <li key={k}>
            <i data-kind={k} />
            {t(k)}
          </li>
        ))}
      </ul>
      {tape.marks.length > 0 ? (
        <ul className="tape-rows" aria-label={t("marksTitle")}>
          {tape.marks.map((m) => (
            <li key={m.id}>
              <Row mark={m} time={time(m.atMs)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** An event is named by its own assignment's lesson title; with no assignment it is a plain "Safety event". */
function useMarkName(mark: ShiftMark): string {
  const t = useTranslations("home.tape");
  const title = useLessonTitle(mark.lessonCode ?? "");
  return title ?? t("event");
}

function Pin({ mark, time, edge, left }: { mark: ShiftMark; time: string; edge: string | undefined; left: number }) {
  const t = useTranslations("home.tape");
  const name = useMarkName(mark);
  return (
    <span className="tape-pin t-caption" data-kind={mark.kind} data-edge={edge} style={{ insetInlineStart: `${left}%` }} aria-hidden="true">
      <Pictogram name={mark.kind === "heat" ? "heat" : "seatbelt"} />
      {mark.kind === "heat" ? t("pinHeat", { time }) : `${name} ${time}`}
    </span>
  );
}

function Row({ mark, time }: { mark: ShiftMark; time: string }) {
  const t = useTranslations("home.tape");
  const name = useMarkName(mark);
  const label = mark.kind === "heat" ? t("heat", { time }) : `${name}, ${time}${mark.href ? `. ${t("openReplay")}` : ""}`;
  const picto = mark.kind === "heat" ? "heat" : "seatbelt";
  return mark.href ? (
    <Link href={mark.href} prefetch={false} className="tape-row t-body">
      <Pictogram name={picto} />
      {label}
    </Link>
  ) : (
    <div className="tape-row t-body" data-static="true">
      <Pictogram name={picto} />
      {label}
    </div>
  );
}
