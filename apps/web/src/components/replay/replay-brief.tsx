"use client";

import { useEffect, useRef } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useAudio } from "@/audio/use-audio";
import { localText } from "@/components/alerts/alert-takeover";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import type { Lang } from "@/data/types";
import type { ReplayScenario } from "@cat/shared";

type BriefProps = {
  scenario: ReplayScenario;
  /** New on every attempt, so "Practise again" plays the situation again. */
  attempt: number;
  onStart: () => void;
};

/**
 * Phase 1 Brief (S5b, T2). Untimed by Decision 2: the 10 s in the spec is the target length of the
 * content, not a clock, so a low-literacy operator can hear the situation through before the
 * Investigate budget starts. The situation plays once on open; [Listen] replays it (A12).
 */
export function ReplayBrief({ scenario, attempt, onStart }: BriefProps) {
  const t = useTranslations("replay");
  const format = useFormatter();
  const lang = useLocale() as Lang;
  const audio = useAudio(scenario.brief.audio_id);

  // "Read aloud once" (T2): one play per attempt, in an effect because it is not a user action.
  const playRef = useRef(audio.play);
  useEffect(() => {
    playRef.current = audio.play;
  });
  const available = audio.available;
  useEffect(() => {
    if (available) playRef.current();
  }, [available, attempt]);

  const title = localText(scenario.brief.title, lang);
  const situation = localText(scenario.brief.situation, lang);
  const goal = localText(scenario.brief.goal, lang);
  const summary = localText(scenario.summary, lang);
  const occurred = format.dateTime(new Date(scenario.occurred_sim_ts), "time");

  return (
    <Plate as="section" rule="heavy" className="replay-brief" aria-labelledby="replay-brief-title">
      <h2 id="replay-brief-title" className="t-title" lang={title.english ? "en" : undefined}>
        {title.value}
      </h2>
      <p className="t-label text-ink-2" lang={summary.english ? "en" : undefined}>
        {t("eventLine", { summary: summary.value, code: scenario.machine_code, time: occurred })}
      </p>

      <div className="replay-brief-read">
        <p className="t-body" lang={situation.english ? "en" : undefined}>
          {situation.value}
        </p>
        {audio.available ? (
          <Button size="dense" onClick={audio.play} note={audio.blocked ? t("soundBlocked") : undefined}>
            {t("listen")}
          </Button>
        ) : null}
      </div>

      <p className="t-body" lang={goal.english ? "en" : undefined}>
        {goal.value}
      </p>

      <p className="t-meta text-ink-3 tnum">{t("budget", { s: scenario.brief.time_budget_s })}</p>
      {/* Left-aligned, not full width: a block button would run under the floating SOS plate. */}
      <Button variant="primary" onClick={onStart}>
        {t("start")}
      </Button>
    </Plate>
  );
}
