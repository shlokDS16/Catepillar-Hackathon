"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAudio } from "@/audio/use-audio";
import { localText } from "@/components/alerts/alert-takeover";
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
  const clip = (section: string) => sectionClipId(result.rule.audio_id, section);

  return (
    <div className="deb">
      <section className="deb-stage" aria-labelledby="deb-what">
        <SectionHead id="deb-what" n="01" title={t("what")} audioId={clip("what")} />
        <p className="deb-headline" lang={title.english ? "en" : undefined}>
          {title.value}
        </p>
        <ReenactmentPlayer scenario={scenario} paused={paused} />
      </section>

      <section className="deb-section deb-s-scores" aria-labelledby="deb-scores">
        <SectionHead id="deb-scores" n="02" title={t("scores")} audioId={clip("scores")} />
        <Scores scores={result.scores} />
        <p className="t-meta text-ink-2">{t("scoresNote")}</p>
      </section>

      <section className="deb-section deb-s-path" aria-labelledby="deb-trace">
        <SectionHead id="deb-trace" n="03" title={t("trace")} audioId={clip("path")} />
        <Trace result={result} scenario={scenario} />
      </section>

      <section className="deb-section deb-s-decisions" aria-labelledby="deb-decisions">
        <SectionHead id="deb-decisions" n="04" title={t("decisions")} audioId={clip("decisions")} />
        <Decisions result={result} scenario={scenario} />
      </section>

      <Rule result={result} scenario={scenario} />

      <Next lessonCode={result.lesson_code} onPractiseAgain={onPractiseAgain} />
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

/** The numbered mono section label ("02 — How you did") with its [Listen] on the right. */
function SectionHead({ id, n, title, audioId }: { id: string; n: string; title: string; audioId: string | null }) {
  return (
    <div className="deb-lbl">
      <h2 id={id} className="t-caption deb-lbl-text">
        <span className="deb-lbl-n">{n} —</span> {title}
      </h2>
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
  const rows = useMemo(() => traceRows(result), [result]);
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
          <ul className="deb-chips">{rows.you.map((c, i) => cell("you", c, i))}</ul>
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
              <span className="t-caption deb-verdict">{t(r.correct ? "right" : "notQuite")}</span>
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
      <SectionHead id="deb-rule-title" n="05" title={t("rule")} audioId={result.rule.audio_id} />
      <blockquote className="deb-rule-text" lang={rule.english ? "en" : undefined}>
        {rule.value}
      </blockquote>
      <p className="t-meta text-ink-2">{t("ruleSource", { source: source ? localText(source.title, lang).value : result.rule.card_id })}</p>
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
        <Button variant="primary" size="sos" href={`/op/training/lesson/${lessonCode}`} prefetch={false}>
          {lessonTitle ? t("lessonNamed", { title: lessonTitle }) : t("lesson")}
        </Button>
      ) : null}
      <Button variant={lessonCode ? "secondary" : "primary"} size={lessonCode ? "hit" : "sos"} onClick={onPractiseAgain}>
        {t("practiseAgain")}
      </Button>
    </div>
  );
}
