# API contracts (`@cat/shared`): freeze these first

Status: Proposed v1.0.0, **revision 3** (G2 re-check `N1-N5`, UI contract gaps `UI-1…16` from
`docs/design/frontend-tasks.md` §5, decisions D8/D9; gap dispositions in §10). Owner: Track B. Consumer:
Track F (`apps/web`), later `apps/mobile`. Task B1 turns this into code under
`packages/shared/src/contracts/` and freezes it. Markers: **[V]** verified, **[A]** assumption,
**[U]** unverified.

Zod facts used [V] context7 `/colinhacks/zod` (repo pins `zod ^4.6.5`): top-level `z.uuid()`,
`z.iso.datetime({ offset: true })`, `z.url()`; `z.record(key, value)` with an enum key requires every
key, `z.partialRecord()` does not; `z.toJSONSchema()` exists.

## 0. Freeze rules

1. `CONTRACTS_VERSION = "1.0.0"`. After the freeze (end of B1), changes are **additive only**. A breaking
   change needs a major bump, a line in `docs/project-memory/decisions.md` and Track F's acknowledgement
   in `docs/sessions/track-f.md` (PA-5d: Track F never edits `packages/shared`; it requests changes in
   its log).
2. **Single source of truth (G2-9):** `EVENT_REGISTRY`, `ALERT_POLICIES` and every enum live here.
   `scripts/gen-sql-seed.ts` generates the SQL enums, the `event_types` seed and the `alert_policies`
   seed into a migration; B4's test fails if the database rows differ from the registry. Nothing in SQL
   is hand-written for these lists.
3. Track F imports types from `@cat/shared` only and codes against `fixtures/` until IP1.
4. Wire format: snake_case (PostgREST and `realtime.send(to_jsonb(row))`). RPC argument names are the
   SQL parameter names (`p_…`).
5. Postgres `numeric` arrives as a JSON number through PostgREST [A: confirm in B2]; hashes are strings.

## 1. File layout (`packages/shared/src/`)

```
contracts/version.ts   contracts/enums.ts   contracts/registry.ts (EVENT_REGISTRY, ALERT_POLICIES)
contracts/events.ts    contracts/rpc.ts     contracts/functions.ts   contracts/realtime.ts
contracts/replay.ts    contracts/evidence.ts   contracts/assumed.ts
eta/model.ts, eta/model.v1.json     ledger/canonical.ts (+ golden vectors from data-model §4.3)
fixtures/*.json        (one valid example per schema; also the contract tests)
```

## 2. Enums and scalars (`contracts/enums.ts`)

```ts
import { z } from "zod";
export const AppRole = z.enum(["operator", "fleet_manager", "trainer"]);
export const Audience = z.enum(["operator", "site", "supervisor", "trainer"]);
export const AlertTier = z.enum(["info", "caution", "warning", "critical"]);
export const SkillLevel = z.enum(["novice", "intermediate", "expert"]);
export const TaskType = z.enum(["excavation", "trenching", "material_loading", "grading", "demolition"]);
export const TaskStatus = z.enum(["planned", "in_progress", "paused", "completed", "cancelled", "blocked_ppe"]);
export const WeatherKind = z.enum(["clear", "hot", "rain", "windy", "cold", "fog", "dust"]);
export const RunStatus = z.enum(["ready", "playing", "paused", "finished"]);
export const Speed = z.union([z.literal(1), z.literal(10), z.literal(60)]);
export const AlertStatus = z.enum(["open", "acknowledged", "escalating", "escalated", "resolved", "suppressed"]);
export const AckVia = z.enum(["app", "telegram", "twilio_keypress", "sensor"]);
export const DispatchChannel = z.enum(["telegram", "twilio_voice"]);
export const DispatchStatus = z.enum(["queued", "sending", "sent", "delivered", "answered", "no_answer",
  "failed", "suppressed", "dry_run"]);
export const SuppressReason = z.enum(["dedupe", "lower_tier", "rate_cap", "catch_up", "motion_lock",
  "call_cooldown", "state_unknown", "acknowledged", "dry_run"]);
export const IncidentType = z.enum(["seatbelt_breach", "guardian_hazard", "sos", "ppe_override", "near_miss",
  "first_aid", "property_damage", "manual", "correction"]);
export const Lang = z.enum(["en", "hi", "ta"]);
export const PpeItem = z.enum(["helmet", "vest", "boots", "gloves"]);
export const ProximityZone = z.enum(["awareness", "warning", "danger"]);
export const AnomalyType = z.enum(["idle_excess", "seatbelt_off_moving", "overspeed", "slope_exceeded",
  "fault_continued_operation", "hydraulic_temp_drift", "coolant_temp_drift"]);   // P1 types added later (additive)
export const AlertKind = z.enum(["seatbelt_off_moving", "guardian_hazard", "proximity_zone", "ppe_missing",
  "anomaly_machine", "idle_excess", "sos", "ledger_tamper", "alert_flood"]);
export const PhotoCategory = z.enum(["hydraulic_leak", "fuel_leak", "coolant_leak", "tyre_damage",
  "structural_crack", "fire_smoke", "ppe_issue", "unknown"]);

export const Id = z.uuid();
export const Ts = z.iso.datetime({ offset: true });
export const Hash64 = z.string().regex(/^[0-9a-f]{64}$/);
export const RequestId = z.uuid();
export const LatLon = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
export const I18nText = z.object({ en: z.string(), hi: z.string().optional(), ta: z.string().optional() });
```

