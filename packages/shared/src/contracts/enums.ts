/**
 * Enums and scalars (api-contracts §2). Every enum here is the single source for the Postgres
 * `create type … as enum` statements that `scripts/gen-sql-seed.ts` generates (data-model §0, G2-9).
 */
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
  "fault_continued_operation", "hydraulic_temp_drift", "coolant_temp_drift"]); // P1 types are added later (additive)
export const AlertKind = z.enum(["seatbelt_off_moving", "guardian_hazard", "proximity_zone", "ppe_missing",
  "anomaly_machine", "idle_excess", "sos", "ledger_tamper", "alert_flood"]);
export const PhotoCategory = z.enum(["hydraulic_leak", "fuel_leak", "coolant_leak", "tyre_damage",
  "structural_crack", "fire_smoke", "ppe_issue", "unknown"]);
// SQL-only enums (data-model §0), kept here so the database never carries a hand-written list
export const FaultSeverity = z.enum(["info", "caution", "derate", "shutdown"]);
export const FrameKind = z.enum(["telemetry", "gps", "operator_state", "weather", "fault", "ppe"]);
export const EventSource = z.enum(["detector.rule", "detector.ewma", "guardian", "user", "director", "system",
  "telegram", "twilio", "loader"]);
export const MachineHealth = z.enum(["ok", "caution", "fault"]);

export const Id = z.uuid();
export const Ts = z.iso.datetime({ offset: true });
export const Hash64 = z.string().regex(/^[0-9a-f]{64}$/);
export const RequestId = z.uuid();
export const LatLon = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
export const I18nText = z.object({ en: z.string(), hi: z.string().optional(), ta: z.string().optional() });

/** Postgres enum type name → zod enum (the order here is the order of the generated `create type`). */
export const SQL_ENUMS = {
  app_role: AppRole,
  audience: Audience,
  alert_tier: AlertTier,
  skill_level: SkillLevel,
  task_type: TaskType,
  task_status: TaskStatus,
  weather_kind: WeatherKind,
  fault_severity: FaultSeverity,
  run_status: RunStatus,
  frame_kind: FrameKind,
  alert_status: AlertStatus,
  ack_via: AckVia,
  dispatch_channel: DispatchChannel,
  dispatch_status: DispatchStatus,
  suppress_reason: SuppressReason,
  incident_type: IncidentType,
  lang: Lang,
  ppe_item: PpeItem,
  proximity_zone: ProximityZone,
  anomaly_type: AnomalyType,
  alert_kind: AlertKind,
  photo_category: PhotoCategory,
  machine_health: MachineHealth,
} as const;

export type AppRole = z.infer<typeof AppRole>;
export type Audience = z.infer<typeof Audience>;
export type AlertTier = z.infer<typeof AlertTier>;
export type AlertKind = z.infer<typeof AlertKind>;
export type AnomalyType = z.infer<typeof AnomalyType>;
export type TaskType = z.infer<typeof TaskType>;
export type WeatherKind = z.infer<typeof WeatherKind>;
export type SkillLevel = z.infer<typeof SkillLevel>;
export type Lang = z.infer<typeof Lang>;
