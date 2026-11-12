"use client";

import { useTranslations } from "next-intl";
import { RING_M } from "@/map/site-map";

type Props = { rings: boolean; /** Safety colours in the key only while the map itself may use them (the cursor is on Live). */ live: boolean };

/**
 * The key for what the overlay draws, folded to one row so the map keeps the frame: the two
 * Guardian rings, my machine, a hazard, any other machine, and what "stale" looks like.
 */
export function MapLegend({ rings, live }: Props) {
  const t = useTranslations("map");
  return (
    <details className="map-key-box">
      <summary className="map-key-summary t-label">{t("legend.label")}</summary>
      <ul className="map-legend t-meta text-ink-2" data-live={live || undefined}>
        {rings ? (
          <>
            <li>
              <span className="map-key" data-key="ring-danger" aria-hidden="true" />
              {t("legend.danger", { m: RING_M.danger })}
            </li>
            <li>
              <span className="map-key" data-key="ring-warning" aria-hidden="true" />
              {t("legend.warning", { m: RING_M.warning })}
            </li>
          </>
        ) : null}
        <li>
          <span className="map-key" data-key="own" aria-hidden="true" />
          {t("legend.own")}
        </li>
        <li>
          <span className="map-key" data-key="hazard" aria-hidden="true" />
          {t("legend.hazard")}
        </li>
        <li>
          <span className="map-key" data-key="other" aria-hidden="true" />
          {t("legend.other")}
        </li>
        <li>
          <span className="map-key" data-key="stale" aria-hidden="true" />
          {t("legend.stale")}
        </li>
      </ul>
    </details>
  );
}
