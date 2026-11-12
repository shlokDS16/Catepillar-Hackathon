"use client";

import { useTranslations } from "next-intl";

type Props = { rings: boolean; /** Safety colours in the key only while the map itself may use them. */ live: boolean };

/**
 * The key for what the overlay draws: the two Guardian rings (the only coloured lines, and only
 * while live), my machine, a hazard, any other machine, and what "stale" looks like.
 */
export function MapLegend({ rings, live }: Props) {
  const t = useTranslations("map");
  return (
    <ul className="map-legend t-meta text-ink-2" aria-label={t("legend.label")} data-live={live || undefined}>
      {rings ? (
        <>
          <li>
            <span className="map-key" data-key="ring-danger" aria-hidden="true" />
            {t("legend.danger", { m: 15 })}
          </li>
          <li>
            <span className="map-key" data-key="ring-warning" aria-hidden="true" />
            {t("legend.warning", { m: 50 })}
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
  );
}
