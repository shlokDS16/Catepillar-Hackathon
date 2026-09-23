# API contracts (`@cat/shared`): freeze these first

Status: Proposed v1.0.0 with ADR-001. Owner: Track B. Consumer: Track F (`apps/web`), later
`apps/mobile`. Task B1 turns this document into code under `packages/shared/src/contracts/` and
freezes it. Markers: **[V]** verified today, **[A]** assumption, **[U]** unverified.

Library facts used [V] context7 `/colinhacks/zod` (package.json pins `zod ^4.6.5`): Zod 4 top-level
formats `z.uuid()`, `z.iso.datetime({ offset: true })`, `z.url()` (the `z.string().uuid()` /
`.url()` methods are deprecated); `z.record()` takes a key schema and a value schema, and with an enum
key it requires every key (`z.partialRecord()` for optional keys);
`z.toJSONSchema()` converts a schema (used to give Groq a strict JSON schema).

## 0. Freeze rules

1. `CONTRACTS_VERSION = "1.0.0"`. After the freeze (end of task B1), changes are **additive only**
   (new optional field, new event type, new RPC). A breaking change needs a major bump, a line in
   `docs/project-memory/decisions.md`, and an acknowledgement from Track F.
2. Every schema here has a Postgres twin (enum, table, function signature). Task B2 seeds
   `event_types` from `EVENT_TYPES`, so the DB and the contracts cannot drift.
3. Track F never hand-writes a type for backend data: it imports from `@cat/shared` and codes against
   `fixtures/` until integration point IP1 (`backend-tasks.md` §3).
4. Wire format: snake_case keys (what PostgREST and `realtime.send(to_jsonb(row))` produce). RPC
   argument names are the SQL parameter names (prefix `p_`).
5. Postgres `numeric` arrives as a JSON number through PostgREST [A: confirm in B2 for large values];
   money and hashes are strings.

## 1. File layout (`packages/shared/src/`)

```
index.ts                 re-exports everything below + existing sync.ts
contracts/version.ts     CONTRACTS_VERSION
contracts/enums.ts       enums mirrored from Postgres
contracts/events.ts      EVENT_TYPES, EventEnvelope, payload schemas, AnyEvent (discriminated union)
contracts/rpc.ts         input/output schemas for every RPC (§4)
contracts/functions.ts   Edge Function request/response schemas (§5)
contracts/realtime.ts    topic builders + broadcast event names (§6)
contracts/assumed.ts     ASSUMED_FIELDS per table (drives the "assumed" chip)
eta/model.ts, eta/model.v1.json   ETA pure function + fitted coefficients (§7)
ledger/canonical.ts      TS mirror of canonical v1 (evidence script + golden tests only)
fixtures/*.json          one valid example per schema (Track F mocks; also the contract tests)
```

## 2. Enums (`contracts/enums.ts`)

```ts
import { z } from "zod";

export const AppRole = z.enum(["operator", "fleet_manager", "trainer"]);
export const AlertTier = z.enum(["info", "caution", "warning", "critical"]);
export const SkillLevel = z.enum(["novice", "intermediate", "expert"]);
export const TaskType = z.enum(["excavation", "trenching", "material_loading", "grading", "demolition"]);
export const TaskStatus = z.enum(["planned", "in_progress", "paused", "completed", "cancelled", "blocked_ppe"]);
export const WeatherKind = z.enum(["clear", "hot", "rain", "windy", "cold", "fog", "dust"]);
export const FaultSeverity = z.enum(["info", "caution", "derate", "shutdown"]);
export const RunStatus = z.enum(["ready", "playing", "paused", "finished"]);
export const Speed = z.union([z.literal(1), z.literal(10), z.literal(60)]);
export const AlertStatus = z.enum(["open", "acknowledged", "escalating", "escalated", "resolved", "suppressed"]);
export const AckVia = z.enum(["app", "telegram", "twilio_keypress", "sensor"]);
export const DispatchChannel = z.enum(["telegram", "twilio_voice"]);
export const DispatchStatus = z.enum(["queued", "sending", "sent", "delivered", "answered", "no_answer", "failed", "suppressed", "dry_run"]);
export const IncidentType = z.enum(["seatbelt_breach", "guardian_hazard", "sos", "ppe_override", "near_miss",
  "first_aid", "property_damage", "manual", "correction"]);
export const Visibility = z.enum(["operator", "site", "supervisor"]);
export const Lang = z.enum(["en", "hi", "ta"]);
export const PpeItem = z.enum(["helmet", "vest", "boots", "gloves"]);
export const ProximityZone = z.enum(["awareness", "warning", "danger"]);
export const AnomalyType = z.enum(["idle_excess", "seatbelt_off_moving", "overspeed", "slope_exceeded",
  "cold_overrev", "harsh_operation", "warning_ignored", "fault_continued_operation",
  "hydraulic_temp_drift", "coolant_temp_drift", "fuel_rate_drift"]);
export const AlertKind = z.enum(["seatbelt_off_moving", "guardian_hazard", "proximity_zone", "ppe_missing",
  "anomaly_machine", "idle_excess", "sos", "ledger_tamper"]);
```

