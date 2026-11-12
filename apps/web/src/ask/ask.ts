import { AskResponse, type AskRequest } from "@cat/shared";
import { ASK_FIXTURE_MODEL } from "@cat/shared/fixtures";
import { initialIncident, INCIDENT_KINDS, NOTE_MAX, type IncidentKind, type IncidentState } from "@/safety/incident-sheet";

/** Pure helpers for Ask Spotter (S6; interaction-map A17, A18). No React here, so all of it is unit-tested. */

export const QUESTION_MAX = 500;
export const PHOTO_MAX_PX = 1600;
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

type Refusal = NonNullable<AskResponse["refusal_reason"]>;
/** Keys under `ask.refusal.*` in the message files. */
export type RefusalCopy = "noAnswer" | "rateLimited" | "providerDown" | "cantAnswer";

/** A17: the copy by `refusal_reason`. Three reasons share "no answer in the manuals". */
export function refusalCopyKey(reason: Refusal | null): RefusalCopy {
  switch (reason) {
    case "rate_limited":
      return "rateLimited";
    case "provider_down":
      return "providerDown";
    case "injection_suspected":
    case "policy_violation":
      return "cantAnswer";
    case "no_evidence":
    case "rule_not_verbatim":
    case "citation_invalid":
    case null:
      return "noAnswer";
  }
}

/** The fixture adapter answered: the sheet must caption it so nobody mistakes it for a live model. */
export const isDemoAnswer = (r: Pick<AskResponse, "model">) => r.model === ASK_FIXTURE_MODEL;

/** A refusal that came from the network side (no function deployed, offline) rather than from the model. */
export function providerDownResponse(requestId: string): AskResponse {
  return { request_id: requestId, status: "refused", refusal_reason: "provider_down", answer: null, citations: [], photo: null,
    provider_served: "none", model: "none", fallback_used: null, latency_ms: 0 };
}

type Invoke = (name: "ask", body: { body: AskRequest }) => Promise<{ data: unknown; error: unknown }>;

/**
 * The Supabase adapter's `ask`: `functions.invoke("ask", ...)`. There is NO deployed `ask` function yet,
 * so any failure (404, network, a body that does not parse) becomes a `provider_down` refusal, never a throw.
 */
export async function askViaFunctions(invoke: Invoke, input: AskRequest): Promise<AskResponse> {
  try {
    const { data, error } = await invoke("ask", { body: input });
    if (error) return providerDownResponse(input.request_id);
    const parsed = AskResponse.safeParse(data);
    return parsed.success ? parsed.data : providerDownResponse(input.request_id);
  } catch {
    return providerDownResponse(input.request_id);
  }
}

/** A18: A13's draft from `proposed_action`. The model never sets severity or writes; the operator completes and confirms. */
export function incidentFromProposal(action: { incident_type: string; description: string }, requestId: string): IncidentState {
  const kind: IncidentKind | null = INCIDENT_KINDS.includes(action.incident_type as IncidentKind) ? (action.incident_type as IncidentKind) : null;
  return { ...initialIncident(requestId), kind, note: action.description.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, NOTE_MAX) };
}

/** The 1-based numbers of the citations a step cites, in citation order, so marks read [1] [2]. */
export function citeNumbers(citedIds: readonly string[], citations: readonly { id: string }[]): number[] {
  return citedIds.map((id) => citations.findIndex((c) => c.id === id) + 1).filter((n) => n > 0);
}

export const confidencePct = (c: number) => Math.round(c * 100);

/** Longest side at most `max` px, aspect kept, never upscaled. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_PX): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const canAsk = (question: string, busy: boolean, offline: boolean) =>
  !busy && !offline && question.trim().length >= 1 && question.length <= QUESTION_MAX;

/** Client-side compress to a JPEG with the longest side at most 1,600 px (A17). Browser only. */
export async function compressPhoto(file: File): Promise<Blob> {
  if (file.size > PHOTO_MAX_BYTES) throw new Error("photo too large");
  const bmp = await createImageBitmap(file);
  const { width, height } = fitWithin(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress failed"))), "image/jpeg", 0.8));
}
