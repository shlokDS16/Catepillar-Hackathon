/**
 * RPC contracts (api-contracts §4). Argument names are the SQL parameter names (`p_…`). All RPCs are
 * security definer, role-checked and idempotent on `p_request_id`; errors are SQLSTATE P0001 with a
 * message from `RpcErrorCode`.
 */
import { z } from "zod";
import { AlertStatus, AppRole, Hash64, I18nText, Id, IncidentType, Lang, LatLon, MachineHealth, PpeItem,
  ProximityZone, RequestId, RunStatus, Speed, TaskStatus, TaskType, Ts } from "./enums";
import { ActiveAlert, EtaFactor, GenericEvent, LedgerCheckResult } from "./events";
import { ReplayDebriefResult } from "./replay";

export const RpcErrorCode = z.enum(["forbidden", "not_found", "invalid_state", "ppe_missing",
  "override_expired", "rate_limited", "validation", "not_paired", "ledger_busy"]); // ledger_busy: Verify waited 10 s (R2-5); the UI retries once

// Operator
export const PairMachineIn = z.object({ p_machine_code: z.string(), p_request_id: RequestId });   // G2-14
export const PairMachineOut = z.object({ machine_id: Id, paired_at: Ts });
export const TaskStartIn = z.object({ p_task_id: Id, p_request_id: RequestId,
  p_eta_p50_min: z.number().positive().nullable(), p_eta_p90_min: z.number().positive().nullable(),
  p_eta_factors: z.array(EtaFactor).nullable(), p_eta_model_version: z.string().nullable() });   // G2-9
export const TaskStartOut = z.discriminatedUnion("status", [
  z.object({ status: z.literal("started"), task_id: Id, started_at: Ts }),
  z.object({ status: z.literal("blocked"), task_id: Id, missing: z.array(PpeItem).min(1) }),
]);
export const TaskPauseIn = z.object({ p_task_id: Id, p_request_id: RequestId });
export const TaskCompleteIn = z.object({ p_task_id: Id, p_request_id: RequestId });
export const SosRaiseIn = z.object({ p_request_id: RequestId, p_lat: z.number().nullable(), p_lon: z.number().nullable(),
  p_note: z.string().max(280).nullable() });   // null location → paired machine, then site centre (UI-14)
export const SosRaiseOut = z.object({ alert_id: Id, escalate_at: Ts, server_now: Ts,
  location_source: z.enum(["device", "machine", "site"]) });   // the ledger entry arrives via incident.logged
export const SosCancelIn = z.object({ p_alert_id: Id, p_request_id: RequestId });
const NoControlChars = /^[^\u0000-\u001f]*$/;   // canonical rule 4 (data-model §4.3)
export const IncidentLogIn = z.object({ p_request_id: RequestId, p_incident_type: IncidentType,
  p_severity: z.number().int().min(1).max(5),
  p_description: z.string().max(2000).regex(NoControlChars).nullable(),   // null → the type label (UI-15)
  p_lat: z.number().nullable(), p_lon: z.number().nullable(), p_non_punitive: z.boolean(),
  p_source_event_id: Id.nullable() });
export const IncidentLogOut = z.object({ event_id: Id });   // the incident.reported event; the entry arrives via incident.logged (N3)
export const AlertAckIn = z.object({ p_alert_id: Id, p_request_id: RequestId });
export const AlertAckOut = z.object({ alert_id: Id, status: AlertStatus });

// Fleet manager
export const PpeOverrideIn = z.object({ p_task_id: Id, p_reason: z.string().min(10).max(500).regex(NoControlChars),
  p_request_id: RequestId });
export const PpeOverrideOut = z.object({ override_id: Id, valid_until: Ts });
export const LedgerVerifyIn = z.object({ p_from: z.number().int().min(1).default(1), p_to: z.number().int().nullable().default(null) });
export const LedgerVerifyOut = LedgerCheckResult.extend({ expected: Hash64.nullable(), stored: Hash64.nullable(),
  head_seq: z.number().int(), head_hash: Hash64 });   // internal consistency only
// Witness compare (N1, R2-2): the range comes from the fleet manager's Telegram message, typed by her;
// the BROWSER recomputes from exported rows; ledger_recompute is a convenience check only.
export const LedgerExportIn = z.object({ p_first_seq: z.number().int().min(1), p_last_seq: z.number().int().min(1) });
export const LedgerExportRow = z.object({ seq: z.string(), prev_hash: Hash64, entry_hash: Hash64, v: z.string(),
  canonical_fields: z.record(z.string(), z.unknown()) });   // text-formatted fields per canonical v1 (DM §4.3); max 5,000 rows
export const LedgerRecomputeIn = z.object({ p_first_seq: z.number().int().min(1), p_last_seq: z.number().int().min(1) });
export const LedgerRecomputeOut = z.object({ first_seq: z.number().int(), last_seq: z.number().int(),
  leaf_count: z.number().int(), root_hex: Hash64, head_hash: Hash64 });   // computed from ledger rows only
