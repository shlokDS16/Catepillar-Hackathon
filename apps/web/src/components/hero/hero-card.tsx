"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { Pictogram, Mark } from "@/components/ui/pictogram";
import { ProvenanceChip } from "@/components/ui/provenance";
import type { Machine, Task } from "@/data/types";
import { useMode } from "@/data/mode";
import { useTweenNumber } from "@/hero/use-tween";
import { currentTask, nextPlanned, workState } from "@/hero/work-state";
import { safetyTone, type SafetyState } from "@/alerts/selectors";
import { KIND_PICTO } from "@/alerts/kinds";
import type { AlertRecord } from "@/data/types";

export type HeroCardProps = {
  machine: Machine | null;
  tasks: readonly Task[];
  safety: SafetyState;
  /** The alert behind the safety field, for its pictogram. */
  topAlert?: AlertRecord;
  /** Offline: the cached snapshot's time; the rules go dashed. */
  asOf?: string | null;
  /** Error: the last values stay, with "Not updated". */
  notUpdated?: boolean;
  /** Full-screen variant inside the motion lock: no link, larger figures. */
  lock?: boolean;
};

const SAFETY_PICTO = { clear: "seatbelt", nosignal: "sos" } as const;

/**
 * The signature: same shape and position on Home at every breakpoint; the motion-lock view is this
 * card at full screen. Only values and colours change. Safety colour swaps at 0 ms; figures tween.
 */
export function HeroCard({ machine, tasks, safety, topAlert, asOf, notUpdated, lock }: HeroCardProps) {
  const t = useTranslations();
  const format = useFormatter();
  const { mode } = useMode();
  const task = currentTask(tasks);
  const next = nextPlanned(tasks, task);
  const state = workState(machine, task);
  const progress = useTweenNumber(task?.progress_pct ?? 0);
  const eta50 = useTweenNumber(task?.eta_p50_min ?? 0);
  const eta90 = useTweenNumber(task?.eta_p90_min ?? 0);
  const detailed = mode === "detailed";
  const factors = (task?.eta_factors ?? []).slice(0, 2);
  const pictoName = topAlert ? KIND_PICTO[topAlert.kind] : safety === "nosignal" ? SAFETY_PICTO.nosignal : SAFETY_PICTO.clear;

  const body = (
    <article className="hero" data-dashed={asOf ? "true" : undefined} data-lock={lock || undefined} aria-label={t("nav.home")}>
      <header className="hero-head">
        <p className="t-label text-ink-2">
          {machine ? `${machine.code} · ${machine.model_name ?? ""}`.trim() : "—"}
          {detailed && machine?.moving ? (
            <>
              {" · "}
              {t("hero.moving", { speed: format.number(machine.speed_kmh, { maximumFractionDigits: 0 }) })} <ProvenanceChip table="machine_state" field="speed_kmh" />
            </>
          ) : null}
        </p>
        <p className="t-state hero-state">{t(`enums.work.${state}`)}</p>
      </header>

      <div className="hero-task">
        {task ? (
          <>
            <p className="t-title">{t(`enums.task.${task.task_type}`)}</p>
            <div className="flex items-baseline gap-3">
              <span className="t-figure tnum">{Math.round(progress)}&nbsp;%</span>
            </div>
            <div className="bar" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={t("hero.progress", { pct: Math.round(progress) })}>
              <div className="bar-fill" style={{ width: `${progress}%` }} />
              <div className="bar-ticks" />
            </div>
          </>
        ) : (
          <p className="t-title">
            {t("hero.noTask")}
            {next ? ` · ${t("hero.nextTask", { task: t(`enums.task.${next.task_type}`), time: format.dateTime(new Date(next.planned_start), "time") })}` : ""}
          </p>
        )}
      </div>

      <div className="hero-foot">
        <div className="hero-eta">
          <p className="t-label text-ink-2">{t("hero.eta")}</p>
          <p className="t-figure tnum">{task?.eta_p50_min != null ? t("hero.etaMin", { min: Math.round(eta50) }) : "—"}</p>
          {task?.eta_p90_min != null ? <p className="t-meta text-ink-2 tnum">{t("hero.etaUpTo", { min: Math.round(eta90) })}</p> : null}
        </div>
        <div className="hero-safety">
          <Chip tone={safetyTone(safety)} word icon={<Pictogram name={pictoName} />} count={topAlert?.occurrences} className="hero-safety-chip">
            {t(`enums.safety.${safety}`)}
          </Chip>
        </div>
      </div>

      {detailed && factors.length > 0 ? (
        <p className="hero-why t-meta text-ink-2">
          {t("hero.why", {
            factors: factors
              .map((f) => `${factorLabel(f.key, t)} ${f.multiplier >= 1 ? "+" : "−"}${Math.round(Math.abs(f.multiplier - 1) * 100)} %${f.assumed ? ` (${t("enums.factor.assumed")})` : ""}`)
              .join(" · "),
          })}
          {!lock ? <span aria-hidden="true"> ›</span> : null}
        </p>
      ) : null}

      {asOf ? <p className="t-meta text-ink-3">{t("hero.asOf", { time: asOf })}</p> : null}
      {notUpdated ? (
        <p className="t-meta text-ink-3 flex items-center gap-2">
          <Mark kind="cross" /> {t("hero.notUpdated")}
        </p>
      ) : null}
    </article>
  );

  if (lock) return body;
  return (
    <Link href="/op/task" className="hero-link" aria-label={t("hero.openTask")}>
      {body}
    </Link>
  );
}

/** "heat:high" → "heat"; "skill:novice" → "novice"; unknown keys fall back to the raw key. */
function factorLabel(key: string, t: ReturnType<typeof useTranslations>): string {
  const [group, value] = key.split(":");
  if (group === "skill" && value) return t.has(`enums.factor.${value}`) ? t(`enums.factor.${value}`) : value;
  const name = group === "age" ? "machine_age" : group === "circadian" ? "shift_hour" : group;
  return t.has(`enums.factor.${name}`) ? t(`enums.factor.${name}`) : key;
}