Common scalars:
```ts
export const Id = z.uuid();
export const Ts = z.iso.datetime({ offset: true });
export const Hash64 = z.string().regex(/^[0-9a-f]{64}$/);
export const RequestId = z.uuid();              // client-generated per user action (idempotency)
export const LatLon = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
export const I18nText = z.object({ en: z.string(), hi: z.string().optional(), ta: z.string().optional() });
```

## 3. Events (`contracts/events.ts`)

```ts
export const EventEnvelopeBase = z.object({
  id: Id,
  seq: z.number().int().positive(),
  run_id: Id.nullable(),
  type: z.string(),
  tier: AlertTier.nullable(),
  sim_ts: Ts.nullable(),
  recorded_at: Ts,
  site_id: Id.nullable(),
  machine_id: Id.nullable(),
  operator_id: Id.nullable(),
  task_id: Id.nullable(),
  alert_id: Id.nullable(),
  visibility: Visibility,
  source: z.enum(["detector.rule", "detector.ewma", "guardian", "user", "director", "system",
                  "telegram", "twilio", "loader"]),
  correlation_id: Id.nullable(),
  causation_id: Id.nullable(),
  idempotency_key: z.string().min(3).max(200),
});

const ev = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  EventEnvelopeBase.extend({ type: z.literal(type), payload });

// Payloads (numbers only where the UI renders localized text)
export const SeatbeltBreach = z.object({ frame_seq: z.number().int(), speed_kmh: z.number(),
  pitch_deg: z.number(), roll_deg: z.number(), slope_limit_deg: z.number(), zone_id: Id.nullable() });
export const AnomalyDetected = z.object({ anomaly_id: Id, anomaly_type: AnomalyType,
  method: z.enum(["rule", "ewma", "fleet_z"]), severity_score: z.number().int().min(0).max(100),
  features: z.record(z.string(), z.number()) });   // e.g. idle_pct, ratio_to_normal, fuel_l, cost_inr
export const GuardianHazard = z.object({ anomaly_id: Id, machine_code: z.string(),
  distance_m: z.number(), bearing_deg: z.number(), wind_from_deg: z.number().nullable(),
  zone: ProximityZone, protocol_card_id: z.string() });
export const AlertRaised = z.object({ alert_id: Id, kind: AlertKind, tier: AlertTier,
  needs_ack: z.boolean(), escalate_at: Ts.nullable(), occurrences: z.number().int(),
  protocol_card_id: z.string().nullable() });
export const AlertAcknowledged = z.object({ alert_id: Id, via: AckVia, by_role: AppRole.nullable() });
export const AlertEscalated = z.object({ alert_id: Id, level: z.number().int(), to: z.string() });
export const AlertSuppressed = z.object({ alert_id: Id, reason: z.enum(["dedupe", "lower_tier",
  "rate_cap", "catch_up"]), suppressed_by: Id.nullable() });
export const DispatchUpdate = z.object({ dispatch_id: Id, channel: DispatchChannel, status: DispatchStatus,
  reason: z.enum(["motion_lock", "call_cooldown", "dry_run", "provider_error", "no_answer"]).nullable() });
export const SosRaised = z.object({ alert_id: Id, lat: z.number(), lon: z.number() });
export const PpeMissing = z.object({ task_id: Id.nullable(), missing: z.array(PpeItem).min(1) });
export const PpeOverride = z.object({ task_id: Id, incident_id: Id, reason: z.string().min(10).max(500),
  missing: z.array(PpeItem) });
export const TaskChange = z.object({ task_id: Id, status: TaskStatus,
  eta_p50_min: z.number().nullable(), eta_p90_min: z.number().nullable() });
export const IncidentLogged = z.object({ incident_id: Id, seq: z.number().int(),
  incident_type: IncidentType, entry_hash: Hash64 });
export const LedgerVerified = z.object({ ok: z.boolean(), checked: z.number().int(),
  first_bad_seq: z.number().int().nullable(),
  reason: z.enum(["seq_gap", "link_broken", "hash_mismatch", "root_mismatch"]).nullable() });
export const LedgerCheckpoint = z.object({ root_id: Id, root_hex: Hash64, first_seq: z.number().int(),
  last_seq: z.number().int(), telegram_message_id: z.number().int().nullable() });
export const LessonAssigned = z.object({ assignment_id: Id, lesson_code: z.string(),
  because_event_id: Id.nullable() });
export const ScenarioChange = z.object({ status: RunStatus, speed: Speed, sim_now: Ts });

export const AnyEvent = z.discriminatedUnion("type", [
  ev("safety.seatbelt_breach", SeatbeltBreach),
  ev("safety.seatbelt_resolved", z.object({ frame_seq: z.number().int() })),
  ev("anomaly.detected", AnomalyDetected),
  ev("anomaly.cleared", z.object({ anomaly_id: Id })),
  ev("guardian.hazard_near_operator", GuardianHazard),
  ev("guardian.hazard_cleared", z.object({ anomaly_id: Id })),
  ev("alert.raised", AlertRaised),
  ev("alert.acknowledged", AlertAcknowledged),
  ev("alert.escalated", AlertEscalated),
  ev("alert.resolved", z.object({ alert_id: Id, via: AckVia.nullable() })),
  ev("alert.suppressed", AlertSuppressed),
  ev("dispatch.sent", DispatchUpdate), ev("dispatch.delivered", DispatchUpdate),
  ev("dispatch.answered", DispatchUpdate), ev("dispatch.failed", DispatchUpdate),
  ev("dispatch.suppressed", DispatchUpdate),
  ev("sos.raised", SosRaised), ev("sos.cancelled", z.object({ alert_id: Id })),
  ev("ppe.missing", PpeMissing), ev("ppe.restored", z.object({ items: z.array(PpeItem) })),
  ev("ppe.override_granted", PpeOverride),
  ev("task.started", TaskChange), ev("task.paused", TaskChange), ev("task.completed", TaskChange),
  ev("task.start_blocked", PpeMissing),
  ev("incident.logged", IncidentLogged),
  ev("ledger.verified", LedgerVerified), ev("ledger.tamper_detected", LedgerVerified),
  ev("ledger.checkpoint_published", LedgerCheckpoint),
  ev("training.lesson_assigned", LessonAssigned),
  ev("scenario.started", ScenarioChange), ev("scenario.paused", ScenarioChange),
  ev("scenario.resumed", ScenarioChange), ev("scenario.speed_changed", ScenarioChange),
  ev("scenario.jumped", ScenarioChange), ev("scenario.finished", ScenarioChange),
]);
export type AnyEvent = z.infer<typeof AnyEvent>;
export const EVENT_TYPES = AnyEvent.options.map((o) => o.shape.type.value);  // seeds event_types [A: API shape checked in B1]
```
Events not in the union (for example `safety.overspeed`, `safety.proximity`, `safety.organiser_alert`,
`task.*` extras) are added in B1 with their payloads before the freeze; the UI must render unknown
types generically (`type` + tier) so an additive change never crashes it.