## 3. Event registry and events (`contracts/registry.ts`, `contracts/events.ts`)

```ts
export const EventEnvelopeBase = z.object({
  id: Id, seq: z.number().int().positive(), run_id: Id.nullable(), type: z.string(),
  tier: AlertTier.nullable(), sim_ts: Ts.nullable(), recorded_at: Ts,
  site_id: Id.nullable(), machine_id: Id.nullable(), operator_id: Id.nullable(),
  task_id: Id.nullable(), alert_id: Id.nullable(),
  audiences: z.array(Audience).min(1),
  source: z.enum(["detector.rule", "detector.ewma", "guardian", "user", "director", "system",
                  "telegram", "twilio", "loader"]),
  correlation_id: Id.nullable(), causation_id: Id.nullable(), idempotency_key: z.string().min(3).max(200),
});

// Payloads (numbers only where the UI renders localised text)
export const SeatbeltBreach = z.object({ frame_seq: z.number().int(), speed_kmh: z.number(),
  pitch_deg: z.number(), roll_deg: z.number(), slope_limit_deg: z.number(), zone_id: Id.nullable() });
export const Overspeed = z.object({ frame_seq: z.number().int(), speed_kmh: z.number(), limit_kmh: z.number(), zone_id: Id.nullable() });
export const SlopeExceeded = z.object({ frame_seq: z.number().int(), pitch_deg: z.number(), roll_deg: z.number(), limit_deg: z.number() });
export const Proximity = z.object({ other_kind: z.enum(["person", "machine"]), other_id: Id,
  distance_m: z.number(), zone: ProximityZone });
export const OrganiserAlert = z.object({ raw: z.string().max(200) });
export const AnomalyDetected = z.object({ anomaly_id: Id, anomaly_type: AnomalyType,
  method: z.enum(["rule", "ewma"]), severity_score: z.number().int().min(0).max(100),
  features: z.record(z.string(), z.number()), lat: z.number(), lon: z.number() });
export const GuardianHazard = z.object({ anomaly_id: Id, machine_code: z.string(), distance_m: z.number(),
  bearing_deg: z.number(), wind_from_deg: z.number().nullable(), zone: ProximityZone, protocol_card_id: z.string() });
export const AlertRaised = z.object({ alert_id: Id, kind: AlertKind, tier: AlertTier, needs_ack: z.boolean(),
  escalate_at: Ts.nullable(), occurrences: z.number().int(), protocol_card_id: z.string().nullable(),
  upgraded_from: AlertTier.nullable() });
export const AlertAcknowledged = z.object({ alert_id: Id, via: AckVia, by_role: AppRole.nullable() });
export const AlertEscalated = z.object({ alert_id: Id, level: z.number().int(), to: z.array(z.string()) });
export const AlertSuppressed = z.object({ alert_id: Id, reason: SuppressReason, suppressed_by: Id.nullable() });
export const DispatchUpdate = z.object({ dispatch_id: Id, channel: DispatchChannel, status: DispatchStatus,
  reason: SuppressReason.or(z.enum(["provider_error", "no_answer"])).nullable() });
export const SosRaised = z.object({ alert_id: Id, lat: z.number(), lon: z.number(), abuse_suspected: z.boolean() });
export const PpeMissing = z.object({ task_id: Id.nullable(), missing: z.array(PpeItem).min(1) });
export const PpeOverride = z.object({ task_id: Id, override_id: Id, reason: z.string().min(10).max(500),
  missing: z.array(PpeItem) });
export const EtaFactor = z.object({ key: z.string(), multiplier: z.number(), assumed: z.boolean() });
export const TaskChange = z.object({ task_id: Id, status: TaskStatus, progress_pct: z.number(),
  eta_p50_min: z.number().nullable(), eta_p90_min: z.number().nullable() });
export const IncidentLogged = z.object({ incident_id: Id, seq: z.number().int(), incident_type: IncidentType,
  entry_hash: Hash64, ledger_queue_id: z.number().int() });
export const LedgerCheckResult = z.object({ ok: z.boolean(), checked: z.number().int(),
  first_bad_seq: z.number().int().nullable(),
  reason: z.enum(["seq_gap", "link_broken", "hash_mismatch", "anchor_mismatch", "witness_mismatch"]).nullable() });
export const LedgerCheckpoint = z.object({ root_id: Id, root_hex: Hash64, head_hash: Hash64,
  first_seq: z.number().int(), last_seq: z.number().int(), telegram_message_id: z.number().int().nullable() });
export const LessonAssigned = z.object({ assignment_id: Id, lesson_code: z.string(), because_event_id: Id.nullable() });
export const LessonCompleted = z.object({ assignment_id: Id, quiz_score: z.number() });
export const ReplayReady = z.object({ replay_id: Id, source_event_id: Id });
export const ReplayCompleted = z.object({ replay_id: Id, outcome_score: z.number(), process_score: z.number() });
export const ScenarioChange = z.object({ status: RunStatus, speed: Speed, sim_now: Ts });
export const IncidentReported = z.object({ incident_type: IncidentType, severity: z.number().int().min(1).max(5),
  description: z.string(), non_punitive: z.boolean(), lat: z.number().nullable(), lon: z.number().nullable() });
export const MotionLockChanged = z.object({ motion_locked: z.boolean(), call_allowed: z.boolean(),
  reason: z.enum(["moving", "parked", "on_foot", "state_unknown"]) });
export const SystemWarning = z.object({ code: z.enum(["db_size_warning", "tick_overrun"]), value: z.number() });

type Meta = { tier: z.infer<typeof AlertTier> | null; ledger: boolean; alert_kind: z.infer<typeof AlertKind> | null;
  audiences: z.infer<typeof Audience>[]; lesson_code: string | null; replay: boolean };
const r = <P extends z.ZodType>(payload: P, m: Partial<Meta> & Pick<Meta, "audiences">) =>
  ({ payload, tier: null, ledger: false, alert_kind: null, lesson_code: null, replay: false, ...m });
const OP_SUP = ["operator", "supervisor"] as const, SITE_SUP = ["site", "supervisor"] as const;

export const EVENT_REGISTRY = {
  "safety.seatbelt_breach":   r(SeatbeltBreach, { tier: "warning", ledger: true, alert_kind: "seatbelt_off_moving",
                                 audiences: [...OP_SUP, "trainer"], lesson_code: "seatbelt_slopes", replay: true }),  // P0 replay (UI demo beat 4)
  "safety.seatbelt_resolved": r(z.object({ frame_seq: z.number().int() }), { audiences: [...OP_SUP] }),
  "safety.overspeed":         r(Overspeed, { tier: "caution", audiences: [...OP_SUP] }),   // event only in P0, no alert
  "safety.slope_exceeded":    r(SlopeExceeded, { tier: "warning", audiences: [...OP_SUP, "trainer"] }),
  "safety.proximity":         r(Proximity, { tier: "caution", alert_kind: "proximity_zone", audiences: [...OP_SUP] }),
  "safety.organiser_alert":   r(OrganiserAlert, { tier: "info", audiences: ["supervisor"] }),
  "anomaly.detected":         r(AnomalyDetected, { tier: "caution", alert_kind: "anomaly_machine", audiences: [...SITE_SUP] }),
  "anomaly.cleared":          r(z.object({ anomaly_id: Id }), { audiences: [...SITE_SUP] }),
  "guardian.hazard_near_operator": r(GuardianHazard, { tier: "warning", ledger: true, alert_kind: "guardian_hazard",
                                 audiences: [...OP_SUP, "trainer"], lesson_code: "faulty_machine_nearby" }),  // replay P1
  "guardian.hazard_cleared":  r(z.object({ anomaly_id: Id }), { audiences: [...OP_SUP] }),
  "alert.raised":             r(AlertRaised, { audiences: [...OP_SUP] }),
  "alert.acknowledged":       r(AlertAcknowledged, { audiences: [...OP_SUP] }),
  "alert.escalated":          r(AlertEscalated, { audiences: [...OP_SUP] }),
  "alert.resolved":           r(z.object({ alert_id: Id, via: AckVia.nullable() }), { audiences: [...OP_SUP] }),
  "alert.suppressed":         r(AlertSuppressed, { audiences: ["supervisor"] }),
  "dispatch.sent":        r(DispatchUpdate, { audiences: [...OP_SUP] }),   // operator = alert owner (UI-10)
  "dispatch.delivered":   r(DispatchUpdate, { audiences: [...OP_SUP] }),   // operator = alert owner (UI-10)
  "dispatch.answered":        r(DispatchUpdate, { audiences: [...OP_SUP] }),
  "dispatch.failed":      r(DispatchUpdate, { audiences: [...OP_SUP] }),   // operator = alert owner (UI-10)
  "dispatch.suppressed":  r(DispatchUpdate, { audiences: [...OP_SUP] }),   // operator = alert owner (UI-10)
  "sos.raised":               r(SosRaised, { tier: "critical", ledger: true, alert_kind: "sos", audiences: [...OP_SUP] }),
  "sos.cancelled":            r(z.object({ alert_id: Id }), { audiences: [...OP_SUP] }),
  "ppe.missing":              r(PpeMissing, { tier: "caution", alert_kind: "ppe_missing", audiences: [...OP_SUP] }),
  "ppe.restored":             r(z.object({ items: z.array(PpeItem) }), { audiences: [...OP_SUP] }),
  "ppe.override_granted":     r(PpeOverride, { ledger: true, audiences: [...OP_SUP] }),
  "task.started":             r(TaskChange, { audiences: [...OP_SUP] }),
  "task.paused":              r(TaskChange, { audiences: [...OP_SUP] }),
  "task.completed":           r(TaskChange, { audiences: [...OP_SUP] }),
  "task.progress":            r(TaskChange, { audiences: [...OP_SUP] }),
  "task.start_blocked":       r(PpeMissing, { audiences: [...OP_SUP] }),
  "incident.reported":        r(IncidentReported, { ledger: true, audiences: [...OP_SUP] }),   // incident_log RPC (N3 single path)
  "incident.logged":          r(IncidentLogged, { audiences: [...OP_SUP] }),
  "operator.motion_lock_changed": r(MotionLockChanged, { audiences: ["operator"] }),                   // UI-5
  "ledger.verified":          r(LedgerCheckResult, { audiences: ["supervisor"] }),
  "ledger.tamper_detected":   r(LedgerCheckResult, { tier: "critical", alert_kind: "ledger_tamper", audiences: ["supervisor"] }),
  "ledger.checkpoint_published": r(LedgerCheckpoint, { audiences: ["supervisor"] }),
  "training.lesson_assigned": r(LessonAssigned, { audiences: ["operator", "trainer"] }),
  "training.lesson_completed": r(LessonCompleted, { audiences: ["operator", "trainer"] }),
  "training.replay_ready":    r(ReplayReady, { audiences: ["operator", "trainer"] }),
  "training.replay_completed": r(ReplayCompleted, { audiences: ["operator", "trainer"] }),
  "scenario.started":  r(ScenarioChange, { audiences: ["site"] }), "scenario.paused":  r(ScenarioChange, { audiences: ["site"] }),
  "scenario.resumed":  r(ScenarioChange, { audiences: ["site"] }), "scenario.speed_changed": r(ScenarioChange, { audiences: ["site"] }),
  "scenario.jumped":   r(ScenarioChange, { audiences: ["site"] }), "scenario.finished": r(ScenarioChange, { audiences: ["site"] }),
  "system.warning":    r(SystemWarning, { audiences: ["supervisor"] }),
} as const;

export type EventType = keyof typeof EVENT_REGISTRY;
export const EVENT_TYPES = Object.keys(EVENT_REGISTRY) as EventType[];
// AnyEvent: discriminatedUnion("type", …) built from the registry by a typed helper in B1
// (one EventEnvelopeBase.extend({ type: z.literal(t), payload }) per entry). The UI renders unknown
// types generically (type + tier), so additive changes never crash it.
```
`ALERT_POLICIES` (same file) is the table in event-pipeline §7, typed with `AlertKind` as key; it is
the only source of the `alert_policies` seed.

