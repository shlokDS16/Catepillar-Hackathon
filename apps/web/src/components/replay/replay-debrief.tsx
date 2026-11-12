"use client";

import { useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useAudio } from "@/audio/use-audio";
import { localText } from "@/components/alerts/alert-takeover";
import { RAIL_PHASES } from "@/components/replay/phase-rail";
import { ReenactmentPlayer } from "@/components/replay/reenactment-player";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import type { I18nText, Lang } from "@/data/types";
import { reviewRows, sectionClipId, traceRows, type TraceChip } from "@/replay/debrief";
import { useCountUp, useReducedMotion } from "@/replay/use-reenactment";
import type { ReplayDebriefResult, ReplayScenario } from "@cat/shared";

type Props = {
  result: ReplayDebriefResult;
  scenario: ReplayScenario;
  /** A live alert froze the run: the re-enactment stops until [Resume]. */
  paused: boolean;
  onPractiseAgain: () => void;
};

/** The count-up never takes longer than --dur-count (visual-language §5.1). */
const COUNT_MS = 1200;

/**
 * Phase 4 Debrief (S5b, T8-T10), untimed, direction B "Ink Frame" (D14). The re-enactment plays on an
 * ink theatre (the one dark work surface, visual-language §5.1); everything after it is ink on paper
 * under numbered mono section rules. Order: what happened, how you did, your path, your decisions,
 * the one rule, next. The rule is pinned last so it is the final thing read. Every section has a
 * [Listen] that shows only when its clip exists (never faked). Correct and wrong are ink (filled
 * tick, outlined cross), never green or red.
 */
export function ReplayDebrief({ result, scenario, paused, onPractiseAgain }: Props) {
  const t = useTranslations("replay.debrief");
  const lang = useLocale() as Lang;
  const title = localText(scenario.summary, lang);
  const clip = (section: string) => sectionClipId(section);
  const review = useMemo(() => reviewRows(result, scenario), [result, scenario]);
  const rightCount = review.filter((r) => r.correct).length;

  return (
    <div className="deb">
      <section className="deb-stage" aria-labelledby="deb-what">
        <StageFrame scenario={scenario} />
        <SectionHead id="deb-what" n="01" title={t("what")} audioId={clip("what")} />
        <p className="deb-headline" lang={title.english ? "en" : undefined}>
          {title.value}
        </p>
        <ReenactmentPlayer scenario={scenario} paused={paused} />
      </section>

      <section className="deb-section deb-s-scores" aria-labelledby="deb-scores">
        <SectionHead id="deb-scores" n="02" title={t("scores")} hint={t("forLearning")} audioId={clip("scores")} />
        <Scores scores={result.scores} />
      </section>

      <section className="deb-section deb-s-path" aria-labelledby="deb-trace">
        <SectionHead id="deb-trace" n="03" title={t("trace")} hint={t("vsSafest")} audioId={clip("path")} />
        <Trace result={result} scenario={scenario} />
      </section>

      <section className="deb-section deb-s-decisions" aria-labelledby="deb-decisions">
        <SectionHead
          id="deb-decisions"
          n="04"
          title={t("decisions")}
          hint={t("rightCount", { n: rightCount, total: review.length })}
          audioId={clip("decisions")}
        />
        <Decisions result={result} scenario={scenario} />
      </section>

      <Rule result={result} scenario={scenario} />

      <Next lessonCode={result.lesson_code} onPractiseAgain={onPractiseAgain} />
    </div>
  );
}

