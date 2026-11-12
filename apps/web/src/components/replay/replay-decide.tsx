"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAudio } from "@/audio/use-audio";
import { localText } from "@/components/alerts/alert-takeover";
import { ReplayTimerBar } from "@/components/replay/timer-bar";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import type { Lang } from "@/data/types";
import {
  orderComplete,
  orderNumber,
  SELECT_HOLD_MS,
  toggleOrder,
} from "@/replay/decide";
import {
  createStopwatch,
  elapsedOf,
  runStopwatch,
  timerRuns,
} from "@/replay/timer";
import { useDocumentHidden, useReplayTimer } from "@/replay/use-replay-timer";
import { TIMES_UP_MS, useTimesUp } from "@/replay/use-times-up";
import type { ReplayScenario } from "@cat/shared";

type Props = {
  scenario: ReplayScenario;
  /** 1-based position in `decide.steps`. The parent keys this component on it, so each step starts clean. */
  step: number;
  paused: boolean;
  attempt: number;
  onAnswer: (choiceIds: string[], ms: number) => void;
  onTimeout: () => void;
};

/**
 * Phase 3 Decide (S5b, interaction-map T5/T6). One step at a time: the prompt, 2-5 choice plates
 * and the step countdown. `single` locks on the first tap and advances after 400 ms; `order`
 * numbers the plates in tap order and records on [Confirm order]. No correctness feedback here
 * (Solve-style): it comes in the Debrief. At 0 the step is omitted, not answered.
 *
 * The bar is ink, never a safety colour; there is no vibration and no alarm sound.
 */
export function ReplayDecide({
  scenario,
  step,
  paused,
  attempt,
  onAnswer,
  onTimeout,
}: Props) {
  const t = useTranslations("replay.decide");
  const phase = useTranslations("replay.phase");
  const tr = useTranslations("replay");
  const lang = useLocale() as Lang;
  const hidden = useDocumentHidden();

  const def = scenario.decide.steps[step - 1];
  const total = scenario.decide.steps.length;
  const isOrder = def?.kind === "order";

  const [picked, setPicked] = useState<string | null>(null); // single: the locked choice
  const [sequence, setSequence] = useState<string[]>([]); // order: ids in tap order
  const [confirmed, setConfirmed] = useState<string[] | null>(null);
  const locked = picked !== null || confirmed !== null;

  // The prompt is read aloud once per step (screens.md); [Listen] replays it.
  const audio = useAudio(def?.audio_id);
  const playRef = useRef(audio.play);
  useEffect(() => {
    playRef.current = audio.play;
  });
  const audioReady = audio.available;
  useEffect(() => {
    if (audioReady) playRef.current();
  }, [audioReady, step]);

  // Each step remounts this block, so the plate that had focus is gone: land on the new prompt.
  const promptRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  const { over, expire } = useTimesUp(onTimeout, TIMES_UP_MS, paused);
  const running =
    timerRuns({ phase: "decide", paused, hidden: false }) && !over && !locked;
  const timer = useReplayTimer({
    budgetS: def?.time_limit_s ?? 0,
    running,
    resetKey: `${attempt}-${step}`,
    onExpire: expire,
  });

  // `ms` runs from when the step is shown to when it locks, on the same freeze rules as the bar.
  const watch = useRef(createStopwatch((def?.time_limit_s ?? 0) * 1000));
  useEffect(() => {
    watch.current = runStopwatch(
      watch.current,
      running && !hidden,
      performance.now(),
    );
  }, [running, hidden]);
  const spentMs = () => Math.round(elapsedOf(watch.current, performance.now()));

  // T5: the locked plate shows for 400 ms, then the answer is recorded. A live alert inside that
  // hold would make the machine drop the answer, so the hold waits and restarts on resume.
  const answerRef = useRef(onAnswer);
  useEffect(() => {
    answerRef.current = onAnswer;
  });
  useEffect(() => {
    if (picked === null || paused) return;
    const ms = spentMs();
    const id = setTimeout(
      () => answerRef.current([picked], ms),
      SELECT_HOLD_MS,
    );
    return () => clearTimeout(id);
  }, [picked, paused]);

  // Order: Confirm records straight away (T6), again only once the run is unfrozen.
  useEffect(() => {
    if (confirmed === null || paused) return;
    answerRef.current(confirmed, spentMs());
  }, [confirmed, paused]);

  const announce = (
    <p className="replay-announce" role="status">
      {over ? t("timesUp") : ""}
    </p>
  );

  if (!def) return null;

  const prompt = localText(def.prompt, lang);
  const ready = orderComplete(sequence, def.choices.length);

  const press = (id: string) => {
    if (paused || locked) return;
    if (isOrder) {
      setSequence((seq) => toggleOrder(seq, id));
    } else {
      // Capture the time at the tap, not at the end of the hold.
      setPicked(id);
    }
  };

  return (
    <>
      {/* One stable region for the whole phase, so "Time's up" arrives as a change, not a mount. */}
      {announce}
      {over ? (
        <Plate as="section" rule="heavy" className="replay-timesup">
          <p className="t-title">{t("timesUp")}</p>
          <p className="t-body">{t("timesUpBody")}</p>
        </Plate>
      ) : (
        <section className="replay-decide" aria-label={phase("decide")}>
          <ReplayTimerBar timer={timer}>
            <p className="t-label tnum replay-decide-count">
              {t("stepOf", { n: step, total })}
            </p>
          </ReplayTimerBar>

          <h2
            className="t-title replay-prompt"
            ref={promptRef}
            tabIndex={-1}
            lang={prompt.english ? "en" : undefined}
          >
            {prompt.value}
          </h2>
          {audio.available ? (
            <Button
              size="dense"
              onClick={audio.play}
              note={audio.blocked ? tr("soundBlocked") : undefined}
            >
              {tr("listen")}
            </Button>
          ) : null}
          {isOrder ? (
            <p className="t-body text-ink-2">{t("orderHint")}</p>
          ) : null}

          <ul className="dc-grid" aria-label={t("choicesLabel")}>
            {def.choices.map((choice) => {
              const label = localText(choice.label, lang);
              const n = isOrder ? orderNumber(sequence, choice.id) : null;
              const chosen = isOrder ? n !== null : picked === choice.id;
              return (
                <li key={choice.id}>
                  <Plate
                    as="button"
                    type="button"
                    tone={chosen ? "ink" : "surface"}
                    className="dc-plate"
                    aria-pressed={chosen}
                    aria-disabled={(locked && !chosen) || undefined}
                    onClick={() => press(choice.id)}
                  >
                    <span
                      className="t-label dc-label"
                      lang={label.english ? "en" : undefined}
                    >
                      {label.value}
                    </span>
                    {n !== null ? (
                      <>
                        <span className="dc-number tnum" aria-hidden="true">
                          {n}
                        </span>
                        <span className="sr-only">
                          {t("orderNumber", { n })}
                        </span>
                      </>
                    ) : chosen ? (
                      <span className="sr-only">{t("chosen")}</span>
                    ) : null}
                  </Plate>
                </li>
              );
            })}
          </ul>

          {isOrder ? (
            <div className="replay-actions">
              <Button
                variant="primary"
                disabled={!ready || locked}
                note={ready ? undefined : t("numberAll")}
                onClick={() => setConfirmed(sequence)}
              >
                {t("confirm")}
              </Button>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}
