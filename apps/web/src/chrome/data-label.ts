import type { Connectivity } from "@/data/reducer";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The one place that decides what the band's data caption says. Fixtures read "Demo data · hh:mm · 10× speed"
 * (the word "fixture" is never shown). A live-data variant for the thin live path switches here only.
 */
export function dataLabel({
  connectivity,
  clock,
  t,
  formatTime,
}: {
  connectivity: Connectivity;
  clock: { sim_now: string; speed: number } | null;
  t: Translate;
  formatTime: (ms: number) => string;
}): string {
  switch (connectivity.kind) {
    case "live":
      return clock ? t("chrome.simStatus", { time: formatTime(Date.parse(clock.sim_now)), speed: clock.speed }) : t("chrome.live");
    case "reconnecting":
      return t("chrome.reconnecting");
    case "nosignal":
      return t("chrome.noSignalStatus", { time: formatTime(connectivity.syncedAtMs) });
    default:
      return clock ? t("chrome.fixtureStatus", { time: formatTime(Date.parse(clock.sim_now)), speed: clock.speed }) : t("chrome.fixture");
  }
}
