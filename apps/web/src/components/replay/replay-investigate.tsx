"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { localText } from "@/components/alerts/alert-takeover";
import { EvidenceCardBody } from "@/components/replay/evidence-card";
import { EvidenceGrid } from "@/components/replay/evidence-grid";
import { ReplayTimerBar } from "@/components/replay/timer-bar";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import type { Lang } from "@/data/types";
import { canDecideNow, limitReached } from "@/replay/evidence";
import { timerRuns } from "@/replay/timer";
import { useReplayTimer } from "@/replay/use-replay-timer";
import { TIMES_UP_MS, useTimesUp } from "@/replay/use-times-up";
import type { EvidenceCard, ReplayScenario } from "@cat/shared";

type Props = {
  scenario: ReplayScenario;
  openOrder: readonly string[];
  /** A live alert froze the run: the clock stops and only Resume restarts it. */
  paused: boolean;
  /** New on every attempt ("Practise again"), which restarts the countdown. */
  attempt: number;
  onOpen: (cardId: string) => void;
  onDecideNow: () => void;
  onTimeout: () => void;
};

/**
 * Phase 2 Investigate (S5b, interaction-map T3/T4, D10). The operator opens the evidence they
 * think matters; which cards and in what order is the process score, so every first open is
 * stamped and `max_open` is a hard limit. Nothing here hints at relevance.
 *
 * The countdown is ink, never a safety colour: training urgency must not look like a live alarm.
 * At 0 the "Time's up" plate holds for 800 ms and the run moves to Decide with whatever was
 * opened, even nothing.
 */
export function ReplayInvestigate({
  scenario,
  openOrder,
  paused,
  attempt,
  onOpen,
  onDecideNow,
  onTimeout,
}: Props) {
  const t = useTranslations("replay.investigate");
  const phase = useTranslations("replay.phase");
  const format = useFormatter();
  const lang = useLocale() as Lang;
  const [viewing, setViewing] = useState<EvidenceCard | null>(null);

  // `paused` blocks the hand-off: the machine refuses a phase change during a live-alert freeze,
  // so firing it there would be dropped and leave the run stuck on the "Time's up" plate.
  const { over, expire } = useTimesUp(onTimeout, TIMES_UP_MS, paused);
  const timer = useReplayTimer({
    budgetS: scenario.brief.time_budget_s,
    running:
      timerRuns({ phase: "investigate", paused, hidden: false }) && !over,
    resetKey: attempt,
    onExpire: expire,
  });

  const maxOpen = scenario.investigate.max_open;
  const cards = scenario.investigate.cards;
  const eventTime = format.dateTime(new Date(scenario.occurred_sim_ts), "time");
  const title = viewing ? localText(viewing.title, lang) : null;

  const open = (card: EvidenceCard) => {
    // The sheet follows what the machine accepted, never the tap: if the run is frozen or the
    // open limit is spent, the card stays shut rather than being readable but unrecorded.
    if (
      paused ||
      (!openOrder.includes(card.id) && limitReached(openOrder, maxOpen))
    )
      return;
    onOpen(card.id);
    setViewing(card);
  };

  // The live region is mounted for the whole phase and starts empty: a role="status" node that
  // appears together with its text is never announced (timer-bar.tsx gets this right), so
  // "Time's up" has to arrive as a change inside a region that was already there.
  const announce = (
    <p className="replay-announce" role="status">
      {over ? t("timesUp") : ""}
    </p>
  );

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
        // The phase name, not "Evidence cards": the grid inside already carries that label.
        <section
          className="replay-investigate"
          aria-label={phase("investigate")}
        >
          <ReplayTimerBar timer={timer}>
            <p className="t-body replay-timer-lead">{t("lead")}</p>
          </ReplayTimerBar>

          <p className="t-label tnum replay-count">
            {maxOpen === null
              ? t("opened", { n: openOrder.length })
              : t("openedOf", { n: openOrder.length, max: maxOpen })}
          </p>

          <EvidenceGrid
            cards={cards}
            openOrder={openOrder}
            maxOpen={maxOpen}
            onOpen={open}
          />

          {/* Left-aligned and kept clear of the floating SOS plate in the bottom-right corner. */}
          <div className="replay-actions">
            <Button
              variant="primary"
              onClick={onDecideNow}
              disabled={!canDecideNow(openOrder)}
              note={canDecideNow(openOrder) ? undefined : t("openOneFirst")}
            >
              {t("decideNow")}
            </Button>
          </div>

          <Sheet
            open={viewing !== null}
            onClose={() => setViewing(null)}
            title={title?.value ?? t("cardTitle")}
          >
            {viewing ? (
              <div className="ev-sheet">
                <EvidenceCardBody card={viewing} eventTime={eventTime} />
                <p className="t-meta text-ink-3">{t("cardNote")}</p>
              </div>
            ) : null}
          </Sheet>
        </section>
      )}
    </>
  );
}
