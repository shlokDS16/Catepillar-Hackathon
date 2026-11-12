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
import { reviewRows, traceRows, type TraceChip } from "@/replay/debrief";
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
 * Phase 4 Debrief (S5b, T8-T10), untimed. Order: what happened, how you did, how you investigated,
 * your decisions, the one rule, next. The rule is pinned last so it is the final thing read.
 * Correct and wrong are ink (filled tick, outlined cross), never green or red (§5.1).
 */
export function ReplayDebrief({ result, scenario, paused, onPractiseAgain }: Props) {
  const t = useTranslations("replay.debrief");

  return (
    <div className="deb">
      <section className="deb-section" aria-labelledby="deb-what">
        <h2 id="deb-what" className="t-title">
          {t("what")}
        </h2>
        <ReenactmentPlayer scenario={scenario} paused={paused} />
      </section>

      <section className="deb-section" aria-labelledby="deb-scores">
        <h2 id="deb-scores" className="t-title">
          {t("scores")}
        </h2>
        <Scores scores={result.scores} />
      </section>

      <section className="deb-section" aria-labelledby="deb-trace">
        <h2 id="deb-trace" className="t-title">
          {t("trace")}
        </h2>
        <Trace result={result} scenario={scenario} />
      </section>

      <section className="deb-section" aria-labelledby="deb-decisions">
        <h2 id="deb-decisions" className="t-title">
          {t("decisions")}
        </h2>
        <Decisions result={result} scenario={scenario} />
      </section>

      <Rule result={result} scenario={scenario} />

      <Next lessonCode={result.lesson_code} onPractiseAgain={onPractiseAgain} />
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
      <span className="t-label">{label}</span>
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

  const chip = (row: "you" | "ideal", c: TraceChip) => {
    const selected = open?.row === row && open.id === c.id;
    const body = (
      <>
        {c.kind === "relevant" ? <Mark kind="check" /> : null}
        {c.kind === "irrelevant" ? <Mark kind="cross" /> : null}
        {c.kind === "missed" ? <span className="deb-chip-word">{t("missed")}</span> : null}
        <span>{titleOf(c.id)}</span>
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
        <h3 className="t-label">{t("you")}</h3>
        {rows.you.length === 0 ? (
          <p className="t-body text-ink-2">{t("openedNone")}</p>
        ) : (
          <ul className="deb-chips">{rows.you.map((c) => chip("you", c))}</ul>
        )}
      </div>
      <div className="deb-trace-row">
        <h3 className="t-label">{t("ideal")}</h3>
        <ul className="deb-chips">{rows.ideal.map((c) => chip("ideal", c))}</ul>
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
  const tr = useTranslations("replay");
  const lang = useLocale() as Lang;
  const audio = useAudio(result.rule.audio_id);
  const rule = localText(result.rule.text, lang);
  const source = scenario.investigate.cards.find((c) => c.type === "protocol_card" && c.card_id === result.rule.card_id);
  return (
    <Plate as="section" rule="heavy" className="deb-rule" aria-labelledby="deb-rule-title">
      <h2 id="deb-rule-title" className="t-label text-ink-2">
        {t("rule")}
      </h2>
      <blockquote className="t-title deb-rule-text" lang={rule.english ? "en" : undefined}>
        {rule.value}
      </blockquote>
      <p className="t-meta text-ink-2">{t("ruleSource", { source: source ? localText(source.title, lang).value : result.rule.card_id })}</p>
      {audio.available ? (
        <Button size="dense" onClick={audio.play} note={audio.blocked ? tr("soundBlocked") : undefined}>
          {tr("listen")}
        </Button>
      ) : null}
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
        <Button variant="primary" href={`/op/training/lesson/${lessonCode}`}>
          {lessonTitle ? t("lessonNamed", { title: lessonTitle }) : t("lesson")}
        </Button>
      ) : null}
      <Button variant={lessonCode ? "secondary" : "primary"} onClick={onPractiseAgain}>
        {t("practiseAgain")}
      </Button>
    </div>
  );
}
