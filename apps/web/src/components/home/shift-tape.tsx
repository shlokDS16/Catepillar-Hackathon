"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Pictogram } from "@/components/ui/pictogram";
import { useAppState } from "@/data/store";
import { buildShiftSegments, tapePct, type SegmentKind } from "@/home/shift-segments";

const KEY: SegmentKind[] = ["working", "waiting", "break", "planned"];

/**
 * The shift tape: Working (solid ink), Waiting (dotted), Break (blank), Planned (hatched) across the
 * shift, a now-line that steps once per sim minute (no tween), and marks for breaches (linked to Replay)
 * and the forecast heat peak. The marks above the tape are labels; the rows under it are the targets
 * (80 px on phones), so nothing depends on hitting a small pin.
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

  return (
    <section className="tape" aria-label={t("title")}>
      <h2 className="t-title">{t("title")}</h2>
      <div className="tape-track">
        {tape.marks.map((m) => (
          <span key={m.id} className="tape-pin t-caption" data-kind={m.kind} data-edge={pct(m.atMs) < 14 ? "start" : pct(m.atMs) > 86 ? "end" : undefined} style={{ insetInlineStart: `${pct(m.atMs)}%` }} aria-hidden="true">
            <Pictogram name={m.kind === "heat" ? "heat" : "seatbelt"} />
            {t(m.kind === "heat" ? "pinHeat" : "pinBreach", { time: time(m.atMs) })}
          </span>
        ))}
        <div className="tape-lane" role="img" aria-label={t("range", { from: time(tape.startMs), to: time(tape.endMs) })}>
          {tape.segments.map((s, i) => (
            <i
              key={`${s.kind}-${i}`}
              className="tape-seg"
              data-kind={s.kind}
              style={{ insetInlineStart: `${pct(s.startMs)}%`, width: `${pct(s.endMs) - pct(s.startMs)}%` }}
              title={t(s.kind)}
            />
          ))}
        </div>
        <span className="tape-now" style={{ insetInlineStart: `${pct(tape.nowMs)}%` }}>
          <span className="tnum">{t("now", { time: time(tape.nowMs) })}</span>
        </span>
        <div className="tape-hours" aria-hidden="true">
          {tape.hours.map((h) => (
            <span key={h} className="tnum" style={{ insetInlineStart: `${pct(h)}%` }}>
              {time(h)}
            </span>
          ))}
        </div>
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
          {tape.marks.map((m) => {
            const label = m.kind === "heat" ? t("heat", { time: time(m.atMs) }) : m.href ? t("breachOpen", { time: time(m.atMs) }) : t("breach", { time: time(m.atMs) });
            return (
              <li key={m.id}>
                {m.href ? (
                  <Link href={m.href} prefetch={false} className="tape-row t-body">
                    <Pictogram name="seatbelt" />
                    {label}
                  </Link>
                ) : (
                  <div className="tape-row t-body" data-static="true">
                    <Pictogram name={m.kind === "heat" ? "heat" : "seatbelt"} />
                    {label}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