## 4. RPCs (`contracts/rpc.ts`)

All `security definer`, `set search_path = ''`, `lock_timeout 2s`, role-checked, idempotent on
`p_request_id`. Errors: `SQLSTATE 'P0001'` with a message from `RpcErrorCode`.

```ts
export const RpcErrorCode = z.enum(["forbidden", "not_found", "invalid_state", "ppe_missing",
  "override_expired", "rate_limited", "validation", "not_paired"]);

// Operator
export const PairMachineIn = z.object({ p_machine_code: z.string(), p_request_id: RequestId });           // G2-14
export const PairMachineOut = z.object({ machine_id: Id, paired_at: Ts });
export const TaskStartIn = z.object({ p_task_id: Id, p_request_id: RequestId,
  p_eta_p50_min: z.number().positive().nullable(), p_eta_p90_min: z.number().positive().nullable(),
  p_eta_factors: z.array(EtaFactor).nullable(), p_eta_model_version: z.string().nullable() });           // G2-9
export const TaskStartOut = z.discriminatedUnion("status", [
  z.object({ status: z.literal("started"), task_id: Id, started_at: Ts }),
  z.object({ status: z.literal("blocked"), task_id: Id, missing: z.array(PpeItem).min(1) }),
]);
export const TaskPauseIn = z.object({ p_task_id: Id, p_request_id: RequestId });
export const TaskCompleteIn = z.object({ p_task_id: Id, p_request_id: RequestId });
export const SosRaiseIn = z.object({ p_request_id: RequestId, p_lat: z.number().nullable(), p_lon: z.number().nullable(),
  p_note: z.string().max(280).nullable() });   // null location → paired machine, then site centre (UI-14)
export const SosRaiseOut = z.object({ alert_id: Id, escalate_at: Ts, server_now: Ts,
  location_source: z.enum(["device", "machine", "site"]) });   // ledger entry arrives via incident.logged
export const SosCancelIn = z.object({ p_alert_id: Id, p_request_id: RequestId });
export const IncidentLogIn = z.object({ p_request_id: RequestId, p_incident_type: IncidentType,
  p_severity: z.number().int().min(1).max(5),
  p_description: z.string().max(2000).regex(/^[^\u0000-\u001f]*$/).nullable(),   // canonical rule 4; null → type label (UI-15)
  p_lat: z.number().nullable(), p_lon: z.number().nullable(), p_non_punitive: z.boolean(),
  p_source_event_id: Id.nullable() });
export const IncidentLogOut = z.object({ event_id: Id });   // the incident.reported event; the entry arrives via incident.logged (N3)
export const AlertAckIn = z.object({ p_alert_id: Id, p_request_id: RequestId });
export const AlertAckOut = z.object({ alert_id: Id, status: AlertStatus });

// Fleet manager
export const PpeOverrideIn = z.object({ p_task_id: Id, p_reason: z.string().min(10).max(500).regex(/^[^\u0000-\u001f]*$/),
  p_request_id: RequestId });
export const PpeOverrideOut = z.object({ override_id: Id, valid_until: Ts });
export const LedgerVerifyIn = z.object({ p_from: z.number().int().min(1).default(1), p_to: z.number().int().nullable().default(null) });
export const LedgerVerifyOut = LedgerCheckResult.extend({ expected: Hash64.nullable(), stored: Hash64.nullable(),
  head_seq: z.number().int(), head_hash: Hash64 });        // internal consistency only
// Witness compare (N1): the range comes from the fleet manager's Telegram message, typed by her
export const LedgerRecomputeIn = z.object({ p_first_seq: z.number().int().min(1), p_last_seq: z.number().int().min(1) });
export const LedgerRecomputeOut = z.object({ first_seq: z.number().int(), last_seq: z.number().int(),
  leaf_count: z.number().int(), root_hex: Hash64, head_hash: Hash64 });   // computed from ledger rows only
export const WITNESS_LINE = /^SPOTTER-LEDGER v1 seq=(\d+)\.\.(\d+) n=(\d+) root=([0-9a-f]{64}) head=([0-9a-f]{64})/;
export const NearMissListOut = z.array(z.object({ incident_id: Id, seq: z.number().int(), occurred_at: Ts,
  operator_pseudonym: z.string(), description: z.string(), severity: z.number().int() }));

// Training
export const LessonCompleteIn = z.object({ p_assignment_id: Id, p_quiz_score: z.number().min(0).max(100), p_request_id: RequestId });
export const ReplaySubmitIn = z.object({ p_replay_id: Id, p_request_id: RequestId,
  p_choices: z.array(z.object({ step: z.number().int(), option_id: z.string(), ms: z.number().int().min(0) })) });
export const ReplaySubmitOut = z.object({ outcome_score: z.number(), process_score: z.number(),
  review: z.array(z.object({ step: z.number().int(), chosen: z.string(), best: z.string(), why: I18nText })) });   // UI-3
export const ReplayGetIn = z.object({ p_replay_id: Id });   // rpc replay_get → ReplayScenario (UI-3)
export const LessonAssignIn = z.object({ p_operator_id: Id, p_lesson_code: z.string(),
  p_because_event_id: Id.nullable(), p_request_id: RequestId });      // trainer

// Privacy
export const ConsentSetIn = z.object({ p_version: z.string(), p_granted: z.boolean(), p_request_id: RequestId });
export const PRIVACY = { retention_days: 90, consent_version: "1" } as const;   // UI-15

// Protocol cards (UI-8): read with select on protocol_cards (all roles)
export const ProtocolCard = z.object({ id: z.string(), title: I18nText, steps: z.array(I18nText).min(1).max(6),
  pictogram: z.string(), upwind_hint: z.boolean(), version: z.number().int() });

// Bootstrap
export const MySnapshotOut = z.object({
  contracts_version: z.string(),
  profile: z.object({ user_id: Id, role: AppRole, operator_id: Id.nullable(), site_id: Id, language: Lang }),
  server_now: Ts,                                                                                 // UI-4
  run: z.object({ id: Id, status: RunStatus, speed: Speed, sim_now: Ts }).nullable(),
  site: z.object({ id: Id, name: z.string(), emergency_tel: z.string().nullable() }),            // UI-11 (from Vault, not a table)
  paired_machine_id: Id.nullable(),
  tasks: z.array(z.object({ id: Id, task_type: TaskType, status: TaskStatus, planned_start: Ts,
    progress_pct: z.number(), eta_p50_min: z.number().nullable(), eta_p90_min: z.number().nullable(),
    eta_factors: z.array(EtaFactor).nullable() })),                                               // G2-9: array everywhere
  active_alerts: z.array(AlertRaised.extend({ status: AlertStatus, first_seen: Ts })),
  machine: z.object({ id: Id, code: z.string(), model_name: z.string().nullable(), moving: z.boolean(),
    speed_kmh: z.number(), health: z.enum(["ok", "caution", "fault"]), location: LatLon,
    seatbelt_fastened: z.boolean().nullable(), parking_brake: z.boolean().nullable() }).nullable(),   // UI-6
  operator_state: z.object({ on_foot: z.boolean().nullable(), ppe: z.partialRecord(PpeItem, z.boolean()),
    location: LatLon.nullable(), ts: Ts,
    motion_locked: z.boolean(), call_allowed: z.boolean(),                                         // UI-5 (server-computed)
    nearest: z.object({ kind: z.enum(["person", "machine"]), id: Id, distance_m: z.number(),
      zone: ProximityZone }).nullable() }).nullable(),                                             // UI-6
  weather: z.object({ ts: Ts, temperature_c: z.number(), wbgt_c: z.number().nullable(),
    wind_chill_c: z.number().nullable(), wind_kmh: z.number(),
    forecast_peak_c: z.number().nullable(), forecast_peak_at: Ts.nullable(),                       // UI-7 (scenario forecast)
    source_label: z.string() }).nullable(),                                                        // e.g. Open-Meteo archive, CC BY 4.0
  assignments: z.array(z.object({ id: Id, lesson_code: z.string(), because_event_id: Id.nullable(),
    replay_id: Id.nullable() })),
  recent_events: z.array(EventEnvelopeBase.extend({ payload: z.record(z.string(), z.unknown()) })).max(50),
});
```
FM reads (inbox, ledger list, fleet map, evidence, analytics) are `select`s on RLS-protected tables and
`v_task_analytics`; row types come from `supabase gen types` (B2), not hand-written.

