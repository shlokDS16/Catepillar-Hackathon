/**
 * Fixture-mode protocol cards, answered by id inside FixtureAdapter.protocolCard (judge review #1). The
 * seatbelt card is copied verbatim from the authored row in supabase/migrations/*_006_loop_replay.sql; a live
 * port returns the DB row and never reaches this file.
 */
import type { ProtocolCard } from "@/data/types";

export const SEATBELT_SLOPES_CARD: ProtocolCard = {
  id: "seatbelt_slopes",
  title: { en: "Seatbelt on slopes", hi: "ढलान पर सीटबेल्ट" },
  steps: [
    { en: "Seatbelt on before the machine moves; never on a slope without it.", hi: "मशीन चलने से पहले सीटबेल्ट; ढलान पर कभी बिना नहीं।" },
    { en: "If it is off while moving: stop the machine safely and park it on level ground.", hi: "चलते समय खुली हो तो मशीन सुरक्षित रोकें और समतल जगह पर पार्क करें।" },
    { en: "Fasten the belt and tug it to check that it holds.", hi: "बेल्ट लगाएँ और खींचकर जाँचें कि वह टिकी है।" },
    { en: "Tell your supervisor, then resume.", hi: "सुपरवाइज़र को बताएँ, फिर काम शुरू करें।" },
  ],
  pictogram: "belt",
  upwind_hint: false,
  version: 1,
};

/** The fixture card for an id: the hydraulic fixture keeps its own id, the seatbelt card is the authored one, else null. */
export function fixtureProtocolCard(id: string, hydraulic: ProtocolCard): ProtocolCard | null {
  if (id === SEATBELT_SLOPES_CARD.id) return SEATBELT_SLOPES_CARD;
  return id === hydraulic.id ? hydraulic : null;
}
