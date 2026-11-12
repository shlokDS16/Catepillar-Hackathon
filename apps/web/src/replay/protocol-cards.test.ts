import { describe, expect, it } from "vitest";
import { evidenceCards } from "@cat/shared/fixtures";
import { localProtocolCard } from "./protocol-cards";

describe("evidence cards render their own protocol", () => {
  it("the protocol_card evidence card resolves by its own card_id, not the hydraulic card", () => {
    const card = evidenceCards.protocol_card;
    const p = localProtocolCard(card.card_id);
    expect(p).not.toBeNull();
    expect(p?.id).toBe(card.card_id);
    expect(p?.title.en).toBe(card.title.en);
    expect(JSON.stringify(p?.steps)).not.toMatch(/upwind|Stay clear/i);
  });

  it("an unknown card_id is left to the data port", () => {
    expect(localProtocolCard("hydraulic_fault")).toBeNull();
  });
});