## 5. Replay (`contracts/replay.ts`; PA-1, G2-14, UI-3)

Revision 3 adopts the **UI lead's requested shape** (frontend-tasks §5 #3; the fixture adapter already
implements it). P0 event type: `safety.seatbelt_breach` (demo beat 4 in screens.md); the Guardian replay
is P1 (the enum is additive).
```ts
export const ReplayScenario = z.object({
  id: Id, event_id: Id, event_type: z.enum(["safety.seatbelt_breach"]),
  occurred_sim_ts: Ts, machine_code: z.string(), summary: I18nText,
  map: z.object({ center: LatLon, zoom: z.number(), zones: z.array(z.object({ id: Id, name: z.string(),
    zone_type: z.string(), polygon: z.array(LatLon) })) }),
  trail: z.array(z.object({ t_ms: z.number().int(), lat: z.number(), lon: z.number() })).max(600),   // 10 sim-min before
  machine_track: z.array(z.object({ t_ms: z.number().int(), lat: z.number(), lon: z.number(),
    speed_kmh: z.number(), pitch_deg: z.number() })).max(600),
  wind_from_deg: z.number().nullable(),
  real_response_ms: z.number().int().nullable(),
  steps: z.array(z.object({ step: z.number().int(), at_ms: z.number().int(), prompt: I18nText,
    time_limit_s: z.number().int().positive(),
    choices: z.array(z.object({ id: z.string(), label: I18nText, pictogram: z.string() })).min(2).max(4) })).min(3).max(4),
});   // correct choice, weight and "why" stay server-side until replay_submit returns `review`
```
Reads: `replay_get(p_replay_id)` RPC (own replays only) and `assignments[].replay_id` in `my_snapshot`.
Scoring (server-side, `replay_submit`): outcome = Σ weights of correct choices ÷ Σ weights × 100;
process = 100 × share of steps answered within `time_limit_s`, minus 25 if out of order.