## 4. RPCs (Postgres functions called with `supabase.rpc(name, args)`)

All are `security definer`, `set search_path = ''`, check `private.app_role()`, and take
`p_request_id` for idempotency. Errors are raised as `SQLSTATE 'P0001'` with a message code from
`RpcErrorCode` so the UI can localise them.

```ts
export const RpcErrorCode = z.enum(["forbidden", "not_found", "invalid_state", "ppe_missing",
  "override_expired", "rate_limited", "validation"]);

// Operator
export const TaskStartIn = z.object({ p_task_id: Id, p_request_id: RequestId,
  p_eta_p50_min: z.number().positive().nullable(), p_eta_p90_min: z.number().positive().nullable(),
  p_eta_model_version: z.string().nullable() });
export const TaskStartOut = z.discriminatedUnion("status", [
  z.object({ status: z.literal("started"), task_id: Id, started_at: Ts }),
  z.object({ status: z.literal("blocked"), task_id: Id, missing: z.array(PpeItem).min(1) }),
]);
export const TaskPauseIn = z.object({ p_task_id: Id, p_request_id: RequestId });
export const TaskCompleteIn = z.object({ p_task_id: Id, p_request_id: RequestId });
export const SosRaiseIn = z.object({ p_request_id: RequestId, p_lat: z.number(), p_lon: z.number(),
  p_note: z.string().max(280).nullable() });
export const SosRaiseOut = z.object({ alert_id: Id, incident_id: Id, escalate_at: Ts });
export const SosCancelIn = z.object({ p_alert_id: Id, p_request_id: RequestId });
export const IncidentLogIn = z.object({ p_request_id: RequestId, p_incident_type: IncidentType,
  p_severity: z.number().int().min(1).max(5), p_description: z.string().min(1).max(2000),
  p_lat: z.number().nullable(), p_lon: z.number().nullable(), p_non_punitive: z.boolean(),
  p_source_event_id: Id.nullable() });
export const IncidentLogOut = z.object({ incident_id: Id, seq: z.number().int(), entry_hash: Hash64 });

// Operator (own) or fleet manager (any)
export const AlertAckIn = z.object({ p_alert_id: Id, p_request_id: RequestId });
export const AlertAckOut = z.object({ alert_id: Id, status: AlertStatus });

// Fleet manager
export const PpeOverrideIn = z.object({ p_task_id: Id, p_reason: z.string().min(10).max(500),
  p_request_id: RequestId });
export const PpeOverrideOut = z.object({ incident_id: Id, valid_until: Ts });
export const LedgerVerifyIn = z.object({ p_from: z.number().int().min(1).default(1),
  p_to: z.number().int().nullable().default(null) });
export const LedgerVerifyOut = z.object({ ok: z.boolean(), checked: z.number().int(),
  first_bad_seq: z.number().int().nullable(), reason: LedgerVerified.shape.reason,
  expected: Hash64.nullable(), stored: Hash64.nullable(), head_seq: z.number().int(), head_hash: Hash64 });
export const LedgerRootCheckIn = z.object({ p_root_id: Id });
export const LedgerRootCheckOut = z.object({ root_id: Id, published_root: Hash64, recomputed_root: Hash64,
  match: z.boolean(), telegram_message_id: z.number().int().nullable(), published_at: Ts.nullable() });

// Training
export const LessonCompleteIn = z.object({ p_assignment_id: Id, p_quiz_score: z.number().min(0).max(100),
  p_request_id: RequestId });
export const ReplaySubmitIn = z.object({ p_replay_id: Id, p_choices: z.array(z.object({
  step: z.number().int(), choice: z.string(), ms: z.number().int() })), p_request_id: RequestId });
export const ReplaySubmitOut = z.object({ outcome_score: z.number(), process_score: z.number() });
export const LessonAssignIn = z.object({ p_operator_id: Id, p_lesson_code: z.string(),
  p_because_event_id: Id.nullable(), p_request_id: RequestId });   // trainer

// Privacy
export const ConsentSetIn = z.object({ p_version: z.string(), p_granted: z.boolean(), p_request_id: RequestId });

// Bootstrap (one call per screen load / reconnect)
export const MySnapshotOut = z.object({
  contracts_version: z.string(),
  profile: z.object({ user_id: Id, role: AppRole, operator_id: Id.nullable(), site_id: Id, language: Lang }),
  run: z.object({ id: Id, status: RunStatus, speed: Speed, sim_now: Ts }).nullable(),
  tasks: z.array(z.object({ id: Id, task_type: TaskType, status: TaskStatus, planned_start: Ts,
    progress_pct: z.number(), eta_p50_min: z.number().nullable(), eta_p90_min: z.number().nullable(),
    eta_factors: z.record(z.string(), z.number()).nullable() })),
  active_alerts: z.array(AlertRaised.extend({ status: AlertStatus, first_seen: Ts })),
  machine: z.object({ id: Id, code: z.string(), model_name: z.string().nullable(), moving: z.boolean(),
    speed_kmh: z.number(), health: z.enum(["ok", "caution", "fault"]), location: LatLon }).nullable(),
  operator_state: z.object({ on_foot: z.boolean(), ppe: z.partialRecord(PpeItem, z.boolean()),  // z.record(enum) would require every key [V]
    location: LatLon.nullable() }).nullable(),
  weather: z.object({ ts: Ts, temperature_c: z.number(), wbgt_c: z.number().nullable(),
    wind_chill_c: z.number().nullable(), wind_kmh: z.number() }).nullable(),
  recent_events: z.array(EventEnvelopeBase.extend({ payload: z.record(z.string(), z.unknown()) })).max(50),
});
```
Fleet-manager reads (inbox, ledger list, fleet map, evidence card, analytics) are plain `select`s on
RLS-protected tables/views: `alerts`, `dispatches`, `incidents`, `ledger_roots`, `machine_state`,
`anomalies`, `evidence_metrics`, and the view `v_task_analytics` (avg actual time by task_type ×
weather, estimate-vs-actual bias). Row schemas are generated in B2 with `supabase gen types` and
re-exported, not hand-written.

