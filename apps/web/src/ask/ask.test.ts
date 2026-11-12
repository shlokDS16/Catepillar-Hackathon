import { ASK_SUGGESTIONS, IDS, askAnsweredHeat, askAnsweredLeak, askAnsweredPrestart, pickAskFixture } from "@cat/shared/fixtures";
import { describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import { askViaFunctions, canAsk, citeNumbers, confidencePct, fitWithin, incidentFromProposal, isDemoAnswer, refusalCopyKey } from "@/ask/ask";
import { buildPayload } from "@/safety/incident-sheet";

const req = { request_id: IDS.request, question: "What is this leak?", lang: "en" as const, photo_path: null, history: [] };

describe("refusal copy mapping (A17)", () => {
  it("maps every refusal_reason", () => {
    expect(refusalCopyKey("no_evidence")).toBe("noAnswer");
    expect(refusalCopyKey("rule_not_verbatim")).toBe("noAnswer");
    expect(refusalCopyKey("citation_invalid")).toBe("noAnswer");
    expect(refusalCopyKey("rate_limited")).toBe("rateLimited");
    expect(refusalCopyKey("provider_down")).toBe("providerDown");
    expect(refusalCopyKey("injection_suspected")).toBe("cantAnswer");
    expect(refusalCopyKey("policy_violation")).toBe("cantAnswer");
    expect(refusalCopyKey(null)).toBe("noAnswer");
  });
});

describe("A18 prefill", () => {
  it("fills A13 from proposed_action and leaves severity to the operator", () => {
    const s = incidentFromProposal(askAnsweredLeak.answer!.proposed_action!, "rid-1");
    expect(s.kind).toBe("property_damage");
    expect(s.severity).toBeNull();
    expect(s.note).toBe(askAnsweredLeak.answer!.proposed_action!.description);
    expect(s.phase).toBe("editing");
    expect(s.requestId).toBe("rid-1");
    expect(() => buildPayload(s, null)).toThrow(); // incomplete until the operator picks how serious
    expect(buildPayload({ ...s, severity: 3 }, null).p_incident_type).toBe("property_damage");
  });
  it("an incident type A13 does not offer leaves the kind for the operator; the note is cleaned and capped at 280", () => {
    const s = incidentFromProposal({ incident_type: "seatbelt_breach", description: "a\nb" + "x".repeat(400) }, "r");
    expect(s.kind).toBeNull();
    expect(s.note.startsWith("a b")).toBe(true);
    expect(s.note.length).toBe(280);
  });
});

describe("helpers", () => {
  it("numbers citations by their place in the list", () => {
    const c = [{ id: "a" }, { id: "b" }];
    expect(citeNumbers(["b", "a", "zz"], c)).toEqual([2, 1]);
  });
  it("fits a photo within 1600 px without upscaling", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1000, 5000)).toEqual({ width: 320, height: 1600 });
  });
  it("rounds confidence and gates the Ask button", () => {
    expect(confidencePct(0.72)).toBe(72);
    expect(canAsk("hi", false, false)).toBe(true);
    expect(canAsk("   ", false, false)).toBe(false);
    expect(canAsk("hi", true, false)).toBe(false);
    expect(canAsk("hi", false, true)).toBe(false);
    expect(canAsk("x".repeat(501), false, false)).toBe(false);
  });
  it("only the fixture model is captioned as a demo answer", () => {
    expect(isDemoAnswer({ model: "fixture" })).toBe(true);
    expect(isDemoAnswer({ model: "openai/gpt-oss-120b" })).toBe(false);
  });
});

describe("askViaFunctions (the Supabase adapter's path; no ask function is deployed yet)", () => {
  it("returns the parsed response when the function answers", async () => {
    const out = await askViaFunctions(async () => ({ data: askAnsweredLeak, error: null }), req);
    expect(out.status).toBe("answered");
  });
  it("turns an error, a throw or a bad body into provider_down", async () => {
    for (const invoke of [
      vi.fn(async () => ({ data: null, error: { message: "FunctionsHttpError 404" } })),
      vi.fn(async () => {
        throw new Error("network");
      }),
      vi.fn(async () => ({ data: { nope: true }, error: null })),
    ]) {
      const out = await askViaFunctions(invoke, req);
      expect(out.status).toBe("refused");
      expect(out.refusal_reason).toBe("provider_down");
      expect(out.request_id).toBe(IDS.request);
    }
  });
});

describe("suggested questions answer in every language", () => {
  const want = [askAnsweredLeak, askAnsweredPrestart, askAnsweredHeat];
  for (const [name, msgs] of [["en", en], ["hi", hi]] as const) {
    it(`${name}: each of the 3 suggestions gets its intended fixture`, () => {
      const list = msgs.ask.suggested as string[];
      expect(list).toHaveLength(3);
      list.forEach((question, i) => {
        const r = pickAskFixture({ request_id: IDS.request, question, photo_path: null });
        expect(r.status).toBe("answered");
        expect(r.answer).toEqual(want[i].answer);
      });
    });
  }
  it("the message files and the fixture table agree", () => {
    expect(ASK_SUGGESTIONS.map((s) => s.en)).toEqual(en.ask.suggested);
    expect(ASK_SUGGESTIONS.map((s) => s.hi)).toEqual(hi.ask.suggested);
  });
  it("Hindi keywords route typed questions too", () => {
    const q = (question: string) => pickAskFixture({ request_id: IDS.request, question, photo_path: null }).answer;
    expect(q("हाइड्रोलिक तेल का रिसाव")).toEqual(askAnsweredLeak.answer);
    expect(q("बहुत गर्मी है")).toEqual(askAnsweredHeat.answer);
    expect(q("मशीन की जाँच कैसे करूँ")).toEqual(askAnsweredPrestart.answer);
  });
});