## 6. Edge Functions (`contracts/functions.ts`)

**All functions set `verify_jwt = false` and authenticate in code** (G2-6: the platform check alone lets
a publishable key through, per the review's reading of `functions/auth-headers`).
| Function | Caller | Authentication in code | Limits |
|---|---|---|---|
| `ask` | web | **user JWT required**: `auth.getUser(jwt)` (or `@supabase/server` `withSupabase({auth:'user'})` [V migration guide]); anon or key-only → 401 | per user 6/min and 30/h; org-wide 20/min (`private.ask_rate`) |
| `director` | web `/director` | user JWT with role FM **and** `x-director-secret` (constant-time compare of SHA-256 digests) | 30 commands/min |
| `demo-login` | web persona picker | `x-director-secret` (constant-time); only the three seeded demo emails | 10/min |
| `dispatch` | pg_net | `apikey` = secret key from Vault, compared in code | — |
| `telegram-webhook` | Telegram | `X-Telegram-Bot-Api-Secret-Token` [V], constant-time; `chat.id` must equal the supervisor chat | — |
| `twilio-voice` | Twilio | `X-Twilio-Signature` = base64(HMAC-SHA1(authToken, **`PUBLIC_FUNCTIONS_URL + "/twilio-voice" + "?" + exact query we sent`** + sorted POST params as name+value)) [V twilio.com/docs/usage/security]; never computed from `req.url` (G2-7) | — |

New Edge Function secrets: `PUBLIC_FUNCTIONS_URL = https://<ref>.supabase.co/functions/v1`;
`LLM_PRIMARY=groq`, `LLM_FALLBACK=none|gemini` (D9: one Groq account; no cross-account failover);
`GOOGLE_GENERATIVE_AI_API_KEY` only when `LLM_FALLBACK=gemini`. Model ids live in
`contracts/models.ts` (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`,
`meta-llama/llama-prompt-guard-2-86m`, `openai/gpt-oss-safeguard-20b`), so a model change is one line.

```ts
export const AskRequest = z.object({ request_id: RequestId, question: z.string().min(1).max(500), lang: Lang,
  photo_path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/).nullable(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1000) })).max(6) });
