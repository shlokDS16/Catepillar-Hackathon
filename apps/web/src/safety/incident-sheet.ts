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

const locked = (s: IncidentState) => s.phase === "sending" || s.phase === "sent";

export function incidentReducer(s: IncidentState, a: IncidentAction): IncidentState {
  switch (a.type) {
    case "kind":
      return locked(s) ? s : { ...s, kind: a.kind };
    case "severity":
      return locked(s) ? s : { ...s, severity: a.severity };
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
      return { ...s, kind: a.draft.kind, severity: a.draft.severity, note: a.draft.note.slice(0, NOTE_MAX), requestId: a.draft.requestId };
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
  return {
    p_request_id: s.requestId,
    p_incident_type: s.kind,
    p_severity: s.severity,
    p_description: cleanNote(s.note),
    p_lat: place?.lat ?? null,
    p_lon: place?.lon ?? null,
    p_non_punitive: s.kind === "near_miss",
    p_source_event_id: null,
  };
}

/* ---------- draft persistence (sessionStorage, always in try/catch) ---------- */
export const DRAFT_KEY = "spotter.incident.draft.v1";
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isEmptyDraft(s: Pick<IncidentState, "kind" | "severity" | "note">): boolean {
  return s.kind === null && s.severity === null && s.note.trim() === "";
}

export function saveDraft(store: StorageLike | null, s: IncidentState): void {
  if (!store) return;
  try {
    if (s.phase === "sent" || isEmptyDraft(s)) store.removeItem(DRAFT_KEY);
    else store.setItem(DRAFT_KEY, JSON.stringify({ kind: s.kind, severity: s.severity, note: s.note, requestId: s.requestId } satisfies IncidentDraft));
  } catch {
    /* storage can be blocked or full: the draft then lives in memory only */
  }
}

export function loadDraft(store: StorageLike | null): IncidentDraft | null {
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
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
