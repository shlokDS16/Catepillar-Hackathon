import { useTranslations } from "next-intl";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Pictogram, type PictogramName } from "@/components/ui/pictogram";

/** Highest active tier, or the stale states. Wired to the alert selectors in F04. */
export type SafetyState = "clear" | "caution" | "warning" | "critical" | "nosignal";
/** Connectivity chip states (interaction-map §2). Wired to the adapter in F07/F13. */
export type Connectivity =
  | { kind: "fixture" }
  | { kind: "live" }
  | { kind: "sim"; simTime: string; speed: number }
  | { kind: "reconnecting" }
  | { kind: "nosignal"; syncedAt: string };

const SAFETY_PICTO: Record<SafetyState, PictogramName> = {
  clear: "seatbelt",
  caution: "heat",
  warning: "proximity",
  critical: "fault",
  nosignal: "sos",
};

type StatusStripProps = {
  safety?: SafetyState;
  /** Extra occurrences of the highest alert, shown as "×n". */
  occurrences?: number;
  connectivity?: Connectivity;
  /** Operators see the safety chip; the fleet manager's strip has only connectivity. */
  showSafety?: boolean;
};

/** The 80 px status strip: [Safety chip][Connectivity chip]. Colour + pictogram + word, always. */
export function StatusStrip({
  safety = "clear",
  occurrences,
  connectivity = { kind: "fixture" },
  showSafety = true,
}: StatusStripProps) {
  const t = useTranslations();
  const connTone: ChipTone = connectivity.kind === "live" ? "ink" : connectivity.kind === "nosignal" ? "nosignal" : connectivity.kind === "fixture" ? "sunk" : "outline";
  const connText =
    connectivity.kind === "live"
      ? t("chrome.live")
      : connectivity.kind === "sim"
        ? t("chrome.simStatus", { time: connectivity.simTime, speed: connectivity.speed })
        : connectivity.kind === "reconnecting"
          ? t("chrome.reconnecting")
          : connectivity.kind === "nosignal"
            ? t("chrome.noSignalStatus", { time: connectivity.syncedAt })
            : t("chrome.fixture");
  const safetyWord = t(`enums.safety.${safety}`);

  return (
    <header className="strip">
      {showSafety ? (
        <Chip
          tone={safety}
          word
          icon={<Pictogram name={SAFETY_PICTO[safety]} />}
          count={occurrences}
          href="/op/safety"
          aria-label={t("chrome.safetyLabel", { state: safetyWord, count: occurrences ?? 1 })}
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
