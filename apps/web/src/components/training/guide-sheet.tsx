"use client";

import { BookOpenText, LayoutGrid, Route, Timer, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { GuideFigure } from "@/components/training/guide-figures";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import {
  GUIDE_STEPS,
  GUIDE_STEP_COUNT,
  isFirstStep,
  isLastStep,
  nextStep,
  prevStep,
  railStateFor,
  stepAt,
  stepForKey,
  type GuideStepId,
} from "@/training/guide-steps";

/** UI icons (lucide), not safety pictograms: these name a part of the app, not a hazard. */
const STEP_ICON: Record<GuideStepId, LucideIcon> = {
  brief: BookOpenText,
  investigate: LayoutGrid,
  decide: Timer,
  debrief: Route,
};

type GuideSheetProps = {
  open: boolean;
  /** Called for every way out: Close, Skip and the final Got it. The caller stores "seen". */
  onClose: () => void;
  /** One line shown when the "seen" flag could not be written (private mode). */
  persistNote?: string;
};

/**
 * "How practice works": four steps, one per Replay phase, each with a pictogram, one sentence,
 * one honest line about the rules, and a figure that demonstrates the idea (see guide-figures).
 *
 * It is an introduction, never a gate: Close, Escape and the backdrop leave from any step, and
 * step 1 — the one that opens itself — also carries [Skip]. It sits in a non-modal sheet, so the
 * SOS plate stays above it and stays operable (z-order, chrome §2).
 *
 * Operable without a pointer: the two actions are real buttons in the tab order, and ←/→, PageUp/
 * PageDown, Home and End move the sequence from anywhere inside it. Focus follows the step,
 * so a screen reader reads the new heading, sentence and rule in order. The figures are
 * aria-hidden decoration; nothing they show is only shown there.
 */
export function GuideSheet({ open, onClose, persistNote }: GuideSheetProps) {
  const t = useTranslations("guide");
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const step = stepAt(index);
  const Icon = STEP_ICON[step.id];

  // Focus moves to the step block so the reading order restarts at the new heading. Skipped on
  // the first step of a visit, where the Sheet has just put focus on the dialog, and while the
  // sheet is closed, or resetting to step 1 on the way out would steal focus back from the opener.
  const stepRef = useRef<HTMLDivElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (!open) {
      firstStep.current = true;
      return;
    }
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    stepRef.current?.focus();
  }, [index, open]);

  const go = (to: number) => setIndex(to);
  const finish = () => {
    setIndex(0);
    onClose();
  };

  return (
    <Sheet open={open} onClose={finish} title={t("title")}>
      <div
        className="guide"
        onKeyDown={(e) => {
          const to = stepForKey(index, e.key);
          if (to === index) return;
          e.preventDefault();
          go(to);
        }}
      >
        <ol className="guide-rail" role="list" aria-label={t("stepsLabel", { n: index + 1, total: GUIDE_STEP_COUNT })}>
          {GUIDE_STEPS.map((s, i) => {
            const state = railStateFor(i, index);
            return (
              <li key={s.id} className="guide-rail-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                {t(`steps.${s.id}.phase`)}
                <span className="sr-only">{t(`stepState.${state}`)}</span>
              </li>
            );
          })}
        </ol>

        {/* key: remounting restarts the CSS animation, so going back replays the figure. */}
        <div
          key={step.id}
          ref={stepRef}
          className="guide-step"
          tabIndex={-1}
          role="group"
          aria-labelledby={titleId}
        >
          <GuideFigure figure={step.figure} />
          {/* The count shares the heading row: on a 375 px phone every row costs the sentence
              below room it cannot afford under the floating SOS plate. */}
          <div className="guide-step-head">
            <Icon className="guide-step-icon" strokeWidth={2} aria-hidden="true" />
            <h3 id={titleId} className="t-title">
              {t(`steps.${step.id}.phase`)}
            </h3>
            <p className="t-meta guide-count tnum">{t("stepOf", { n: index + 1, total: GUIDE_STEP_COUNT })}</p>
          </div>
          <p className="t-body guide-step-line">{t(`steps.${step.id}.line`)}</p>
          <p className="t-meta guide-step-rule">{t(`steps.${step.id}.rule`)}</p>
        </div>

        {/*
          Two buttons, always in the same two places: three 80 px targets plus the SOS plate do
          not fit a 375 px row, and a control that moves between steps is the wrong thing to hand
          a gloved thumb. The first slot is the way out on step 1 (where the guide opened itself)
          and the way back afterwards; Close and Escape leave from any step.
        */}
        <div className="guide-actions">
          {isFirstStep(index) ? (
            <Button onClick={finish}>{t("skip")}</Button>
          ) : (
            <Button onClick={() => go(prevStep(index))}>{t("back")}</Button>
          )}
          {isLastStep(index) ? (
            <Button variant="primary" onClick={finish}>
              {t("done")}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => go(nextStep(index))}>
              {t("next")}
            </Button>
          )}
        </div>

        {persistNote ? <p className="t-meta text-ink-3">{persistNote}</p> : null}
      </div>
    </Sheet>
  );
}
