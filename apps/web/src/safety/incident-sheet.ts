import type { IncidentLogIn } from "@cat/shared";
import type { z } from "zod";

/**
 * The A13 incident sheet as a pure reducer (interaction-map §4.4): type, how serious (1/3/5), an
 * optional note, [Log incident]. The draft is kept on failure and across a reload (sessionStorage);
 * the request_id is made once per draft and reused on every retry (interaction-map §3).
 */
export type IncidentKind = "near_miss" | "first_aid" | "property_damage" | "manual";
export const INCIDENT_KINDS: readonly IncidentKind[] = ["near_miss", "first_aid", "property_damage", "manual"];
export type Severity = 1 | 3 | 5;
export const SEVERITIES: readonly Severity[] = [1, 3, 5];
export const NOTE_MAX = 280;

export type IncidentPhase = "editing" | "sending" | "failed" | "sent";
export type IncidentState = {
  kind: IncidentKind | null;
  severity: Severity | null;
  note: string;
  requestId: string;
  phase: IncidentPhase;
  /** Set once the person pressed the button with something missing, so the sheet shows what. */
  showMissing: boolean;
  /** RpcError code or "network" after a failed send. */
  error: string | null;
  eventId: string | null;
};

export type IncidentDraft = { kind: IncidentKind | null; severity: Severity | null; note: string; requestId: string };
/** What is stored: the draft plus the user it belongs to, so a shared phone never shows it to someone else. */
type StoredDraft = IncidentDraft & { owner: string };

export type IncidentAction =
  | { type: "kind"; kind: IncidentKind }
  | { type: "severity"; severity: Severity }
  | { type: "note"; note: string }
  | { type: "submit" }
  | { type: "failed"; code: string }
  | { type: "sent"; eventId: string }
  | { type: "restore"; draft: IncidentDraft }
  | { type: "reset"; requestId: string };

export function initialIncident(requestId: string): IncidentState {
  return { kind: null, severity: null, note: "", requestId, phase: "editing", showMissing: false, error: null, eventId: null };
}

export function missingFields(s: Pick<IncidentState, "kind" | "severity">): Array<"kind" | "severity"> {
  const out: Array<"kind" | "severity"> = [];
  if (s.kind === null) out.push("kind");
  if (s.severity === null) out.push("severity");
  return out;
}

/**
 * Harm is never sealed (migration 003h, data-model 2.10): an incident of type first_aid or sos, or of
 * severity 5, always goes to the supervisor. So a near miss (non_punitive) is impossible with any of
 * them. The sheet disables the near-miss choice, and the severity 5 choice while near miss is chosen,
 * and says why; the reducer and the payload enforce it as well.
 */
const HARM_KINDS: readonly string[] = ["first_aid", "sos"];
export const isInjury = (severity: Severity | null) => severity === 5;
export const isHarm = (kind: string | null, severity: Severity | null) => (kind !== null && HARM_KINDS.includes(kind)) || isInjury(severity);
/** May this combination be sealed (p_non_punitive=true)? Only a near miss with no harm. */
export const canSeal = (kind: string | null, severity: Severity | null) => kind === "near_miss" && !isHarm(kind, severity);
export const kindAllowed = (kind: IncidentKind, severity: Severity | null) => !(kind === "near_miss" && isHarm(kind, severity));
export const severityAllowed = (severity: Severity, kind: IncidentKind | null) => !(kind === "near_miss" && isHarm(kind, severity));

const locked = (s: IncidentState) => s.phase === "sending" || s.phase === "sent";

export function incidentReducer(s: IncidentState, a: IncidentAction): IncidentState {
  switch (a.type) {
    case "kind":
      return locked(s) || !kindAllowed(a.kind, s.severity) ? s : { ...s, kind: a.kind };
    case "severity":
      return locked(s) || !severityAllowed(a.severity, s.kind) ? s : { ...s, severity: a.severity };
    case "note":
      return locked(s) ? s : { ...s, note: a.note.slice(0, NOTE_MAX) };
    case "submit":
      // Pressing again while sending, or after it was sent, changes nothing (one request per intent).
      if (locked(s)) return s;
      if (missingFields(s).length > 0) return { ...s, showMissing: true };
      return { ...s, phase: "sending", error: null, showMissing: false };
    case "failed":
      return s.phase === "sending" ? { ...s, phase: "failed", error: a.code } : s;
    case "sent":
      return s.phase === "sending" ? { ...s, phase: "sent", error: null, eventId: a.eventId } : s;
    case "restore":
      // A restored draft only fills a sheet nobody has touched yet.
      if (s.phase !== "editing" || s.kind !== null || s.severity !== null || s.note !== "") return s;
      // A stored draft that breaks the injury rule loses its severity, so the person must choose again.
      return { ...s, kind: a.draft.kind, severity: !kindAllowed(a.draft.kind ?? "manual", a.draft.severity) ? null : a.draft.severity, note: a.draft.note.slice(0, NOTE_MAX), requestId: a.draft.requestId };
    case "reset":
      return initialIncident(a.requestId);
  }
}

