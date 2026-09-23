/** Event envelope and payload schemas (api-contracts §3). Numbers only where the UI renders localised text. */
import { z } from "zod";
import { AckVia, AlertKind, AlertStatus, AlertTier, AnomalyType, AppRole, Audience, DispatchChannel,
  DispatchStatus, EventSource, Hash64, Id, IncidentType, PpeItem, ProximityZone, RunStatus, Speed,
  SuppressReason, TaskStatus, Ts } from "./enums";

export const EventEnvelopeBase = z.object({
  id: Id, seq: z.number().int().positive(), run_id: Id.nullable(), type: z.string(),
  tier: AlertTier.nullable(), sim_ts: Ts.nullable(), recorded_at: Ts,
  site_id: Id.nullable(), machine_id: Id.nullable(), operator_id: Id.nullable(),
  task_id: Id.nullable(), alert_id: Id.nullable(),
  audiences: z.array(Audience).min(1),
  source: EventSource,
  correlation_id: Id.nullable(), causation_id: Id.nullable(), idempotency_key: z.string().min(3).max(200),
});

export const SeatbeltBreach = z.object({ frame_seq: z.number().int(), speed_kmh: z.number(),
  pitch_deg: z.number(), roll_deg: z.number(), slope_limit_deg: z.number(), zone_id: Id.nullable() });
export const Overspeed = z.object({ frame_seq: z.number().int(), speed_kmh: z.number(), limit_kmh: z.number(), zone_id: Id.nullable() });
export const SlopeExceeded = z.object({ frame_seq: z.number().int(), pitch_deg: z.number(), roll_deg: z.number(), limit_deg: z.number() });
export const Proximity = z.object({ other_kind: z.enum(["person", "machine"]), other_id: Id,
  distance_m: z.number(), zone: ProximityZone });
export const OrganiserAlert = z.object({ raw: z.string().max(200) });
export const AnomalyDetected = z.object({ anomaly_id: Id, anomaly_type: AnomalyType,
  method: z.enum(["rule", "ewma"]), severity_score: z.number().int().min(0).max(100),
  severity_tier: AlertTier,                                                  // from severity_score bands (§12)
  explanation: z.object({ en: z.string(), hi: z.string() }),                 // rendered from fixed templates, never by an LLM
  fuel_l: z.number().nullable(), cost_inr: z.number().nullable(),            // null where no fuel effect
  features: z.record(z.string(), z.number()), lat: z.number(), lon: z.number() });
export const GuardianHazard = z.object({ anomaly_id: Id, machine_code: z.string(), distance_m: z.number(),
  bearing_deg: z.number(), wind_from_deg: z.number().nullable(), zone: ProximityZone, protocol_card_id: z.string() });
export const AlertRaised = z.object({ alert_id: Id, kind: AlertKind, tier: AlertTier, needs_ack: z.boolean(),
  escalate_at: Ts.nullable(), occurrences: z.number().int(), protocol_card_id: z.string().nullable(),
  upgraded_from: AlertTier.nullable() });
export const AlertAcknowledged = z.object({ alert_id: Id, via: AckVia, by_role: AppRole.nullable() });
export const AlertEscalated = z.object({ alert_id: Id, level: z.number().int(), to: z.array(z.string()) });
export const AlertSuppressed = z.object({ alert_id: Id, reason: SuppressReason, suppressed_by: Id.nullable() });
export const AlertResolved = z.object({ alert_id: Id, via: AckVia.nullable() });
export const DispatchUpdate = z.object({ dispatch_id: Id, channel: DispatchChannel, status: DispatchStatus,
  reason: SuppressReason.or(z.enum(["provider_error", "no_answer"])).nullable() });
export const SosRaised = z.object({ alert_id: Id, lat: z.number(), lon: z.number(), abuse_suspected: z.boolean() });
export const SosCancelled = z.object({ alert_id: Id });
export const PpeMissing = z.object({ task_id: Id.nullable(), missing: z.array(PpeItem).min(1) });
export const PpeRestored = z.object({ items: z.array(PpeItem) });
export const PpeOverride = z.object({ task_id: Id, override_id: Id, reason: z.string().min(10).max(500),
  missing: z.array(PpeItem) });
export const EtaFactor = z.object({ key: z.string(), multiplier: z.number(), assumed: z.boolean() });
export const TaskChange = z.object({ task_id: Id, status: TaskStatus, progress_pct: z.number(),
  eta_p50_min: z.number().nullable(), eta_p90_min: z.number().nullable() });
export const IncidentLogged = z.object({ incident_id: Id, seq: z.number().int(), incident_type: IncidentType,
  entry_hash: Hash64, ledger_queue_id: z.number().int() });
export const LedgerCheckReason = z.enum(["seq_gap", "link_broken", "hash_mismatch", "anchor_mismatch", "witness_mismatch"]);
export const LedgerCheckResult = z.object({ ok: z.boolean(), checked: z.number().int(),
  first_bad_seq: z.number().int().nullable(), reason: LedgerCheckReason.nullable() });
export const LedgerCheckpoint = z.object({ root_id: Id, root_hex: Hash64, head_hash: Hash64,
  first_seq: z.number().int(), last_seq: z.number().int(), telegram_message_id: z.number().int().nullable() });
export const LessonAssigned = z.object({ assignment_id: Id, lesson_code: z.string(), because_event_id: Id.nullable() });
export const LessonCompleted = z.object({ assignment_id: Id, quiz_score: z.number() });
export const ReplayReady = z.object({ replay_id: Id, source_event_id: Id });
export const ReplayScores = z.object({ safety: z.number().min(0).max(100), procedure: z.number().min(0).max(100),
  efficiency: z.number().min(0).max(100) });
export const ReplayCompleted = z.object({ replay_id: Id, attempt_id: Id, scores: ReplayScores });   // identical to the debrief (UI-19)
export const ScenarioChange = z.object({ status: RunStatus, speed: Speed, sim_now: Ts });
export const IncidentReported = z.object({ incident_type: IncidentType, severity: z.number().int().min(1).max(5),
  description: z.string(), non_punitive: z.boolean(), lat: z.number().nullable(), lon: z.number().nullable() });
export const MotionLockChanged = z.object({ motion_locked: z.boolean(), call_allowed: z.boolean(),
  reason: z.enum(["moving", "parked", "on_foot", "state_unknown"]) });
export const SystemWarning = z.object({ code: z.enum(["db_size_warning", "tick_overrun"]), value: z.number() });
export const FrameSeq = z.object({ frame_seq: z.number().int() });
export const AnomalyRef = z.object({ anomaly_id: Id });

/** Envelope with an unvalidated payload, for lists that may hold types newer than this contract. */
export const GenericEvent = EventEnvelopeBase.extend({ payload: z.record(z.string(), z.unknown()) });
/** Alert row as the snapshot shows it (`active_alerts`). */
export const ActiveAlert = AlertRaised.extend({ status: AlertStatus, first_seen: Ts });

export type EventEnvelopeBase = z.infer<typeof EventEnvelopeBase>;
export type EtaFactor = z.infer<typeof EtaFactor>;
export type ReplayScores = z.infer<typeof ReplayScores>;
