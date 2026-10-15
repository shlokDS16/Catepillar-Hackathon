import { useTranslations } from "next-intl";
import type { ReplayPhase } from "@/replay/machine";

/** The four phases in order. LOADING, SUBMITTING and a failed load belong to the phase they sit in. */
export const RAIL_PHASES = ["brief", "investigate", "decide", "debrief"] as const;
export type RailPhase = (typeof RAIL_PHASES)[number];

/** Where the rail's marker sits for a machine phase: loading is still the Brief, submitting the Decide. */
export function railPhase(phase: ReplayPhase): RailPhase {
  switch (phase) {
    case "loading":
    case "load_failed":
    case "brief":
      return "brief";
    case "investigate":
      return "investigate";
    case "decide":
    case "submitting":
      return "decide";
    case "debrief":
      return "debrief";
  }
}

/**
 * S5b: BRIEF · INVESTIGATE · DECIDE · DEBRIEF across the top, the current phase inverted in ink.
 * It is not tappable — a replay cannot be skipped into — so it is a list, not a set of buttons,
 * and the position is also said in words for screen readers.
 */
export function PhaseRail({ phase }: { phase: ReplayPhase }) {
  const t = useTranslations("replay");
  const current = railPhase(phase);
  const index = RAIL_PHASES.indexOf(current);
  return (
    <ol className="phase-rail" role="list" aria-label={t("phasesLabel", { n: index + 1, total: RAIL_PHASES.length })}>
      {RAIL_PHASES.map((p, i) => {
        const state = i < index ? "done" : i === index ? "current" : "todo";
        return (
          <li key={p} className="phase-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            {t(`phase.${p}`)}
            <span className="sr-only">{t(`phaseState.${state}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}
