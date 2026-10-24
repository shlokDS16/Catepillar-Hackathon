"use client";

import { useLocale, useTranslations } from "next-intl";
import { localText } from "@/components/alerts/alert-takeover";
import { EvidenceMark } from "@/components/replay/evidence-mark";
import { Plate } from "@/components/ui/plate";
import type { Lang } from "@/data/types";
import { orderStamp, plateState } from "@/replay/evidence";
import type { EvidenceCard } from "@cat/shared";

type Props = {
  cards: readonly EvidenceCard[];
  /** First-open order (`p_open_order`); its index is the plate's stamp. */
  openOrder: readonly string[];
  maxOpen: number | null;
  onOpen: (card: EvidenceCard) => void;
};

/**
 * The Investigate grid (S5b, T3): 3-7 closed plates, 2 columns on a phone and 3 from 1024 px,
 * each ≥ 80 px high with its type glyph and title. An opened plate carries its order stamp; at
 * `max_open` the unopened plates are disabled with the reason "Limit reached".
 *
 * Relevance is never hinted here — that is the Debrief's job (D10). The stamps are the only state
 * a plate shows, and they say "you opened this third", not "this one mattered".
 */
export function EvidenceGrid({ cards, openOrder, maxOpen, onOpen }: Props) {
  const t = useTranslations("replay.investigate");
  const lang = useLocale() as Lang;

  return (
    <ul className="ev-grid" aria-label={t("gridLabel")}>
      {cards.map((card) => {
        const state = plateState(openOrder, maxOpen, card.id);
        const stamp = orderStamp(openOrder, card.id);
        const locked = state === "locked";
        const title = localText(card.title, lang);
        return (
          <li key={card.id}>
            <Plate
              as="button"
              type="button"
              className="ev-plate"
              data-state={state}
              // aria-disabled, not disabled: a locked plate stays reachable by keyboard and
              // screen reader so its reason can actually be read (WCAG 2.2).
              aria-disabled={locked || undefined}
              onClick={locked ? undefined : () => onOpen(card)}
            >
              <EvidenceMark type={card.type} />
              <span className="t-label ev-plate-title" lang={title.english ? "en" : undefined}>
                {title.value}
              </span>
              {stamp !== null ? (
                <span className="ev-stamp tnum" aria-hidden="true">
                  {stamp}
                </span>
              ) : null}
              <span className="sr-only">
                {stamp !== null ? t("stamp", { n: stamp }) : locked ? t("limit") : t("notOpened")}
              </span>
              {locked ? <span className="t-meta ev-plate-note">{t("limit")}</span> : null}
            </Plate>
          </li>
        );
      })}
    </ul>
  );
}
