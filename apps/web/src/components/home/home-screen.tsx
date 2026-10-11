"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSafetyState } from "@/alerts/use-safety-state";
import { HeroCard } from "@/components/hero/hero-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { ProvenanceChip, ProvenanceLine } from "@/components/ui/provenance";
import { useMode } from "@/data/mode";
import { useAppState, useDataPort } from "@/data/store";
import { currentTask } from "@/hero/work-state";

/**
 * S1 Home: hero (L1-L3), conditions row (L3), loop card (L4), today's tasks (L2-L3), Simple/Detailed (L6).
 * From 1024 px the hero sits left and the rest right.
 */
export function HomeScreen() {
  const t = useTranslations();
  const format = useFormatter();
  const { mode, setMode, persistFailed } = useMode();
  const snapshot = useAppState((s) => s.snapshot);
  const machine = useAppState((s) => s.machine);
  const tasks = useAppState((s) => s.tasks);
  const assignments = useAppState((s) => s.assignments);
  const port = useDataPort();
  const { safety, topAlert } = useSafetyState();
  const weather = snapshot?.weather ?? null;
  const detailed = mode === "detailed";
  const current = currentTask(tasks);

  // The lesson's card count comes from its content, not a hardcoded number (F06-F08 review 15).
  const loop = assignments.find((a) => a.replay_id) ?? assignments[0];
  const lessonCode = loop?.lesson_code ?? null;
  const [lessonCards, setLessonCards] = useState<number | null>(null);
  useEffect(() => {
    if (!lessonCode) return;
    let live = true;
    void port
      .lessonGet(lessonCode)
      .then((lesson) => {
        if (live) setLessonCards(lesson.cards.length);
      })
      .catch(() => {
        if (live) setLessonCards(null);
      });
    return () => {
      live = false;
    };
  }, [port, lessonCode]);

  if (!snapshot) {
    return (
      <div className="home">
        <Plate loading className="hero-slot" />
        <Plate loading className="min-h-hit" />
        <Plate loading className="min-h-hit" />
      </div>
    );
  }

  const etaImpact = current?.eta_factors?.find((f) => f.key.startsWith("heat:") || f.key.startsWith("weather:"));

  return (
    <div className="home">
      <div className="hero-slot">
        <HeroCard machine={machine} tasks={tasks} safety={safety} topAlert={topAlert} />
      </div>

      <div className="home-rest">
        {weather ? (
          <Plate as="section" className="flex flex-wrap items-center gap-4" aria-label={t("home.conditions")}>
            <Pictogram name="heat" />
            {weather.wbgt_c != null ? (
              <span className="t-label tnum">{t("home.wbgt", { c: format.number(weather.wbgt_c, { maximumFractionDigits: 0 }) })}</span>
            ) : (
              <span className="t-label tnum">{t("home.temp", { c: format.number(weather.temperature_c, { maximumFractionDigits: 0 }) })}</span>
            )}
            {detailed && weather.forecast_peak_c != null && weather.forecast_peak_at ? (
              <span className="t-meta text-ink-2 tnum">
                {t("home.forecast", { c: format.number(weather.forecast_peak_c, { maximumFractionDigits: 0 }), time: format.dateTime(new Date(weather.forecast_peak_at), "time") })}
              </span>
            ) : null}
            {detailed && etaImpact ? (
              <span className="t-meta text-ink-2 tnum">{t("home.etaImpact", { pct: Math.round((etaImpact.multiplier - 1) * 100) })}</span>
            ) : null}
            {detailed ? <span className="t-meta text-ink-3">{weather.source_label}</span> : null}
          </Plate>
        ) : null}

        {loop ? (
          <Plate as="section" rule="heavy" className="flex flex-col gap-3" aria-label={t("home.loopTitle")}>
            <p className="t-label text-ink-2">{t("home.becauseToday")}</p>
            <p className="t-title">{t(`home.lesson.${loop.lesson_code}`)}</p>
            <div className="flex flex-wrap items-center gap-6">
              {loop.replay_id ? (
                <Button variant="primary" href={`/op/training/replay/${loop.replay_id}`}>
                  {t("home.practise")}
                </Button>
              ) : null}
              <Link href={`/op/training/lesson/${loop.lesson_code}`} className="t-label underline underline-offset-4">
                {lessonCards != null ? t("home.lessonCards", { n: lessonCards }) : t("home.lessonLink")}
              </Link>
            </div>
          </Plate>
        ) : null}

        <section aria-label={t("home.todaysTasks")} className="flex flex-col gap-2">
          <h2 className="t-title">{t("home.todaysTasks")}</h2>
          {tasks.length === 0 ? (
            <p className="t-body text-ink-2">{t("home.noTasks")}</p>
          ) : (
            <ul className="list-none p-0 m-0 flex flex-col">
              {tasks.map((task) => (
                <li key={task.id} className="task-row" data-current={task.id === current?.id || undefined}>
                  <span className="t-label tnum">{format.dateTime(new Date(task.planned_start), "time")}</span>
                  <span className="t-body">{t(`enums.task.${task.task_type}`)}</span>
                  <Chip tone={task.status === "in_progress" ? "ink" : task.status === "blocked_ppe" ? "caution" : "outline"} word>
                    {t(`enums.taskStatus.${task.status}`)}
                  </Chip>
                  <span className="t-meta text-ink-2 tnum">
                    {task.eta_p50_min == null
                      ? ""
                      : detailed && task.eta_p90_min != null
                        ? t("hero.etaRange", { min: Math.round(task.eta_p50_min), max: Math.round(task.eta_p90_min) })
                        : t("hero.etaMin", { min: Math.round(task.eta_p50_min) })}
                  </span>
                  <ProvenanceChip table="tasks" field="planned_start" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <ProvenanceLine fields={[["machine_state", "speed_kmh"], ["tasks", "planned_start"], ["operator_state", "ppe"]]} />

        <div className="flex items-center gap-4" role="group" aria-label={t("home.modeLabel")}>
          <Chip tone={mode === "simple" ? "ink" : "outline"} aria-pressed={mode === "simple"} onClick={() => setMode("simple")}>
            {t("home.simple")}
          </Chip>
          <Chip tone={mode === "detailed" ? "ink" : "outline"} aria-pressed={mode === "detailed"} onClick={() => setMode("detailed")}>
            {t("home.detailed")}
          </Chip>
          {persistFailed ? <span className="t-meta text-ink-3">{t("home.modeNotSaved")}</span> : null}
        </div>
      </div>
    </div>
  );
}