## 5. Edge Functions (`supabase/functions/*`)

| Function | Caller | Auth | verify_jwt |
|---|---|---|---|
| `ask` | web (`supabase.functions.invoke`) | user JWT | on |
| `director` | web `/director` | user JWT (fleet_manager) **and** `x-director-secret` = `DEMO_DRIVER_SECRET` (constant-time compare) | on |
| `dispatch` | pg_net trigger + heartbeat | `apikey` = secret key from Vault, checked in code | off [V] |
| `telegram-webhook` | Telegram | `X-Telegram-Bot-Api-Secret-Token` [V] | off |
| `twilio-voice` | Twilio (Gather action, StatusCallback) | `X-Twilio-Signature` (HMAC-SHA1 per Twilio docs [U: implement with WebCrypto, test in B14]) | off |

```ts
// ask
export const AskRequest = z.object({
  request_id: RequestId,
  question: z.string().min(1).max(500),
  lang: Lang,
  photo_path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/).nullable(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1000) })).max(6),
});
export const Citation = z.object({ id: z.string(), kind: z.enum(["doc", "live"]), title: z.string(),
  page: z.number().int().nullable(), snippet: z.string().max(300) });
export const AskAnswer = z.object({            // the model's strict JSON schema (z.toJSONSchema)
  steps: z.array(z.string().max(200)).min(1).max(6),   // operator: ≤ 3 enforced by the gate
  rule: z.string().max(300).nullable(),
  cited_ids: z.array(z.string()),
  grounded: z.boolean(),
  handover_to_supervisor: z.boolean(),
  proposed_action: z.object({ type: z.literal("log_incident"), incident_type: IncidentType,
    description: z.string().max(500) }).nullable(),
});
export const AskResponse = z.object({
  request_id: RequestId,
  status: z.enum(["answered", "refused", "degraded"]),   // refused = no evidence → "ask your supervisor"
  answer: AskAnswer.nullable(),
  citations: z.array(Citation),
  photo_observations: z.array(z.string()).nullable(),
  model: z.string(), fallback_used: z.string().nullable(), latency_ms: z.number().int(),
});

// director
export const DirectorCommand = z.discriminatedUnion("cmd", [
  z.object({ cmd: z.literal("new_run"), scenario_code: z.string(), speed: Speed }),   // = reset
  z.object({ cmd: z.literal("play") }), z.object({ cmd: z.literal("pause") }),
  z.object({ cmd: z.literal("set_speed"), speed: Speed }),
  z.object({ cmd: z.literal("jump_to"), sim_offset_ms: z.number().int().min(0) }),
  z.object({ cmd: z.literal("inject_frame"), kind: z.enum(["telemetry", "operator_state", "ppe", "fault"]),
    machine_code: z.string().nullable(), operator_code: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()) }),   // sensor input only; never an event
  z.object({ cmd: z.literal("manual_tick") }),
  z.object({ cmd: z.literal("ledger_checkpoint") }),
  z.object({ cmd: z.literal("demo_tamper"), seq: z.number().int(), mode: z.enum(["edit", "rehash"]) }),
  z.object({ cmd: z.literal("set_dry_run"), dry_run: z.boolean() }),
]);
export const DirectorRequest = z.object({ request_id: RequestId, command: DirectorCommand });
export const DirectorResponse = z.object({ ok: z.boolean(), run_id: Id.nullable(),
  message: z.string().nullable() });

// dispatch (internal)
export const DispatchRequest = z.object({ dispatch_id: Id });
```
Persona switch (Ravi ↔ Anita) is a client-side sign-in with the seeded demo accounts, not a backend
command.

