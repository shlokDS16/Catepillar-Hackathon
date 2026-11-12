import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evidenceCards, protocolCard, replayDebrief } from "@cat/shared/fixtures";
import { SEATBELT_SLOPES_CARD, fixtureProtocolCard } from "./protocol-cards";

describe("evidence cards render their own protocol", () => {
  it("the protocol_card evidence card resolves by its own card_id, not the hydraulic card", () => {
    const p = fixtureProtocolCard(evidenceCards.protocol_card.card_id, protocolCard as never);
    expect(p?.id).toBe("seatbelt_slopes");
    expect(p?.title.en).toBe(evidenceCards.protocol_card.title.en);
  });
  it("hydraulic keeps its own card and an unknown id is null", () => {
    expect(fixtureProtocolCard("hydraulic_fault", protocolCard as never)?.id).toBe("hydraulic_fault");
    expect(fixtureProtocolCard("nope", protocolCard as never)).toBeNull();
  });
  it("steps match the authored migration row verbatim, and the Debrief rule quotes step 1", () => {
    const dir = join(__dirname, "../../../../supabase/migrations");
    const f = readdirSync(dir).find((n) => n.endsWith("_006_loop_replay.sql"))!;
    const sql = readFileSync(join(dir, f), "utf8");
    for (const s of SEATBELT_SLOPES_CARD.steps) {
      expect(sql).toContain(s.en);
      expect(sql).toContain(s.hi);
    }
    expect(SEATBELT_SLOPES_CARD.steps[0].en).toBe(replayDebrief.rule.text.en);
  });
});
