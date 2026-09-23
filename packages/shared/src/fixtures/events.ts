/** One valid payload per registered event type (api-contracts §1: one example per schema). */
import type { z } from "zod";
import type { EVENT_REGISTRY, EventType } from "../contracts/registry";
import { IDS, T0, T1 } from "./ids";

const HASH1 = "b04bf3cbe21a368128e2f5eb4d7d0d8a3b3a8491f84998aa2869e3cb88b51181";
const taskChange = { task_id: IDS.task, status: "in_progress" as const, progress_pct: 35, eta_p50_min: 52, eta_p90_min: 61 };
const dispatchUpdate = { dispatch_id: IDS.dispatch, channel: "telegram" as const, status: "sent" as const, reason: null };
const scenarioChange = { status: "playing" as const, speed: 10 as const, sim_now: T0 };
const ledgerCheck = { ok: true, checked: 214, first_bad_seq: null, reason: null };
const ppeMissing = { task_id: IDS.task, missing: ["vest" as const] };

export const seatbeltBreachPayload = { frame_seq: 2400, speed_kmh: 6.2, pitch_deg: 17.4, roll_deg: 2.1, slope_limit_deg: 15, zone_id: IDS.zone };
export const alertRaisedPayload = { alert_id: IDS.alert, kind: "seatbelt_off_moving" as const, tier: "warning" as const,
  needs_ack: true, escalate_at: "2026-09-24T09:40:21.250+05:30", occurrences: 1, protocol_card_id: null, upgraded_from: null };

type Payloads = { [T in EventType]: z.input<(typeof EVENT_REGISTRY)[T]["payload"]> };
export const EVENT_PAYLOADS: Payloads = {
  "safety.seatbelt_breach": seatbeltBreachPayload,
  "safety.seatbelt_resolved": { frame_seq: 2460 },
  "safety.overspeed": { frame_seq: 2500, speed_kmh: 24, limit_kmh: 15, zone_id: IDS.zone },
  "safety.slope_exceeded": { frame_seq: 2510, pitch_deg: 18.2, roll_deg: 1.4, limit_deg: 15 },
  "safety.proximity": { other_kind: "machine", other_id: IDS.machine, distance_m: 12, zone: "warning" },
  "safety.organiser_alert": { raw: "SEATBELT_UNFASTENED_MOVING" },
  "anomaly.detected": { anomaly_id: IDS.anomaly, anomaly_type: "idle_excess", method: "rule", severity_score: 42, severity_tier: "caution",
    explanation: { en: "EXC-007 idled 58% of the last hour, 2.3× its normal. About 14 L of diesel (≈ ₹1,290).",
      hi: "EXC-007 पिछले एक घंटे में 58% समय खाली चली, सामान्य से 2.3 गुना। लगभग 14 लीटर डीज़ल (≈ ₹1,290)।" },
    fuel_l: 14, cost_inr: 1290, features: { idle_pct: 58, ratio: 2.3 }, lat: 21.1463, lon: 79.0882 },
  "anomaly.cleared": { anomaly_id: IDS.anomaly },
  "guardian.hazard_near_operator": { anomaly_id: IDS.anomaly, machine_code: "EXC-014", distance_m: 38, bearing_deg: 215,
    wind_from_deg: 250, zone: "warning", protocol_card_id: "hydraulic_fault" },
  "guardian.hazard_cleared": { anomaly_id: IDS.anomaly },
  "alert.raised": alertRaisedPayload,
  "alert.acknowledged": { alert_id: IDS.alert, via: "app", by_role: "operator" },
  "alert.escalated": { alert_id: IDS.alert, level: 1, to: ["supervisor_telegram"] },
  "alert.resolved": { alert_id: IDS.alert, via: "sensor" },
  "alert.suppressed": { alert_id: IDS.alert, reason: "dedupe", suppressed_by: IDS.alert },
  "dispatch.sent": dispatchUpdate,
  "dispatch.delivered": { ...dispatchUpdate, status: "delivered" },
  "dispatch.answered": { ...dispatchUpdate, channel: "twilio_voice", status: "answered" },
  "dispatch.failed": { ...dispatchUpdate, status: "failed", reason: "provider_error" },
  "dispatch.suppressed": { ...dispatchUpdate, status: "suppressed", reason: "motion_lock" },
  "sos.raised": { alert_id: IDS.alert, lat: 21.1463, lon: 79.0882, abuse_suspected: false },
  "sos.cancelled": { alert_id: IDS.alert },
  "ppe.missing": ppeMissing,
  "ppe.restored": { items: ["vest"] },
  "ppe.override_granted": { task_id: IDS.task, override_id: IDS.override, reason: "Vest torn; replacement issued at the gate.", missing: ["vest"] },
  "task.started": taskChange,
  "task.paused": { ...taskChange, status: "paused" },
  "task.completed": { ...taskChange, status: "completed", progress_pct: 100 },
  "task.progress": { ...taskChange, progress_pct: 40 },
  "task.start_blocked": ppeMissing,
  "incident.reported": { incident_type: "near_miss", severity: 3, description: "Reversing truck came within 5 m.", non_punitive: true, lat: 21.1463, lon: 79.0882 },
  "incident.logged": { incident_id: IDS.incident, seq: 214, incident_type: "seatbelt_breach", entry_hash: HASH1, ledger_queue_id: 991 },
  "operator.motion_lock_changed": { motion_locked: true, call_allowed: false, reason: "moving" },
  "ledger.verified": ledgerCheck,
  "ledger.tamper_detected": { ok: false, checked: 214, first_bad_seq: 214, reason: "hash_mismatch" },
  "ledger.checkpoint_published": { root_id: IDS.root, root_hex: HASH1, head_hash: HASH1, first_seq: 1, last_seq: 214, telegram_message_id: 5 },
  "training.lesson_assigned": { assignment_id: IDS.assignment, lesson_code: "seatbelt_slopes", because_event_id: IDS.event },
  "training.lesson_completed": { assignment_id: IDS.assignment, quiz_score: 100 },
  "training.replay_ready": { replay_id: IDS.replay, source_event_id: IDS.event },
  "training.replay_completed": { replay_id: IDS.replay, attempt_id: IDS.attempt, scores: { safety: 80, procedure: 66.7, efficiency: 100 } },
  "scenario.started": scenarioChange,
  "scenario.paused": { ...scenarioChange, status: "paused" },
  "scenario.resumed": scenarioChange,
  "scenario.speed_changed": { ...scenarioChange, speed: 60 },
  "scenario.jumped": scenarioChange,
  "scenario.finished": { ...scenarioChange, status: "finished" },
  "system.warning": { code: "db_size_warning", value: 412 },
};

/** The demo's seatbelt breach as a full event row (the fixture Track F renders first). */
export const seatbeltBreachEvent = {
  id: IDS.event, seq: 214, run_id: IDS.run, type: "safety.seatbelt_breach" as const, tier: "warning" as const,
  sim_ts: T0, recorded_at: T1, site_id: IDS.site, machine_id: IDS.machine, operator_id: IDS.operator,
  task_id: IDS.task, alert_id: IDS.alert, audiences: ["operator", "supervisor", "trainer"] as const,
  source: "detector.rule" as const, correlation_id: null, causation_id: null,
  idempotency_key: `det:${IDS.run}:EXC-007:seatbelt_off_moving:2400`,
  payload: seatbeltBreachPayload,
};
