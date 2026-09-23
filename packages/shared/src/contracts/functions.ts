/**
 * Edge Function contracts (api-contracts §6). Every function runs with `verify_jwt = false` and
 * authenticates in code (user JWT, director secret, Vault apikey, Telegram secret token, Twilio signature).
 */
import { z } from "zod";
import { Id, IncidentType, Lang, PhotoCategory, RequestId, Speed } from "./enums";

export const AskRequest = z.object({ request_id: RequestId, question: z.string().min(1).max(500), lang: Lang,
  photo_path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/).nullable(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1000) })).max(6) });
export const VisionResult = z.object({ category: PhotoCategory, confidence: z.number().min(0).max(1) });   // G2-13: nothing else is kept
export const Citation = z.object({ id: z.string(), kind: z.enum(["doc", "live"]), title: z.string(),
  page: z.number().int().nullable(), snippet: z.string().max(300),
  review_status: z.enum(["reviewed", "draft"]).nullable() });   // draft → "draft guidance, confirm with supervisor" (R2-3); null for live
export const AskAnswer = z.object({                     // model output, strict JSON schema via z.toJSONSchema
  steps: z.array(z.object({ text: z.string().max(200), cited_ids: z.array(z.string()).min(1) })).min(1).max(6),
  rule: z.object({ text: z.string().max(300), cited_id: z.string() }).nullable(),   // must quote a REVIEWED doc chunk verbatim (R2-3)
  grounded: z.boolean(), handover_to_supervisor: z.boolean(),
  proposed_action: z.object({ type: z.literal("log_incident"), incident_type: IncidentType,
    description: z.string().max(500) }).nullable() });
export const RefusalReason = z.enum(["no_evidence", "rule_not_verbatim", "citation_invalid", "rate_limited", "provider_down",
  "injection_suspected", "policy_violation"]);   // prompt guard / safeguard (EP §6)
export const ProviderServed = z.enum(["groq_a", "gemini", "groq_b", "none"]);
export const AskResponse = z.object({ request_id: RequestId,
  status: z.enum(["answered", "refused", "degraded"]),
  refusal_reason: RefusalReason.nullable(),
  answer: AskAnswer.nullable(), citations: z.array(Citation), photo: VisionResult.nullable(),
  provider_served: ProviderServed, model: z.string(),   // logged per request (D9)
  fallback_used: z.string().nullable(), latency_ms: z.number().int() });

export const DirectorCommand = z.discriminatedUnion("cmd", [
  z.object({ cmd: z.literal("new_run"), scenario_code: z.string(), speed: Speed, rehearsal: z.boolean() }),
  z.object({ cmd: z.literal("play") }),
  z.object({ cmd: z.literal("pause") }),
  z.object({ cmd: z.literal("set_speed"), speed: Speed }),
  z.object({ cmd: z.literal("jump_to"), sim_offset_ms: z.number().int().min(0) }),
  z.object({ cmd: z.literal("inject_frame"), kind: z.enum(["telemetry", "operator_state", "ppe", "fault"]),
    machine_code: z.string().nullable(), operator_code: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()) }),      // sensor input only; never an event
  z.object({ cmd: z.literal("manual_tick") }),
  z.object({ cmd: z.literal("ledger_checkpoint") }),
  z.object({ cmd: z.literal("demo_tamper"), seq: z.number().int(), mode: z.enum(["edit", "rehash"]) }),
  z.object({ cmd: z.literal("set_dry_run"), dry_run: z.boolean() }),
  z.object({ cmd: z.literal("purge_rehearsals") }),
]);
export const DirectorRequest = z.object({ request_id: RequestId, command: DirectorCommand });
export const DirectorResponse = z.object({ ok: z.boolean(), run_id: Id.nullable(), message: z.string().nullable() });

// demo-login (UI-9): no demo password ever reaches the browser. The function calls
// auth.admin.generateLink({ type: 'magiclink', email }) and returns its hashed token; the client calls
// supabase.auth.verifyOtp({ token_hash, type: 'email' }).
export const DemoPersona = z.enum(["ravi", "anita", "trainer"]);
export const DemoLoginRequest = z.object({ persona: DemoPersona });
export const DemoLoginResponse = z.object({ token_hash: z.string(), type: z.literal("email") });

export const DispatchRequest = z.object({ dispatch_id: Id });

export type AskRequest = z.infer<typeof AskRequest>;
export type AskResponse = z.infer<typeof AskResponse>;
export type AskAnswer = z.infer<typeof AskAnswer>;
export type DirectorCommand = z.infer<typeof DirectorCommand>;