/** Control characters are rejected by the contract (rule 4), so a newline becomes a space. */
export function cleanNote(note: string): string | null {
  const cleaned = note.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, NOTE_MAX);
  return cleaned === "" ? null : cleaned;
}

export type Place = { lat: number; lon: number } | null;

/** The `incident_log` arguments, exactly as the contract has them. A null note gets the type label server-side (UI-15). */
export function buildPayload(s: IncidentState, place: Place): z.input<typeof IncidentLogIn> {
  if (s.kind === null || s.severity === null) throw new Error("incident draft is incomplete");
  if (!kindAllowed(s.kind, s.severity)) throw new Error("an injury cannot be reported as a near miss");
  // Belt and braces for a hand-built state: harm is never sealed, whatever the type says.
  if (s.kind === "near_miss" && isHarm(s.kind, s.severity)) throw new Error("harm is never sealed");
  return {
    p_request_id: s.requestId,
    p_incident_type: s.kind,
    p_severity: s.severity,
    p_description: cleanNote(s.note),
    p_lat: place?.lat ?? null,
    p_lon: place?.lon ?? null,
    p_non_punitive: canSeal(s.kind, s.severity),
    p_source_event_id: null,
  };
}

/* ---------- draft persistence (sessionStorage, always in try/catch) ---------- */
export const DRAFT_KEY = "spotter.incident.draft.v1";
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isEmptyDraft(s: Pick<IncidentState, "kind" | "severity" | "note">): boolean {
  return s.kind === null && s.severity === null && s.note.trim() === "";
}

export function saveDraft(store: StorageLike | null, owner: string, s: IncidentState): void {
  if (!store) return;
  try {
    if (s.phase === "sent" || isEmptyDraft(s)) store.removeItem(DRAFT_KEY);
    else store.setItem(DRAFT_KEY, JSON.stringify({ owner, kind: s.kind, severity: s.severity, note: s.note, requestId: s.requestId } satisfies StoredDraft));
  } catch {
    /* storage can be blocked or full: the draft then lives in memory only */
  }
}

/** Sign-out: nothing of the last person's report may stay behind. */
export function clearDraft(store: StorageLike | null): void {
  try {
    store?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function loadDraft(store: StorageLike | null, owner: string): IncidentDraft | null {
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v.owner !== owner) {
      store.removeItem(DRAFT_KEY); // someone else's draft is deleted, never shown
      return null;
    }
    const kind = INCIDENT_KINDS.includes(v.kind as IncidentKind) ? (v.kind as IncidentKind) : null;
    const severity = SEVERITIES.includes(v.severity as Severity) ? (v.severity as Severity) : null;
    const note = typeof v.note === "string" ? v.note.slice(0, NOTE_MAX) : "";
    const requestId = typeof v.requestId === "string" && v.requestId.length > 0 ? v.requestId : null;
    if (requestId === null || isEmptyDraft({ kind, severity, note })) return null;
    return { kind, severity, note, requestId };
  } catch {
    return null;
  }
}

export function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * One send attempt. The caller dispatches `submit` first (state is then "sending"); this builds the
 * payload from that state, so a retry after "failed" carries the same request_id and the same fields.
 */
export async function sendIncident(
  state: IncidentState,
  place: Place,
  log: (input: z.input<typeof IncidentLogIn>) => Promise<{ event_id: string }>,
  dispatch: (a: IncidentAction) => void,
  errorCode: (e: unknown) => string,
): Promise<void> {
  try {
    const out = await log(buildPayload(state, place));
    dispatch({ type: "sent", eventId: out.event_id });
  } catch (e) {
    dispatch({ type: "failed", code: errorCode(e) });
  }
}