export const VisionResult = z.object({ category: PhotoCategory, confidence: z.number().min(0).max(1) });   // G2-13: nothing else kept
export const Citation = z.object({ id: z.string(), kind: z.enum(["doc", "live"]), title: z.string(),
  page: z.number().int().nullable(), snippet: z.string().max(300) });
export const AskAnswer = z.object({                     // model output, strict JSON schema via z.toJSONSchema
  steps: z.array(z.object({ text: z.string().max(200), cited_ids: z.array(z.string()).min(1) })).min(1).max(6),
  rule: z.object({ text: z.string().max(300), cited_id: z.string() }).nullable(),   // must quote a doc chunk verbatim
  grounded: z.boolean(), handover_to_supervisor: z.boolean(),
  proposed_action: z.object({ type: z.literal("log_incident"), incident_type: IncidentType,
    description: z.string().max(500) }).nullable() });
export const AskResponse = z.object({ request_id: RequestId,
  status: z.enum(["answered", "refused", "degraded"]),
  refusal_reason: z.enum(["no_evidence", "rule_not_verbatim", "citation_invalid", "rate_limited", "provider_down",
    "injection_suspected", "policy_violation"]).nullable(),   // prompt guard / safeguard (EP §6)
  answer: AskAnswer.nullable(), citations: z.array(Citation), photo: VisionResult.nullable(),
  model: z.string(), fallback_used: z.string().nullable(), latency_ms: z.number().int() });

