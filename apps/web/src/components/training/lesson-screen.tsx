"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LessonContent } from "@cat/shared";
import { useAudio } from "@/audio/use-audio";
import { localText } from "@/components/alerts/alert-takeover";
import { Button } from "@/components/ui/button";
import { Mark, Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { newRequestId, RpcError } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import type { Lang } from "@/data/types";
import { DiagramPlayer } from "@/components/training/diagram/diagram-player";
import { diagramFor } from "@/lesson-diagrams/registry";
import { lessonGlyph, lessonProgress, lessonReduce, quizCorrect, quizScore, startLesson, type LessonState } from "@/training/lesson";
import { cx } from "@/lib/cx";

type Load = { state: "loading" } | { state: "failed" } | { state: "missing" } | { state: "ready"; lesson: LessonContent };

/**
 * S5c Lesson `/op/training/lesson/[code]` (T11, T12). Cards (RULE / WHY / HOW / EXAMPLE / CHECK),
 * then a 3-question quiz with an instant tick or cross and the reason, then "2 of 3 correct" and
 * Done. The quiz score goes through lesson_complete once; a failed save keeps the answers and
 * retries with the same request id.
 */
export function LessonScreen({ code }: { code: string }) {
  const t = useTranslations("lesson");
  const port = useDataPort();
  const snapshot = useAppState((s) => s.snapshot);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    port
      .lessonGet(code)
      .then((lesson) => {
        if (live) setLoad({ state: "ready", lesson });
      })
      .catch((e: unknown) => {
        if (live) setLoad(e instanceof RpcError && e.code === "not_found" ? { state: "missing" } : { state: "failed" });
      });
    return () => {
      live = false;
    };
  }, [port, code, attempt]);

  const retry = () => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  };

  return (
    <div className="lesson">
      <Button variant="secondary" href="/op/training" prefetch={false} className="lesson-back">
        {t("backToTraining")}
      </Button>
      {load.state === "missing" ? (
        <Plate as="section" className="lesson-failed">
          <p className="t-body" role="alert">
            {t("notFound")}
          </p>
        </Plate>
      ) : load.state === "failed" ? (
        <Plate as="section" className="lesson-failed">
          <p className="t-body" role="alert">
            {t("loadFailed")}
          </p>
          <Button onClick={retry}>{t("retry")}</Button>
        </Plate>
      ) : load.state === "loading" || !snapshot ? (
        <Plate loading className="min-h-hit-sos" aria-label={t("loading")} />
      ) : (
        <LessonPlayer key={load.lesson.code} lesson={load.lesson} />
      )}
    </div>
  );
}

function LessonPlayer({ lesson }: { lesson: LessonContent }) {
  const t = useTranslations("lesson");
  const lang = useLocale() as Lang;
  const port = useDataPort();
  const assignments = useAppState((s) => s.assignments);
  const done = useAppState((s) => s.training.lessonDone);
  const [state, dispatch] = useReducer((s: LessonState, a: Parameters<typeof lessonReduce>[1]) => lessonReduce(s, a, lesson), lesson, startLesson);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [requestId] = useState(() => newRequestId());
  const posted = useRef(false);

  // The assignment this lesson was set for; an open lesson (no assignment) is not posted.
  // Fixed at mount: the completion event removes it from "open" while the end screen is still up.
  // A lesson whose assignment is already done opens as a review: no score is posted again (T12, no retry in P0).
  const [target] = useState(() => {
    const open = assignments.find((a) => a.lesson_code === lesson.code && done[a.id] == null);
    return { assignment: open ?? null, review: !open && assignments.some((a) => a.lesson_code === lesson.code) };
  });
  const assignment = target.assignment;
  const view = state.view;
  const title = localText(lesson.title, lang);
  const progress = lessonProgress(state, lesson);

  const submit = async (answers: Record<string, string>) => {
    if (!assignment) {
      setSave("saved");
      return;
    }
    if (posted.current) return;
    posted.current = true;
    setSave("saving");
    try {
      await port.lessonComplete({ p_assignment_id: assignment.id, p_quiz_score: quizScore(lesson, answers), p_request_id: requestId });
      setSave("saved");
    } catch {
      posted.current = false; // the same request id goes out again on retry
      setSave("error");
    }
  };

  const advance = () => {
    const next = lessonReduce(state, { type: "next" }, lesson);
    dispatch({ type: "next" });
    if (next.view.phase === "end" && view.phase !== "end") void submit(next.answers);
  };

  return (
    <>
      <header className="lesson-head">
        <p className="t-caption sec-label">
          {t("secLesson")} · <span lang={title.english ? "en" : undefined}>{title.value}</span>
        </p>
        {view.phase !== "end" ? (
          <p className="t-label tnum" aria-live="polite">
            {view.phase === "cards" ? t("cardProgress", { n: progress.done, total: progress.total }) : t("quizProgress", { n: progress.done, total: progress.total })}
          </p>
        ) : null}
      </header>

      {target.review ? <p className="t-meta text-ink-2">{t("reviewNote")}</p> : null}

      {view.phase === "cards" ? (
        <CardView key={view.card} lesson={lesson} index={view.card} onNext={advance} onBack={() => dispatch({ type: "back" })} />
      ) : null}
      {view.phase === "quiz" ? (
        <QuizView key={view.q} lesson={lesson} index={view.q} picked={view.picked} onAnswer={(choiceId) => dispatch({ type: "answer", choiceId })} onNext={advance} />
      ) : null}
      {view.phase === "end" ? <EndView lesson={lesson} answers={state.answers} save={save} onRetry={() => void submit(state.answers)} /> : null}
    </>
  );
}

