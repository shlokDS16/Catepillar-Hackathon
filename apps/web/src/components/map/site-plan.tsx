"use client";

import { useTranslations } from "next-intl";

type Props = {
  /** Why the plan is on screen: while the basemap loads, or because it cannot be shown at all. */
  reason: "loading" | "no_webgl" | "tiles_blocked" | "offline";
};

/**
 * The paper site plan's ground (screens.md S4 "Fallback: the paper site plan"): ruled paper under
 * the same overlay that sits on the basemap. Zones, trails, rings and machines are drawn by the
 * overlay from data we already hold, so the plan and the live map agree by construction, and an
 * operator on a dead network sees the plan at once instead of a blank square or a timer.
 */
export function SitePlan({ reason }: Props) {
  const t = useTranslations("map");
  return (
    <div className="map-backdrop" data-reason={reason}>
      <p className="t-meta map-backdrop-note">{t(`fallback.${reason}`)}</p>
    </div>
  );
}