## 6. Realtime (`contracts/realtime.ts`)

```ts
export const topics = {
  operator: (operatorId: string) => `op:${operatorId}`,     // own alerts, tasks, PPE, calls
  site: (siteId: string) => `site:${siteId}`,               // clock, machine frames, anomalies, Guardian map
  supervisor: (siteId: string) => `sup:${siteId}`,          // everything incl. dispatch log (FM only)
};
// Broadcast event name = event type (payload = EventEnvelope, see §3), plus:
export const ClockTick = z.object({ run_id: Id, status: RunStatus, speed: Speed, sim_now: Ts });   // event "clock", 1 Hz
export const MachineFrame = z.object({ run_id: Id, sim_ts: Ts, machines: z.array(z.object({
  machine_id: Id, code: z.string(), lat: z.number(), lon: z.number(), moving: z.boolean(),
  health: z.enum(["ok", "caution", "fault"]) })) });                                                   // event "machines", ≤ 1 Hz
```
Clients join with `supabase.channel(topic, { config: { private: true } })` after
`supabase.realtime.setAuth()` [V]. On rejoin, request Broadcast replay (≤ 25 messages, supabase-js ≥
2.74 [V]) and call `my_snapshot`. Budget: ~3 messages/s across three clients → ~11k/hour, far inside
2 M/month [V].