function Glyph({ name }: { name: string | null }) {
  const g = lessonGlyph(name);
  return g.kind === "sign" ? <Pictogram name={g.name} size="lg" /> : <Mark kind={g.mark} className="picto-lg" />;
}

function ListenButton({ phraseId }: { phraseId: string | null }) {
  const t = useTranslations("lesson");
  const { available, blocked, play } = useAudio(phraseId);
  if (!available) return null;
  return (
    <>
      <Button onClick={play}>{t("listen")}</Button>
      {blocked ? (
        <p className="t-meta text-ink-2" role="status">
          {t("soundBlocked")}
        </p>
      ) : null}
    </>
  );
}

/** Plays a card's clip when it opens, when there is a clip and the browser allows it. */
function useAutoplay(phraseId: string | null) {
  const { available, play } = useAudio(phraseId);
  useEffect(() => {
    if (available) play();
  }, [available, play]);
}

function CardView({ lesson, index, onNext, onBack }: { lesson: LessonContent; index: number; onNext: () => void; onBack: () => void }) {
  const t = useTranslations("lesson");
  const lang = useLocale() as Lang;
  const card = lesson.cards[index]!;
  const title = localText(card.title, lang);
  const body = localText(card.body, lang);
  useAutoplay(card.audio_id);
  const animated = diagramFor(card.pictogram) !== null;
  const text = (
    <div className="lesson-text">
      <h2 id="lesson-card-title" className="t-title" lang={title.english ? "en" : undefined}>
        {title.value}
      </h2>
      <p className="t-body lesson-body" lang={body.english ? "en" : undefined}>
        {body.value}
      </p>
    </div>
  );
  return (
    <Plate as="section" className={cx("lesson-card", animated && "lesson-card-anim")} aria-labelledby="lesson-card-title">
      <p className="t-caption lesson-kind">{t(`kind.${card.kind}`)}</p>
      {animated ? (
        <>
          {text}
          <div className="lesson-anim">
            <DiagramPlayer pictogram={card.pictogram} title={title.value} />
          </div>
        </>
      ) : (
        <>
          <div className="lesson-glyph">
            <Glyph name={card.pictogram} />
          </div>
          {text}
        </>
      )}
      <div className="lesson-actions">
        <Button variant="primary" onClick={onNext}>
          {t("next")}
        </Button>
        {index > 0 ? (
          <Button variant="secondary" onClick={onBack}>
            {t("back")}
          </Button>
        ) : null}
        <ListenButton phraseId={card.audio_id} />
      </div>
    </Plate>
  );
}

