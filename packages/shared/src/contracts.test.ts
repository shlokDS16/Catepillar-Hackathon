import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ALERT_POLICIES, AlertKind, AnyEvent, AnomalyType, AskAnswer, CONTRACTS_VERSION, EVENT_REGISTRY, EVENT_TYPES,
  EXPLANATION_TEMPLATES, EventSource, MODEL_V1, ORGANISER_HEADERS, SQL_ENUMS, WITNESS_LINE, estimateEta, eventSchema,
  renderExplanation, templateSlots } from "./index";
import { FIXTURES, seatbeltBreachEvent } from "./fixtures/index";

/** Overwrites the value at a dotted path with something no field accepts (an object with a marker key). */
function breakAt(value: unknown, path: string): unknown {
  const copy = structuredClone(value) as Record<string, unknown>;
  const parts = path.split(".");
  let node: Record<string, unknown> = copy;
  for (const p of parts.slice(0, -1)) node = node[p] as Record<string, unknown>;
  node[parts[parts.length - 1]] = { __broken: true };
  return copy;
}

describe("fixtures", () => {
  it("has one fixture per event type plus the RPC, function, realtime and content schemas", () => {
    const names = FIXTURES.map((f) => f.name);
    for (const t of EVENT_TYPES) expect(names).toContain(`event.${t}`);
    expect(new Set(names).size).toBe(names.length);
    expect(FIXTURES.length).toBeGreaterThanOrEqual(47 + 45);
  });
  for (const f of FIXTURES) {
    it(`${f.name}: parses losslessly, and breaking "${f.broken}" fails`, () => {
      const parsed = f.schema.safeParse(f.value);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(parsed.data).toEqual(f.value);   // no key dropped, no default injected: the fixture is the wire shape
      expect(f.schema.safeParse(breakAt(f.value, f.broken)).success).toBe(false);
    });
  }
});

describe("registry", () => {
  it("is frozen at v1.0.0 with 47 event types", () => {
    expect(CONTRACTS_VERSION).toBe("1.0.0");
    expect(EVENT_TYPES.length).toBe(47);
  });
  it("every alert_kind in the registry has a policy, and the policies cover exactly AlertKind", () => {
    for (const [type, m] of Object.entries(EVENT_REGISTRY)) {
      if (m.alert_kind) expect(ALERT_POLICIES[m.alert_kind], type).toBeDefined();
      expect(m.audiences.length).toBeGreaterThan(0);
    }
    expect(Object.keys(ALERT_POLICIES).sort()).toEqual([...AlertKind.options].sort());
  });
  it("only info/caution kinds are rate-capped; SOS never deduplicates", () => {
    for (const p of Object.values(ALERT_POLICIES)) if (p.rate_capped) expect(["info", "caution"]).toContain(p.tier_default);
    expect(ALERT_POLICIES.sos.dedupe_window_s).toBeNull();
    expect(ALERT_POLICIES.sos.ack_timeout_s).toBe(60);
    expect(ALERT_POLICIES.sos.notify_now).toEqual(["supervisor_telegram"]);
    expect(ALERT_POLICIES.sos.escalate_to).toEqual(["supervisor_call"]);
  });
  it("ledger and Loop flags match the design", () => {
    const ledger = EVENT_TYPES.filter((t) => EVENT_REGISTRY[t].ledger).sort();
    expect(ledger).toEqual(["guardian.hazard_near_operator", "incident.reported", "ppe.override_granted", "safety.seatbelt_breach", "sos.raised"]);
    expect(EVENT_TYPES.filter((t) => EVENT_REGISTRY[t].replay)).toEqual(["safety.seatbelt_breach"]);
    expect(EVENT_TYPES.filter((t) => EVENT_REGISTRY[t].lesson_code).sort()).toEqual(["guardian.hazard_near_operator", "safety.seatbelt_breach"]);
  });
  it("AnyEvent accepts a registered event, rejects an unknown type and a payload of another type", () => {
    expect(AnyEvent.safeParse(seatbeltBreachEvent).success).toBe(true);
    expect(AnyEvent.safeParse({ ...seatbeltBreachEvent, type: "safety.unknown" }).success).toBe(false);
    expect(AnyEvent.safeParse({ ...seatbeltBreachEvent, payload: { frame_seq: "x" } }).success).toBe(false);
    expect(AnyEvent.safeParse({ ...seatbeltBreachEvent, type: "sos.raised" }).success).toBe(false);   // seatbelt payload under sos
    const typed = eventSchema("safety.seatbelt_breach").parse(seatbeltBreachEvent);
    expect(typed.payload.pitch_deg).toBe(17.4);   // compile-time: payload is SeatbeltBreach, not a union
  });
  it("SQL_ENUMS covers every enum the data model generates, in the contract order", () => {
    expect(Object.keys(SQL_ENUMS)).toEqual(["app_role", "audience", "alert_tier", "skill_level", "task_type", "task_status",
      "weather_kind", "fault_severity", "run_status", "frame_kind", "alert_status", "ack_via", "dispatch_channel", "dispatch_status",
      "suppress_reason", "incident_type", "lang", "ppe_item", "proximity_zone", "anomaly_type", "alert_kind", "photo_category", "machine_health"]);
    expect(SQL_ENUMS.anomaly_type.options).toEqual(AnomalyType.options);
    expect(EventSource.options).toContain("detector.rule");   // events.source is a checked text column (dots are not enum-friendly), not a SQL enum
  });
});