export const DirectorCommand = z.discriminatedUnion("cmd", [
  z.object({ cmd: z.literal("new_run"), scenario_code: z.string(), speed: Speed, rehearsal: z.boolean() }),
  z.object({ cmd: z.literal("play") }), z.object({ cmd: z.literal("pause") }),
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
// auth.admin.generateLink({ type: 'magiclink', email }) and returns its hashed token [A: field name
// `properties.hashed_token` confirmed in B15]; the client calls
// supabase.auth.verifyOtp({ token_hash, type: 'email' }) [V supabase.com/docs/guides/auth/auth-email-passwordless].
export const DemoLoginRequest = z.object({ persona: z.enum(["ravi", "anita", "trainer"]) });
export const DemoLoginResponse = z.object({ token_hash: z.string(), type: z.literal("email") });

export const DispatchRequest = z.object({ dispatch_id: Id });
```

## 7. Realtime (`contracts/realtime.ts`; G2-19)

```ts
export const topicFor = {
  operator: (operatorId: string) => `op:${operatorId}`,
  site: (siteId: string) => `site:${siteId}`,
  supervisor: (siteId: string) => `sup:${siteId}`,
  trainer: (siteId: string) => `train:${siteId}`,
} satisfies Record<z.infer<typeof Audience>, (id: string) => string>;
export const ClockTick = z.object({ run_id: Id, status: RunStatus, speed: Speed, sim_now: Ts, server_now: Ts });   // "clock", 1 Hz (UI-4)
export const MachineDelta = z.object({ run_id: Id, sim_ts: Ts, machines: z.array(z.object({     // "machines", delta only
  machine_id: Id, code: z.string(), lat: z.number(), lon: z.number(), moving: z.boolean(),
  health: z.enum(["ok", "caution", "fault"]) })) });
```
An event is broadcast once per audience in its `audiences`; the RLS on `events` uses the same
audiences, so a role receives on Realtime exactly what it can select. Clients join with
`{ config: { private: true } }` after `realtime.setAuth()` [V]; on rejoin, Broadcast replay (≤ 25,
supabase-js ≥ 2.74 [V]) + `my_snapshot`.

## 8. ETA model (`eta/model.ts`) and evidence keys (`contracts/evidence.ts`)

```ts
export const EtaInput = z.object({ task_type: TaskType, weather: WeatherKind, operator_skill: SkillLevel,
  machine_age_years: z.number().min(0).max(40), temperature_c: z.number().nullable(),
  wind_kmh: z.number().nullable(), shift_hour: z.number().int().min(0).max(23).nullable() });
export const EtaEstimate = z.object({ p50_min: z.number(), p90_min: z.number(), factors: z.array(EtaFactor),
  model_version: z.string() });
// estimateEta(input, model = MODEL_V1): EtaEstimate — pure; factors are exactly what task_start stores
export const EvidenceKey = z.enum(["detector.precision", "detector.recall", "eta.mae.model", "eta.mae.organiser",
  "eta.p90_coverage", "fleet.idle_pct", "fleet.idle_pct.by_model", "loop.repeat_rate.assigned",
  "loop.repeat_rate.control", "rag.hit_at_5", "rag.faithfulness"]);    // per-type keys carry details.type
```
Model v1: OLS on log(actual) with one-hot weather, skill, age bucket, heat/cold/wind/circadian bands on
the `train` split; P90 = P50 · exp(q), q = split-conformal 90 % quantile of log residuals on `calib`
(rank ⌈(n+1)·0.9⌉); evidence on `test`.

## 9. Contract tests (B1, B4)

- Every fixture parses; one invalid fixture per schema fails.
- `gen-sql-seed.ts` output is committed; B4's sqltest compares `event_types` and `alert_policies` with the
  registry (count, flags, audiences).
- `z.toJSONSchema(AskAnswer)` snapshot; accepted by Groq with `strict: true` (checked live in B19).
- `ledger/canonical.ts` reproduces golden vectors 1-3 of data-model §4.3.

## 10. UI gap disposition (`docs/design/frontend-tasks.md` §5, UI-1 … UI-16)

| # | Gap | Disposition | Where |
|---|---|---|---|
| UI-1 | `progress_pct` has no writer | **Closed.** `apply_frame` computes it from load cycles for the running task; `task.progress` event every 10 % | DM §2.2 · §3 `task.progress` |
| UI-2 | ETA factors array vs record | **Closed.** `EtaFactor[]` everywhere (snapshot, `task_start`, events) | §4 |
| UI-3 | `ReplayScenario`, replay reads, per-step review | **Closed with the UI's shape**; `replay_get` RPC; `ReplaySubmitOut.review`; assignments with `replay_id` in `my_snapshot`. P0 replay = seatbelt on a slope (aligned with screens.md) | §5 · §4 |
| UI-4 | server time for countdowns | **Closed.** `server_now` in `MySnapshotOut`, `ClockTick`, `SosRaiseOut` | §4 · §7 |
| UI-5 | client motion-lock predicate may disagree | **Closed.** `operator_state.motion_locked` + `call_allowed`, computed by the same SQL function as `can_call_operator`; `operator.motion_lock_changed` event | §3 · §4 · EP §2 |
| UI-6 | seatbelt and nearest proximity not in the snapshot; `safety.proximity` missing | **Closed.** `machine.seatbelt_fastened`, `parking_brake`; `operator_state.nearest`; `safety.proximity` is in the registry | §3 · §4 |
| UI-7 | no forecast | **Closed.** `forecast_peak_c`, `forecast_peak_at` from the real archived hours later in the scenario day, labelled "scenario forecast" | §4 · DM §1.1 |
| UI-8 | no protocol card schema | **Closed.** `ProtocolCard` + select on `protocol_cards` | §4 |
| UI-9 | persona sign-in without shipping passwords | **Closed.** `demo-login` Edge Function (director secret) → `token_hash` → `verifyOtp` | §6 |
| UI-10 | dispatch events only on `sup:` | **Closed.** `dispatch.*` carry the alert's operator and the operator audience | §3 · DM §3.1 |
| UI-11 | no supervisor phone for offline `tel:` | **Closed.** `site.emergency_tel` in `my_snapshot`, read from Vault (no phone number in a table) | §4 |
| UI-12 | `task_start` from `paused`? expired override? | **Specified.** `task_start` is also resume (from planned/paused/blocked_ppe, re-checks PPE); an expired override returns `blocked` + `override_expired` and re-emits `ppe.missing` (no separate notification) | EP §4 · §4 `RpcErrorCode` |
| UI-13 | evidence keys not final | **Closed.** `EvidenceKey` enum published; per-type rows carry `details.type` | §8 |
| UI-14 | `sos_raise` needs lat/lon | **Closed.** Nullable; server falls back to machine, then site centre, and returns `location_source` | §4 |
| UI-15 | `retention_days`; `p_description` min 1 | **Closed.** `PRIVACY.retention_days = 90`; `p_description` nullable (server uses the type label) | §4 |
| UI-16 | language and pairing RPC | **Partly closed.** `pair_machine` exists (§4). **Language RPC rejected for P0**: the UI keeps the cookie locale, which is enough for the demo and avoids a profile write path; P1 | §4 |
| (row 14 of UI §4) | Vercel deploy → localhost | **Overridden:** deploy is P0, owned by Track B; the Android demo phone needs HTTPS for vibration/audio (BT §0, B0b) | BT |