export const WITNESS_LINE = /^SPOTTER-LEDGER v1 seq=(\d+)\.\.(\d+) n=(\d+) root=([0-9a-f]{64}) head=([0-9a-f]{64})/;
export const NearMissListOut = z.array(z.object({ incident_id: Id, seq: z.number().int(), occurred_at: Ts,
  operator_pseudonym: z.string(), description: z.string(), severity: z.number().int() }));

// Training
export const LessonCompleteIn = z.object({ p_assignment_id: Id, p_quiz_score: z.number().min(0).max(100), p_request_id: RequestId });
export const ReplaySubmitIn = z.object({ p_replay_id: Id, p_request_id: RequestId,
  p_open_order: z.array(z.string()),                                   // evidence card ids in the order opened (D10)
  p_choices: z.array(z.object({ step: z.number().int(), choice_ids: z.array(z.string()).min(1), ms: z.number().int().min(0) })) });
export const ReplaySubmitOut = ReplayDebriefResult;                   // §5 (D10 debrief; UI-3 review included)
export const ReplayGetIn = z.object({ p_replay_id: Id });             // rpc replay_get → ReplayScenario (UI-3)
export const LessonAssignIn = z.object({ p_operator_id: Id, p_lesson_code: z.string(),
  p_because_event_id: Id.nullable(), p_request_id: RequestId });      // trainer

// Privacy
export const ConsentSetIn = z.object({ p_version: z.string(), p_granted: z.boolean(), p_request_id: RequestId });
export const PRIVACY = { retention_days: 90, consent_version: "1" } as const;   // UI-15

// Protocol cards (UI-8): read with select on protocol_cards (all roles)
export const ProtocolCard = z.object({ id: z.string(), title: I18nText, steps: z.array(I18nText).min(1).max(6),
  pictogram: z.string(), upwind_hint: z.boolean(), version: z.number().int() });

// Bootstrap
export const SnapshotTask = z.object({ id: Id, task_type: TaskType, status: TaskStatus, planned_start: Ts,
  progress_pct: z.number(), eta_p50_min: z.number().nullable(), eta_p90_min: z.number().nullable(),
  eta_factors: z.array(EtaFactor).nullable() });                                                  // G2-9: array everywhere
export const SnapshotMachine = z.object({ id: Id, code: z.string(), model_name: z.string().nullable(), moving: z.boolean(),
  speed_kmh: z.number(), health: MachineHealth, location: LatLon,
  seatbelt_fastened: z.boolean().nullable(), parking_brake: z.boolean().nullable() });            // UI-6
export const SnapshotOperatorState = z.object({ on_foot: z.boolean().nullable(), ppe: z.partialRecord(PpeItem, z.boolean()),
  location: LatLon.nullable(), ts: Ts,
  motion_locked: z.boolean(), call_allowed: z.boolean(),                                         // UI-5 (server-computed)
  nearest: z.object({ kind: z.enum(["person", "machine"]), id: Id, distance_m: z.number(),
    zone: ProximityZone }).nullable() });                                                         // UI-6
export const SnapshotWeather = z.object({ ts: Ts, temperature_c: z.number(), wbgt_c: z.number().nullable(),
  wind_chill_c: z.number().nullable(), wind_kmh: z.number(),
  forecast_peak_c: z.number().nullable(), forecast_peak_at: Ts.nullable(),                       // UI-7 (scenario forecast)
  source_label: z.string() });                                                                    // e.g. Open-Meteo archive, CC BY 4.0
export const MySnapshotOut = z.object({
  contracts_version: z.string(),
  profile: z.object({ user_id: Id, role: AppRole, operator_id: Id.nullable(), site_id: Id, language: Lang }),
  server_now: Ts,                                                                                 // UI-4
  run: z.object({ id: Id, status: RunStatus, speed: Speed, sim_now: Ts }).nullable(),
  site: z.object({ id: Id, name: z.string(), emergency_tel: z.string().nullable() }),            // UI-11 (from Vault, not a table)
  paired_machine_id: Id.nullable(),
  tasks: z.array(SnapshotTask),
  active_alerts: z.array(ActiveAlert),
  machine: SnapshotMachine.nullable(),
  operator_state: SnapshotOperatorState.nullable(),
  weather: SnapshotWeather.nullable(),
  assignments: z.array(z.object({ id: Id, lesson_code: z.string(), because_event_id: Id.nullable(),
    replay_id: Id.nullable() })),
  recent_events: z.array(GenericEvent).max(50),
});

export type MySnapshotOut = z.infer<typeof MySnapshotOut>;
export type ProtocolCard = z.infer<typeof ProtocolCard>;
export type RpcErrorCode = z.infer<typeof RpcErrorCode>;
