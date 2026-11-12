/**
 * Protocol cards an evidence card can render by its own `card_id`. The data port's fixture
 * `protocolCard(id)` returns the one hydraulic card for every id, so a replay evidence card must resolve its
 * own card first (judge review #1). Live ports return the real row, so this only answers ids it knows.
 */
import type { ProtocolCard } from "@/data/types";

export const REPLAY_PROTOCOL_CARDS: Readonly<Record<string, ProtocolCard>> = {
  seatbelt_slopes: {
    id: "seatbelt_slopes",
    title: { en: "Seatbelt on slopes", hi: "ढलान पर सीटबेल्ट" },
    steps: [
      { en: "Fasten the seatbelt before the machine moves.", hi: "मशीन चलने से पहले सीटबेल्ट लगाएँ।" },
      { en: "Never drive on a slope without it.", hi: "सीटबेल्ट के बिना ढलान पर कभी न चलें।" },
      { en: "Click, tug, go.", hi: "क्लिक, खींचो, चलो।" },
    ],
    pictogram: "belt",
    upwind_hint: false,
    version: 1,
  },
};

/** The card to show for an evidence card's `card_id`, or null when the data port must answer. */
export function localProtocolCard(cardId: string): ProtocolCard | null {
  return REPLAY_PROTOCOL_CARDS[cardId] ?? null;
}
