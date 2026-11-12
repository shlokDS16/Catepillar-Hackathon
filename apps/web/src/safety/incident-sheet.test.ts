import { IncidentLogIn } from "@cat/shared";
import { describe, expect, it } from "vitest";
import {
  buildPayload,
  canSeal,
  clearDraft,
  cleanNote,
  DRAFT_KEY,
  incidentReducer,
  initialIncident,
  loadDraft,
  missingFields,
  NOTE_MAX,
  saveDraft,
  sendIncident,
  type IncidentAction,
  type IncidentState,
  type StorageLike,
} from "./incident-sheet";

const ID = "11111111-1111-4111-8111-111111111111";
const OWNER = "user-1";
const run = (actions: IncidentAction[], from = initialIncident(ID)) => actions.reduce(incidentReducer, from);
const filled = () => run([{ type: "kind", kind: "near_miss" }, { type: "severity", severity: 3 }]);

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe("severity and type", () => {
  it("takes 1, 3 or 5 and replaces the earlier choice", () => {
    expect(run([{ type: "severity", severity: 1 }, { type: "severity", severity: 5 }]).severity).toBe(5);
  });
  it("needs both a type and a severity before it sends", () => {
    expect(missingFields(initialIncident(ID))).toEqual(["kind", "severity"]);
    const s = run([{ type: "kind", kind: "first_aid" }, { type: "submit" }]);
    expect(s.phase).toBe("editing");
    expect(s.showMissing).toBe(true);
    expect(missingFields(s)).toEqual(["severity"]);
    expect(run([{ type: "submit" }], filled()).phase).toBe("sending");
  });
  it("trims the note to the cap", () => {
    expect(run([{ type: "note", note: "x".repeat(NOTE_MAX + 40) }]).note).toHaveLength(NOTE_MAX);
  });
});

describe("payload follows the incident_log contract", () => {
  it("a near miss is non-punitive; the others are not", () => {
    const place = { lat: 21.1463, lon: 79.0882 };
    expect(buildPayload(filled(), place).p_non_punitive).toBe(true);
    const damage = run([{ type: "kind", kind: "property_damage" }, { type: "severity", severity: 1 }]);
    expect(buildPayload(damage, place).p_non_punitive).toBe(false);
    expect(buildPayload(damage, place).p_incident_type).toBe("property_damage");
  });
  it("every kind and severity passes the shared schema, with and without a note or place", () => {
    for (const kind of ["near_miss", "first_aid", "property_damage", "manual"] as const) {
      for (const severity of [1, 3, 5] as const) {
        if (kind === "near_miss" && severity === 5) continue; // not allowed, see "an injury is never sealed"
        for (const note of ["", "Reversing truck, 5 m.\nSecond line"]) {
          const s = run([{ type: "kind", kind }, { type: "severity", severity }, { type: "note", note }]);
          expect(IncidentLogIn.safeParse(buildPayload(s, null)).success).toBe(true);
          expect(IncidentLogIn.safeParse(buildPayload(s, { lat: 1, lon: 2 })).success).toBe(true);
        }
      }
    }
  });
  it("an empty note is null (the server writes the type label) and control characters are removed", () => {
    expect(cleanNote("   \n ")).toBeNull();
    expect(buildPayload(filled(), null).p_description).toBeNull();
    expect(cleanNote("a\nb\tc")).toBe("a b c");
  });
  it("refuses to build from an incomplete draft", () => {
    expect(() => buildPayload(initialIncident(ID), null)).toThrow();
  });
});

describe("an injury is never sealed", () => {
  it("level 5 cannot be chosen for a near miss, and a near miss cannot be chosen for level 5", () => {
    const nm = run([{ type: "kind", kind: "near_miss" }, { type: "severity", severity: 5 }]);
    expect(nm.severity).toBeNull();
    const inj = run([{ type: "severity", severity: 5 }, { type: "kind", kind: "near_miss" }]);
    expect(inj.kind).toBeNull();
    expect(run([{ type: "severity", severity: 5 }, { type: "kind", kind: "first_aid" }]).kind).toBe("first_aid");
  });
  it("no kind and severity combination sends p_non_punitive=true with level 5", () => {
    for (const kind of ["near_miss", "first_aid", "property_damage", "manual"] as const) {
      const s: IncidentState = { ...initialIncident(ID), kind, severity: 5 };
      if (kind === "near_miss") expect(() => buildPayload(s, null)).toThrow();
      else expect(buildPayload(s, null).p_non_punitive).toBe(false);
    }
  });
  it("harm is never sealed: first_aid, sos and severity 5 all refuse non_punitive", () => {
    for (const kind of ["first_aid", "sos"] as const)
      for (const severity of [1, 3, 5] as const) {
        expect(canSeal(kind, severity)).toBe(false);
        const s = { ...initialIncident(ID), kind, severity } as unknown as IncidentState;
        expect(buildPayload(s, null).p_non_punitive).toBe(false);
      }
    for (const severity of [1, 3] as const) expect(canSeal("near_miss", severity)).toBe(true);
    expect(canSeal("near_miss", 5)).toBe(false);
    expect(buildPayload(run([{ type: "kind", kind: "near_miss" }, { type: "severity", severity: 3 }]), null).p_non_punitive).toBe(true);
  });
  it("a near miss with first_aid or sos hand-built into the state is refused by the reducer path and the payload", () => {
    // The reducer cannot hold two kinds: choosing first_aid replaces near_miss, so it is never sealed.
    const swapped = run([{ type: "kind", kind: "near_miss" }, { type: "severity", severity: 1 }, { type: "kind", kind: "first_aid" }]);
    expect(swapped.kind).toBe("first_aid");
    expect(buildPayload(swapped, null).p_non_punitive).toBe(false);
    const forged = { ...initialIncident(ID), kind: "near_miss", severity: 5 } as IncidentState;
    expect(() => buildPayload(forged, null)).toThrow();
  });
  it("a restored near-miss draft at level 5 loses its severity", () => {
    const s = run([{ type: "restore", draft: { kind: "near_miss", severity: 5, note: "", requestId: ID } }]);
    expect(s.severity).toBeNull();
  });
});

