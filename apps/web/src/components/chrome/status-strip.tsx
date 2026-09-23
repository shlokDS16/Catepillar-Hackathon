"use client";

import { useFormatter, useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { safetyTone } from "@/alerts/selectors";
import { useSafetyState } from "@/alerts/use-safety-state";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Pictogram, type PictogramName } from "@/components/ui/pictogram";
import { useAppState } from "@/data/store";

const FALLBACK_PICTO: Record<"clear" | "nosignal", PictogramName> = { clear: "seatbelt", nosignal: "sos" };

/**
 * The 80 px status strip: [Safety chip][Connectivity chip], both from the store.
 * Colour + pictogram + word, always; NO SIGNAL after 10 s without a frame.
 */
export function StatusStrip({ showSafety = true }: { showSafety?: boolean }) {
  const t = useTranslations();
  const format = useFormatter();
  const { safety, topAlert } = useSafetyState();
  const connectivity = useAppState((s) => s.connectivity);
  const clock = useAppState((s) => s.clock);

  const safetyWord = t(`enums.safety.${safety}`);
  const picto: PictogramName = topAlert ? KIND_PICTO[topAlert.kind] : safety === "nosignal" ? FALLBACK_PICTO.nosignal : FALLBACK_PICTO.clear;

  let connTone: ChipTone = "outline";
  let connText: string;
  switch (connectivity.kind) {
    case "live":
      connTone = "ink";
      connText = clock ? t("chrome.simStatus", { time: format.dateTime(new Date(clock.sim_now), "time"), speed: clock.speed }) : t("chrome.live");
      break;
    case "reconnecting":
      connText = t("chrome.reconnecting");
      break;
    case "nosignal":
      connTone = "nosignal";
      connText = t("chrome.noSignalStatus", { time: format.dateTime(new Date(connectivity.syncedAtMs), "time") });
      break;
    default:
      connTone = "sunk";
      connText = clock ? t("chrome.fixtureStatus", { time: format.dateTime(new Date(clock.sim_now), "time"), speed: clock.speed }) : t("chrome.fixture");
  }

  return (
    <header className="strip">
      {showSafety ? (
        <Chip
          tone={safetyTone(safety)}
          word
          icon={<Pictogram name={picto} />}
          count={topAlert?.occurrences}
          href="/op/safety"
          aria-label={t("chrome.safetyLabel", { state: safetyWord, count: topAlert?.occurrences ?? 1 })}
        >
          {safetyWord}
        </Chip>
      ) : null}
      <Chip tone={connTone} word dashed={connectivity.kind === "nosignal"} className="ms-auto">
        {connText}
      </Chip>
    </header>
  );
}