## 7. ETA model (`eta/model.ts`)

```ts
export const EtaInput = z.object({ task_type: TaskType, weather: WeatherKind, operator_skill: SkillLevel,
  machine_age_years: z.number().min(0).max(40), temperature_c: z.number().nullable(),
  wind_kmh: z.number().nullable(), shift_hour: z.number().int().min(0).max(23).nullable() });
export const EtaFactor = z.object({ key: z.string(), multiplier: z.number(), assumed: z.boolean() });
export const EtaEstimate = z.object({ p50_min: z.number(), p90_min: z.number(),
  factors: z.array(EtaFactor), model_version: z.string() });
// estimateEta(input: EtaInput, model = MODEL_V1): EtaEstimate  (pure, deterministic, no I/O)
```
Model v1: `log(actual) = log(base[task_type]) + Σ β·x` (one-hot weather, skill, age bucket, heat and
cold bands, wind band, circadian band) fitted by ordinary least squares on the `train` split;
`p50 = exp(prediction)`; `p90 = p50 · exp(q)` where `q` is the split-conformal 90 % quantile of log
residuals on the `calib` split (rank `⌈(n+1)·0.9⌉`); multipliers `exp(β)` are the "why" bars.
Evidence: MAE on the `test` split, ours vs `organiser_estimate_min`, and empirical P90 coverage.

## 8. Contract tests (in B1)

- Every `fixtures/*.json` parses with its schema; one invalid fixture per schema fails.
- `EVENT_TYPES` equals the `event_types` seed list (checked again in B4 against the DB).
- `z.toJSONSchema(AskAnswer)` produces a schema Groq accepts with `strict: true` (checked live in B19).