describe("failure keeps the draft and retry reuses the request id", () => {
  it("failed keeps every field; submit again sends the same request id", async () => {
    let s: IncidentState = run([{ type: "note", note: "Slipped near the ramp" }], filled());
    const seen: string[] = [];
    let fail = true;
    const dispatch = (a: IncidentAction) => (s = incidentReducer(s, a));
    const log = async (input: { p_request_id: string }) => {
      seen.push(input.p_request_id);
      if (fail) throw new Error("offline");
      return { event_id: "evt-1" };
    };
    dispatch({ type: "submit" });
    await sendIncident(s, null, log, dispatch, () => "network");
    expect(s.phase).toBe("failed");
    expect(s).toMatchObject({ kind: "near_miss", severity: 3, note: "Slipped near the ramp", error: "network" });

    fail = false;
    dispatch({ type: "submit" });
    expect(s.phase).toBe("sending");
    expect(s.error).toBeNull();
    await sendIncident(s, null, log, dispatch, () => "network");
    expect(s.phase).toBe("sent");
    expect(s.eventId).toBe("evt-1");
    expect(seen).toEqual([ID, ID]);
  });
  it("a second press while sending, and edits while sending or after sent, change nothing", () => {
    const sending = run([{ type: "submit" }], filled());
    expect(run([{ type: "submit" }, { type: "note", note: "late" }, { type: "kind", kind: "manual" }], sending)).toEqual(sending);
    const sent = run([{ type: "sent", eventId: "e" }], sending);
    expect(run([{ type: "submit" }, { type: "severity", severity: 5 }], sent)).toEqual(sent);
  });
  it("reset starts a new draft with a new request id", () => {
    expect(run([{ type: "reset", requestId: "new" }], filled())).toEqual(initialIncident("new"));
  });
});

describe("draft in sessionStorage", () => {
  it("saves while editing and restores into an untouched sheet, request id included", () => {
    const store = memory();
    const s = run([{ type: "note", note: "wet floor" }], filled());
    saveDraft(store, OWNER, s);
    const draft = loadDraft(store, OWNER);
    expect(draft).toEqual({ kind: "near_miss", severity: 3, note: "wet floor", requestId: ID });
    const restored = run([{ type: "restore", draft: draft! }], initialIncident("other"));
    expect(restored).toMatchObject({ kind: "near_miss", severity: 3, note: "wet floor", requestId: ID, phase: "editing" });
  });
  it("keeps a failed draft, and a restore never overwrites what is already typed", () => {
    const store = memory();
    const failed = run([{ type: "submit" }, { type: "failed", code: "network" }], filled());
    saveDraft(store, OWNER, failed);
    expect(store.data.has(DRAFT_KEY)).toBe(true);
    const typing = run([{ type: "note", note: "mine" }]);
    expect(run([{ type: "restore", draft: loadDraft(store, OWNER)! }], typing)).toEqual(typing);
  });
  it("is cleared after a send and when the draft is empty", () => {
    const store = memory();
    saveDraft(store, OWNER, filled());
    expect(store.data.has(DRAFT_KEY)).toBe(true);
    saveDraft(store, OWNER, run([{ type: "submit" }, { type: "sent", eventId: "e" }], filled()));
    expect(store.data.has(DRAFT_KEY)).toBe(false);
    saveDraft(store, OWNER, filled());
    saveDraft(store, OWNER, initialIncident(ID));
    expect(store.data.has(DRAFT_KEY)).toBe(false);
  });
  it("never shows one user's draft to another, and deletes it", () => {
    const store = memory();
    saveDraft(store, OWNER, filled());
    expect(loadDraft(store, "user-2")).toBeNull();
    expect(store.data.has(DRAFT_KEY)).toBe(false);
    saveDraft(store, OWNER, filled());
    clearDraft(store);
    expect(loadDraft(store, OWNER)).toBeNull();
  });
  it("survives blocked storage and a corrupt entry", () => {
    const deny = () => {
      throw new Error("denied");
    };
    const blocked: StorageLike = { getItem: deny, setItem: deny, removeItem: deny };
    expect(() => saveDraft(blocked, OWNER, filled())).not.toThrow();
    expect(loadDraft(blocked, OWNER)).toBeNull();
    expect(loadDraft(null, OWNER)).toBeNull();
    const store = memory();
    store.setItem(DRAFT_KEY, "{not json");
    expect(loadDraft(store, OWNER)).toBeNull();
    store.setItem(DRAFT_KEY, JSON.stringify({ kind: "bogus", severity: 4, note: "", requestId: ID }));
    expect(loadDraft(store, OWNER)).toBeNull();
  });
});