describe("AskAnswer JSON schema (strict output for Groq; B19 verifies live and strips unsupported keywords)", () => {
  it("matches the snapshot", () => {
    expect(z.toJSONSchema(AskAnswer)).toMatchSnapshot();
  });
});

describe("explanation templates", () => {
  it("en and hi use identical slot names for every anomaly type", () => {
    for (const t of AnomalyType.options) {
      const tpl = EXPLANATION_TEMPLATES[t];
      expect(templateSlots(tpl.en).sort(), t).toEqual(templateSlots(tpl.hi).sort());
      expect(templateSlots(tpl.en)).toContain("machine");
    }
  });
  it("renders by named slot (the same substitution the SQL does)", () => {
    const en = renderExplanation(EXPLANATION_TEMPLATES.idle_excess.en, { machine: "EXC-007", idle_pct: 58, ratio: "2.3", fuel_l: 14, cost_inr: "1,290" });
    expect(en).toBe("EXC-007 idled 58% of the last hour, 2.3× its normal. About 14 L of diesel (≈ ₹1,290).");
  });
});

describe("provenance", () => {
  it("lists exactly the 9 + 7 organiser headers", () => {
    expect(ORGANISER_HEADERS.telemetry.length).toBe(9);
    expect(ORGANISER_HEADERS.task_history.length).toBe(7);
  });
});

describe("ETA model", () => {
  it("is pure, returns one factor per band and a P90 above P50", () => {
    const input = { task_type: "excavation" as const, weather: "hot" as const, operator_skill: "novice" as const,
      machine_age_years: 7, temperature_c: 41, wind_kmh: 12, shift_hour: 14 };
    const e = estimateEta(input);
    expect(e.factors.map((f) => f.key)).toEqual(["weather:hot", "skill:novice", "age:5to10", "heat:extreme", "wind:calm", "circadian:post_lunch_dip"]);
    expect(e.factors.filter((f) => f.assumed).map((f) => f.key)).toEqual(["circadian:post_lunch_dip"]);   // only the synthetic shift hour
    expect(e.p90_min).toBeGreaterThan(e.p50_min);
    expect(e.model_version).toBe(MODEL_V1.version);
    expect(estimateEta(input)).toEqual(e);
    expect(estimateEta({ task_type: "grading", weather: "clear", operator_skill: "intermediate", machine_age_years: 1,
      temperature_c: null, wind_kmh: null, shift_hour: null })).toEqual({ p50_min: 60, p90_min: 71.8, model_version: MODEL_V1.version,
      factors: [{ key: "weather:clear", multiplier: 1, assumed: false }, { key: "skill:intermediate", multiplier: 1, assumed: false },
        { key: "age:lt5", multiplier: 1, assumed: false }] });
  });
});

describe("witness line", () => {
  it("parses the Telegram checkpoint line", () => {
    const line = "SPOTTER-LEDGER v1 seq=1..214 n=214 root=" + "a".repeat(64) + " head=" + "b".repeat(64) + " at=14:02 IST";
    const m = line.match(WITNESS_LINE);
    expect(m).not.toBeNull();
    expect([m![1], m![2], m![3]]).toEqual(["1", "214", "214"]);
    expect("SPOTTER-LEDGER v1 seq=1..214 root=abc".match(WITNESS_LINE)).toBeNull();
  });
});
