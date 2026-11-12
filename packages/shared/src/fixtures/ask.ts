/**
 * Ask Spotter (S6) fixtures: one answered response per suggested question, one per refusal family and
 * a degraded one. Additive; every value parses with AskResponse. `model` is ASK_FIXTURE_MODEL, which is
 * how the web app knows to caption the answer as a simulated demo answer (never imply a live model).
 */
import type { AskRequest, AskResponse } from "../contracts/functions";
import { IDS } from "./ids";

export const ASK_FIXTURE_MODEL = "fixture";

type Resp = AskResponse;

const base = { provider_served: "none" as const, model: ASK_FIXTURE_MODEL, fallback_used: null, latency_ms: 0 };
const refusal = (refusal_reason: NonNullable<Resp["refusal_reason"]>): Resp => ({
  request_id: IDS.request, status: "refused", refusal_reason, answer: null, citations: [], photo: null, ...base,
});

const LEAK_CITE = { id: "kb:osha-3120:p4", kind: "doc" as const, title: "OSHA 3120", page: 4,
  snippet: "Do not operate equipment with a known hydraulic leak.", review_status: "reviewed" as const };
const LEAK_CITE_2 = { id: "kb:cat-om-hyd:p31", kind: "doc" as const, title: "Operation and Maintenance Manual", page: 31,
  snippet: "Lower the implements, stop the engine and relieve the pressure before you go near a leak.", review_status: "reviewed" as const };

/** Leak: three steps, a RULE plate, a photo reading and a proposed incident log (A18). */
export const askAnsweredLeak: Resp = {
  request_id: IDS.request, status: "answered", refusal_reason: null,
  answer: {
    steps: [
      { text: "Lower the bucket to the ground and stop the engine.", cited_ids: ["kb:cat-om-hyd:p31"] },
      { text: "Stay clear of the leak and keep away from the spray: hot oil can burn and inject under skin.", cited_ids: ["kb:osha-3120:p4"] },
      { text: "Tag the machine out of service and tell your supervisor before anyone restarts it.", cited_ids: ["kb:osha-3120:p4", "kb:cat-om-hyd:p31"] },
    ],
    rule: { text: "Do not operate equipment with a known hydraulic leak.", cited_id: "kb:osha-3120:p4" },
    grounded: true, handover_to_supervisor: true,
    proposed_action: { type: "log_incident", incident_type: "property_damage",
      description: "Hydraulic leak seen on the machine; stopped work and tagged it out." },
  },
  citations: [LEAK_CITE, LEAK_CITE_2],
  photo: { category: "hydraulic_leak", confidence: 0.72 },
  ...base,
};

/** Pre-start check: includes a DRAFT citation, which the sheet labels "draft guidance, confirm with supervisor". */
export const askAnsweredPrestart: Resp = {
  request_id: IDS.request, status: "answered", refusal_reason: null,
  answer: {
    steps: [
      { text: "Walk around the machine: tyres or tracks, leaks under it, steps and handrails.", cited_ids: ["kb:cat-om-walk:p12"] },
      { text: "Check engine oil, coolant and hydraulic oil levels before you start.", cited_ids: ["kb:site-prestart:p2"] },
    ],
    rule: { text: "Fasten the seat belt before you start the engine.", cited_id: "kb:cat-om-walk:p12" },
    grounded: true, handover_to_supervisor: false, proposed_action: null,
  },
  citations: [
    { id: "kb:cat-om-walk:p12", kind: "doc", title: "Operation and Maintenance Manual", page: 12,
      snippet: "Fasten the seat belt before you start the engine.", review_status: "reviewed" },
    { id: "kb:site-prestart:p2", kind: "doc", title: "Site pre-start checklist", page: 2,
      snippet: "Check engine oil, coolant and hydraulic oil levels.", review_status: "draft" },
  ],
  photo: null, ...base,
};

/** Heat: one citation is live data (kind "live"), not a document. */
export const askAnsweredHeat: Resp = {
  request_id: IDS.request, status: "answered", refusal_reason: null,
  answer: {
    steps: [
      { text: "Drink water every 20 minutes and take shade breaks when the heat index is high.", cited_ids: ["kb:site-heat:p2"] },
      { text: "Check the site heat reading before you start a long task.", cited_ids: ["live:wbgt"] },
    ],
    rule: { text: "Stop work and tell your supervisor if you feel dizzy, sick or stop sweating.", cited_id: "kb:site-heat:p2" },
    grounded: true, handover_to_supervisor: true, proposed_action: null,
  },
  citations: [
    { id: "kb:site-heat:p2", kind: "doc", title: "Site heat plan", page: 2,
      snippet: "Stop work and tell your supervisor if you feel dizzy, sick or stop sweating.", review_status: "reviewed" },
    { id: "live:wbgt", kind: "live", title: "Site weather now", page: null,
      snippet: "Heat reading from the site weather snapshot.", review_status: null },
  ],
  photo: null, ...base,
};

export const askDegraded: Resp = { ...askAnsweredPrestart, status: "degraded", provider_served: "groq_b", fallback_used: "gemini" };
export const askNoEvidence: Resp = refusal("no_evidence");
export const askRateLimited: Resp = refusal("rate_limited");
export const askProviderDown: Resp = refusal("provider_down");
export const askInjection: Resp = refusal("injection_suspected");
export const askPolicy: Resp = refusal("policy_violation");

/** Every fixture, for the contract test. */
export const ASK_FIXTURES: Resp[] = [askAnsweredLeak, askAnsweredPrestart, askAnsweredHeat, askDegraded, askNoEvidence, askRateLimited, askProviderDown, askInjection, askPolicy];

const has = (q: string, re: RegExp) => re.test(q.toLowerCase());

/**
 * Deterministic demo routing by keyword, so a demo can show answered and refused. The 3 suggested
 * questions always answer. Order matters: guards first, then answers; no match means "no evidence".
 * A photo reading is only returned when a photo was sent (the fixture does not upload anything).
 */
export function pickAskFixture(req: Pick<AskRequest, "request_id" | "question" | "photo_path">): Resp {
  const q = req.question;
  let r: Resp;
  if (has(q, /ignore (all |the |previous )|system prompt|jailbreak|pretend you/)) r = askInjection;
  else if (has(q, /rate limit|too many questions/)) r = askRateLimited;
  else if (has(q, /provider down|spotter down|offline model/)) r = askProviderDown;
  else if (has(q, /bypass|disable the|switch off the|turn off the (alarm|seat)|override/)) r = askPolicy;
  else if (has(q, /backup model|degraded/)) r = askDegraded;
  else if (has(q, /leak|hydraul|oil spill|coolant|fuel/)) r = askAnsweredLeak;
  else if (has(q, /heat|\bhot\b|water break|wbgt|\bsun\b/)) r = askAnsweredHeat;
  else if (has(q, /before (i )?start|pre-?start|check|inspect|walk.?around|seat ?belt/)) r = askAnsweredPrestart;
  else r = askNoEvidence;
  return { ...r, request_id: req.request_id, photo: req.photo_path ? r.photo : null };
}