/** Inside the theatre: "REPLAY · your event 09:40" and the four phase segments (this is phase 4 of 4). */
function StageFrame({ scenario }: { scenario: ReplayScenario }) {
  const t = useTranslations("replay");
  const td = useTranslations("replay.debrief");
  const format = useFormatter();
  const time = format.dateTime(new Date(scenario.occurred_sim_ts), "time");
  const last = RAIL_PHASES.length - 1;
  return (
    <div className="deb-frame">
      <p className="t-caption deb-frame-row">
        <span>{t("frame", { time })}</span>
        <span>{td("simulated")}</span>
      </p>
      <ol className="deb-segs" role="list" aria-label={t("phasesLabel", { n: RAIL_PHASES.length, total: RAIL_PHASES.length })}>
        {RAIL_PHASES.map((p, i) => (
          <li key={p} data-state={i === last ? "current" : "done"} aria-current={i === last ? "step" : undefined}>
            <span className="sr-only">{t(`phase.${p}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** [Listen] for one Debrief section. Hidden when the clip is missing: never a button that does nothing. */
function SectionListen({ audioId, label }: { audioId: string | null; label: string }) {
  const tr = useTranslations("replay");
  const audio = useAudio(audioId);
  if (!audio.available) return null;
  return (
    <Button
      size="dense"
      className="deb-listen"
      onClick={audio.play}
      aria-label={`${tr("listen")}: ${label}`}
      note={audio.blocked ? tr("soundBlocked") : undefined}
    >
      {tr("listen")}
    </Button>
  );
}

/** The numbered mono section label ("02 — How you did"), a right-aligned hint, and [Listen]. */
function SectionHead({
  id,
  n,
  title,
  hint,
  audioId,
}: {
  id: string;
  n: string;
  title: string;
  hint?: string;
  audioId: string | null;
}) {
  return (
    <div className="deb-lbl">
      <h2 id={id} className="t-caption deb-lbl-text">
        <span className="deb-lbl-n">{n} —</span> {title}
      </h2>
      {hint ? <span className="t-caption deb-lbl-hint">{hint}</span> : null}
      <SectionListen audioId={audioId} label={title} />
    </div>
  );
}

function Scores({ scores }: { scores: ReplayDebriefResult["scores"] }) {
  const t = useTranslations("replay.debrief");
  const reduced = useReducedMotion();
  const rows = [
    { key: "safety", v: scores.safety },
    { key: "procedure", v: scores.procedure },
    { key: "efficiency", v: scores.efficiency },
  ] as const;
  return (
    <ul className="deb-scores">
      {rows.map((r) => (
        <ScoreRow key={r.key} label={t(`score.${r.key}`)} value={r.v} animate={!reduced} />
      ))}
    </ul>
  );
}

function ScoreRow({ label, value, animate }: { label: string; value: number; animate: boolean }) {
  const t = useTranslations("replay.debrief");
  const shown = useCountUp(value, COUNT_MS, animate);
  return (
    <li className="deb-score">
      <span className="t-caption">{label}</span>
      <span className="deb-score-figure" aria-hidden="true">
        <span className="t-figure">{Math.round(shown)}</span>
        <span className="t-meta text-ink-2">{t("outOf")}</span>
      </span>
      <span className="replay-announce">{t("scoreSpoken", { label, v: Math.round(value) })}</span>
      <span className="deb-bar" role="presentation">
        <span className="deb-bar-fill" style={{ width: `${Math.min(100, Math.max(0, shown))}%` }} />
      </span>
    </li>
  );
}

function Trace({ result, scenario }: { result: ReplayDebriefResult; scenario: ReplayScenario }) {
  const t = useTranslations("replay.debrief");
  const lang = useLocale() as Lang;
  const traced = useMemo(() => traceRows(result), [result]);
  // The mockup's shape: "You" holds what was opened; "Safest" holds the ideal path, with the cards
  // you never opened shown dashed there ("missed"). Empty "You" slots keep the two rows aligned.
  const rows = useMemo(() => {
    const you = traced.you.filter((c) => c.kind !== "missed");
    const missed = traced.you.filter((c) => c.kind === "missed");
    const ideal = traced.ideal.map((c) => missed.find((m) => m.id === c.id) ?? c);
    const extra = missed.filter((m) => !traced.ideal.some((c) => c.id === m.id));
    return { you, ideal: [...ideal, ...extra] };
  }, [traced]);
  const [open, setOpen] = useState<{ row: "you" | "ideal"; id: string } | null>(null);

  const titleOf = (id: string) => {
    const card = scenario.investigate.cards.find((c) => c.id === id);
    return card ? localText(card.title, lang).value : id;
  };
  const picked = open ? rows[open.row].find((c) => c.id === open.id) : null;

  const cell = (row: "you" | "ideal", c: TraceChip, i: number) => {
    const selected = open?.row === row && open.id === c.id;
    const body = (
      <>
        <span className="deb-cell-top">
          <span className="deb-cell-n tnum" aria-hidden="true">
            {i + 1}
          </span>
          {c.kind === "relevant" ? <Mark kind="check" /> : null}
          {c.kind === "irrelevant" ? <Mark kind="cross" /> : null}
          {c.kind === "missed" ? <span className="deb-chip-word">{t("missed")}</span> : null}
        </span>
        <span className="deb-cell-title">{titleOf(c.id)}</span>
      </>
    );
    return (
      <li key={`${row}-${c.id}-${c.kind}`}>
        {c.why ? (
          <button
            type="button"
            className="deb-chip"
            data-kind={c.kind}
            aria-pressed={selected}
            onClick={() => setOpen(selected ? null : { row, id: c.id })}
          >
            {body}
          </button>
        ) : (
          <span className="deb-chip" data-kind={c.kind}>
            {body}
          </span>
        )}
      </li>
    );
  };

  const kindWord = (k: TraceChip["kind"]) => t(`kind.${k}`);
  return (
    <div className="deb-trace">
      <div className="deb-trace-row">
        <h3 className="t-caption">{t("you")}</h3>
        {rows.you.length === 0 ? (
          <p className="t-body text-ink-2">{t("openedNone")}</p>
        ) : (
          <ul className="deb-chips">
            {rows.you.map((c, i) => cell("you", c, i))}
            {Array.from({ length: Math.max(0, rows.ideal.length - rows.you.length) }, (_, i) => (
              <li key={`empty-${i}`} aria-hidden="true">
                <span className="deb-chip" data-kind="empty" />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="deb-trace-row">
        <h3 className="t-caption">{t("ideal")}</h3>
        <ul className="deb-chips">{rows.ideal.map((c, i) => cell("ideal", c, i))}</ul>
      </div>
      <p className="t-meta text-ink-2">{t("traceHint")}</p>
      <div className="deb-why" role="status" aria-live="polite">
        {picked?.why ? (
          <p className="t-body" lang={localText(picked.why, lang).english ? "en" : undefined}>
            <strong>
              {titleOf(picked.id)} ({kindWord(picked.kind)}):
            </strong>{" "}
            {localText(picked.why, lang).value}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Decisions({ result, scenario }: { result: ReplayDebriefResult; scenario: ReplayScenario }) {
  const t = useTranslations("replay.debrief");
  const lang = useLocale() as Lang;
  const rows = useMemo(() => reviewRows(result, scenario), [result, scenario]);
  const join = (xs: I18nText[], order: boolean) => xs.map((x) => localText(x, lang).value).join(order ? " → " : ", ");
  return (
    <ol className="deb-decisions">
      {rows.map((r) => {
        const why = localText(r.why, lang);
        const prompt = r.prompt ? localText(r.prompt, lang) : null;
        return (
          <li key={r.step} className="deb-decision" data-correct={r.correct}>
            <div className="deb-decision-head">
              <Mark kind={r.correct ? "check" : "cross"} />
              <p className="t-label" lang={prompt?.english ? "en" : undefined}>
                {t("stepOf", { n: r.step })}
                {prompt ? ` · ${prompt.value}` : ""}
              </p>
              <span className="sr-only">{t(r.correct ? "right" : "notQuite")}</span>
            </div>
            <p className="t-body">
              <span className="deb-tag">{t("youSaid")}</span>{" "}
              {r.answered ? join(r.chosen, r.kind === "order") : <em>{t("noAnswer")}</em>}
            </p>
            <p className="t-body">
              <span className="deb-tag">{t("safer")}</span> {join(r.best, r.kind === "order")}
            </p>
            <p className="t-body text-ink-2" lang={why.english ? "en" : undefined}>
              {why.value}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** The one rule: a 3 px ink border plate quoting `rule.text`, its source card and [Listen]. */
function Rule({ result, scenario }: { result: ReplayDebriefResult; scenario: ReplayScenario }) {
  const t = useTranslations("replay.debrief");
  const lang = useLocale() as Lang;
  const rule = localText(result.rule.text, lang);
  const source = scenario.investigate.cards.find((c) => c.type === "protocol_card" && c.card_id === result.rule.card_id);
  return (
    <Plate as="section" rule="heavy" className="deb-rule" aria-labelledby="deb-rule-title">
      <SectionHead id="deb-rule-title" n="05" title={`${t("rule")} · ${source ? localText(source.title, lang).value : result.rule.card_id}`} audioId={result.rule.audio_id} />
      <blockquote className="deb-rule-text" lang={rule.english ? "en" : undefined}>
        {rule.value}
      </blockquote>
    </Plate>
  );
}

function Next({ lessonCode, onPractiseAgain }: { lessonCode: string | null; onPractiseAgain: () => void }) {
  const t = useTranslations("replay.debrief");
  const home = useTranslations("home");
  const lessonKey = lessonCode ? `lesson.${lessonCode}` : null;
  const lessonTitle = lessonKey && home.has(lessonKey) ? home(lessonKey) : null;
  return (
    <div className="deb-next">
      {lessonCode ? (
        <Button variant="primary" href={`/op/training/lesson/${lessonCode}`} prefetch={false}>
          {lessonTitle ? t("lessonNamed", { title: lessonTitle }) : t("lesson")} →
        </Button>
      ) : null}
      <Button variant={lessonCode ? "secondary" : "primary"} size={lessonCode ? "dense" : "hit"} onClick={onPractiseAgain}>
        {t("practiseAgain")}
      </Button>
    </div>
  );
}