function QuizView({ lesson, index, picked, onAnswer, onNext }: { lesson: LessonContent; index: number; picked: string | null; onAnswer: (id: string) => void; onNext: () => void }) {
  const t = useTranslations("lesson");
  const lang = useLocale() as Lang;
  const q = lesson.quiz[index]!;
  const prompt = localText(q.prompt, lang);
  const why = localText(q.why, lang);
  const correct = q.choices.find((c) => c.id === q.correct_id);
  const correctLabel = correct ? localText(correct.label, lang).value : "";
  const revealed = picked != null;
  const right = picked === q.correct_id;
  const actionsRef = useRef<HTMLDivElement>(null);
  const whyPhrase = `lesson.${lesson.code}.quiz.${q.id}`;
  useAutoplayWhen(whyPhrase, revealed);

  // After the reveal the focus moves to Next, so a keyboard or screen-reader user lands on the way on.
  useEffect(() => {
    if (revealed) actionsRef.current?.querySelector("button")?.focus();
  }, [revealed]);

  return (
    <Plate as="section" className="lesson-card" aria-labelledby="lesson-q-title">
      <p className="t-caption lesson-kind">{t("quizLabel")}</p>
      <h2 id="lesson-q-title" className="t-title" lang={prompt.english ? "en" : undefined}>
        {prompt.value}
      </h2>
      <ul className="lesson-choices" aria-label={t("choicesLabel")}>
        {q.choices.map((c) => {
          const label = localText(c.label, lang);
          const isCorrect = c.id === q.correct_id;
          const isPicked = c.id === picked;
          const state = !revealed ? "idle" : isPicked ? (isCorrect ? "right" : "wrong") : isCorrect ? "answer" : "dim";
          return (
            <li key={c.id}>
              <button
                type="button"
                className={cx("lesson-choice")}
                data-state={state}
                aria-disabled={revealed || undefined}
                aria-pressed={revealed ? isPicked : undefined}
                onClick={() => (revealed ? undefined : onAnswer(c.id))}
              >
                <span className="lesson-choice-glyph">
                  <Glyph name={c.pictogram} />
                </span>
                <span className="t-label lesson-choice-label" lang={label.english ? "en" : undefined}>
                  {label.value}
                </span>
                {revealed && (isPicked || isCorrect) ? (
                  <span className="lesson-choice-result">
                    <Mark kind={isCorrect ? "check" : "cross"} className="lesson-mark-in" />
                    <span className="t-meta">{isPicked ? (isCorrect ? t("correct") : t("picked")) : t("right")}</span>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div role="status" className="lesson-reveal">
        {revealed ? (
          <>
            <p className="t-label">{right ? t("correct") : t("wrong", { answer: correctLabel })}</p>
            <p className="t-body" lang={why.english ? "en" : undefined}>
              {why.value}
            </p>
          </>
        ) : null}
      </div>
      {revealed ? (
        <div className="lesson-actions" ref={actionsRef}>
          <Button variant="primary" onClick={onNext}>
            {t("next")}
          </Button>
          <ListenButton phraseId={whyPhrase} />
        </div>
      ) : null}
    </Plate>
  );
}

function useAutoplayWhen(phraseId: string, when: boolean) {
  const { available, play } = useAudio(phraseId);
  useEffect(() => {
    if (when && available) play();
  }, [when, available, play]);
}

function EndView({ lesson, answers, save, onRetry }: { lesson: LessonContent; answers: Record<string, string>; save: "idle" | "saving" | "saved" | "error"; onRetry: () => void }) {
  const t = useTranslations("lesson");
  const correct = quizCorrect(lesson, answers);
  const total = lesson.quiz.length;
  return (
    <Plate as="section" className="lesson-card lesson-end" aria-labelledby="lesson-end-title">
      <h2 id="lesson-end-title" className="t-figure tnum">
        {t("endTitle", { n: correct, total })}
      </h2>
      <div className="lesson-actions" role="status">
        {save === "saved" ? (
          <Button variant="primary" href="/op/training" prefetch={false} status="success">
            {t("done")}
          </Button>
        ) : save === "error" ? (
          <Button variant="primary" status="error" note={t("notSaved")} onClick={onRetry}>
            {t("retry")}
          </Button>
        ) : (
          <Button variant="primary" status="loading" disabled note={t("saving")}>
            {t("done")}
          </Button>
        )}
      </div>
    </Plate>
  );
}
