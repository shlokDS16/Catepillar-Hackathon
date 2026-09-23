/**
 * One valid example per contract (api-contracts §1, §9). Track F codes against these until IP1; the
 * contract tests parse each one, check the parse is lossless, and check that a nested break fails.
 * Event payloads for all 47 types are in ./events; ids and times in ./ids.
 */
import { z } from "zod";
import { TaskAnalyticsRow } from "../contracts/analytics";
import { AudioManifestEntry, Phrase } from "../contracts/audio";
import { EvidenceMetric } from "../contracts/evidence";
import { AskRequest, AskResponse, DemoLoginRequest, DemoLoginResponse, DirectorRequest, DirectorResponse, DispatchRequest } from "../contracts/functions";
import { LessonContent } from "../contracts/lesson";
import { ClockTick, MachineDelta } from "../contracts/realtime";
import { EVENT_TYPES, eventSchema, type EventType } from "../contracts/registry";
import { EvidenceCard, ReplayDebriefResult, ReplayScenario } from "../contracts/replay";
import { AlertAckIn, AlertAckOut, ConsentSetIn, IncidentLogIn, IncidentLogOut, LedgerExportIn, LedgerExportRow, LedgerRecomputeOut,
  LedgerVerifyIn, LedgerVerifyOut, LessonAssignIn, LessonCompleteIn, MySnapshotOut, NearMissListOut, PairMachineIn, PairMachineOut,
  PpeOverrideIn, PpeOverrideOut, ProtocolCard, ReplayGetIn, ReplaySubmitIn, SosCancelIn, SosRaiseIn, SosRaiseOut, TaskCompleteIn,
  TaskPauseIn, TaskStartIn, TaskStartOut } from "../contracts/rpc";
import { EtaEstimate, estimateEta } from "../eta/model";
import { EVENT_PAYLOADS, alertRaisedPayload, seatbeltBreachEvent } from "./events";
import { IDS, T0, T1, i18n } from "./ids";

export { EVENT_PAYLOADS, alertRaisedPayload, seatbeltBreachEvent } from "./events";
export { IDS, T0, T1 } from "./ids";

const HASH0 = "0".repeat(64);
const HASH1 = "b04bf3cbe21a368128e2f5eb4d7d0d8a3b3a8491f84998aa2869e3cb88b51181";
const pt = (t_ms: number, lat: number, lon: number) => ({ t_ms, lat, lon });

// ── ETA: built by the model itself, so the numbers can never drift from estimateEta ──────────────────
export const etaInput = { task_type: "excavation" as const, weather: "hot" as const, operator_skill: "novice" as const,
  machine_age_years: 7, temperature_c: 41, wind_kmh: 12, shift_hour: 14 };
export const etaEstimate = estimateEta(etaInput);

// ── Bootstrap ───────────────────────────────────────────────────────────────────────────────────────
export const mySnapshot = {
  contracts_version: "1.0.0",
  profile: { user_id: IDS.user, role: "operator" as const, operator_id: IDS.operator, site_id: IDS.site, language: "hi" as const },
  server_now: T1,
  run: { id: IDS.run, status: "playing" as const, speed: 10 as const, sim_now: T0 },
  site: { id: IDS.site, name: "Nagpur quarry", emergency_tel: "+910000000000" },
  paired_machine_id: IDS.machine,
  tasks: [{
    id: IDS.task, task_type: "excavation" as const, status: "in_progress" as const,
    planned_start: "2026-09-24T09:00:00.000+05:30", progress_pct: 35,
    eta_p50_min: etaEstimate.p50_min, eta_p90_min: etaEstimate.p90_min, eta_factors: etaEstimate.factors,
  }],
  active_alerts: [{ ...alertRaisedPayload, status: "open" as const, first_seen: T1 }],
  machine: {
    id: IDS.machine, code: "EXC-007", model_name: "Cat 320", moving: true, speed_kmh: 6.2, health: "ok" as const,
    location: { lat: 21.1463, lon: 79.0882 }, seatbelt_fastened: false, parking_brake: false,
  },
  operator_state: {
    on_foot: false, ppe: { helmet: true, vest: true }, location: { lat: 21.1463, lon: 79.0882 }, ts: T0,
    motion_locked: true, call_allowed: false,
    nearest: { kind: "machine" as const, id: IDS.machine, distance_m: 0, zone: "awareness" as const },
  },
  weather: {
    ts: T0, temperature_c: 38.5, wbgt_c: 31.2, wind_chill_c: null, wind_kmh: 12,
    forecast_peak_c: 44, forecast_peak_at: "2026-09-24T14:00:00.000+05:30",
    source_label: "Open-Meteo archive, CC BY 4.0 (scenario forecast)",
  },
  assignments: [{ id: IDS.assignment, lesson_code: "seatbelt_slopes", because_event_id: IDS.event, replay_id: IDS.replay }],
  recent_events: [seatbeltBreachEvent],
};

// ── RPC inputs and outputs ──────────────────────────────────────────────────────────────────────────
export const rpc = {
  pairMachineIn: { p_machine_code: "EXC-007", p_request_id: IDS.request },
  pairMachineOut: { machine_id: IDS.machine, paired_at: T1 },
  taskStartIn: { p_task_id: IDS.task, p_request_id: IDS.request, p_eta_p50_min: etaEstimate.p50_min, p_eta_p90_min: etaEstimate.p90_min,
    p_eta_factors: etaEstimate.factors, p_eta_model_version: etaEstimate.model_version },
  taskStartOutStarted: { status: "started" as const, task_id: IDS.task, started_at: T1 },
  taskStartOutBlocked: { status: "blocked" as const, task_id: IDS.task, missing: ["vest" as const] },
  taskPauseIn: { p_task_id: IDS.task, p_request_id: IDS.request },
  taskCompleteIn: { p_task_id: IDS.task, p_request_id: IDS.request },
  sosRaiseIn: { p_request_id: IDS.request, p_lat: null, p_lon: null, p_note: "Trapped near Bench 3" },
  sosRaiseOut: { alert_id: IDS.alert, escalate_at: "2026-09-24T09:41:01.250+05:30", server_now: T1, location_source: "machine" as const },
  sosCancelIn: { p_alert_id: IDS.alert, p_request_id: IDS.request },
  incidentLogIn: { p_request_id: IDS.request, p_incident_type: "near_miss" as const, p_severity: 3,
    p_description: "Reversing truck came within 5 m.", p_lat: 21.1463, p_lon: 79.0882, p_non_punitive: true, p_source_event_id: null },
  incidentLogOut: { event_id: IDS.event },
  alertAckIn: { p_alert_id: IDS.alert, p_request_id: IDS.request },
  alertAckOut: { alert_id: IDS.alert, status: "acknowledged" as const },
  ppeOverrideIn: { p_task_id: IDS.task, p_reason: "Vest torn; replacement issued at the gate.", p_request_id: IDS.request },
  ppeOverrideOut: { override_id: IDS.override, valid_until: "2026-09-24T09:55:01.250+05:30" },
  ledgerVerifyIn: { p_from: 1, p_to: null },
  ledgerVerifyOut: { ok: false, checked: 214, first_bad_seq: 214, reason: "hash_mismatch" as const,
    expected: HASH1, stored: "a".repeat(64), head_seq: 214, head_hash: HASH1 },
  ledgerExportIn: { p_first_seq: 1, p_last_seq: 214 },
  ledgerExportRow: { seq: "1", prev_hash: HASH0, entry_hash: HASH1, v: "1",
    canonical_fields: { seq: "1", v: "1", prev_hash: HASH0, incident_type: "seatbelt_breach", severity: "4", lat: "21.146300", lon: "79.088200" } },
  ledgerRecomputeOut: { first_seq: 1, last_seq: 214, leaf_count: 214, root_hex: HASH1, head_hash: HASH1 },
  nearMissListOut: [{ incident_id: IDS.incident, seq: 12, occurred_at: T0, operator_pseudonym: "Operator-7F2",
    description: "Reversing truck came within 5 m.", severity: 3 }],
  lessonCompleteIn: { p_assignment_id: IDS.assignment, p_quiz_score: 100, p_request_id: IDS.request },
  replayGetIn: { p_replay_id: IDS.replay },
  replaySubmitIn: { p_replay_id: IDS.replay, p_request_id: IDS.request, p_open_order: ["c_trend", "c_card"],
    p_choices: [{ step: 1, choice_ids: ["stop"], ms: 4200 }, { step: 3, choice_ids: ["a", "b", "c"], ms: 11000 }] },
  lessonAssignIn: { p_operator_id: IDS.operator, p_lesson_code: "seatbelt_slopes", p_because_event_id: IDS.event, p_request_id: IDS.request },
  consentSetIn: { p_version: "1", p_granted: true, p_request_id: IDS.request },
};

export const protocolCard = {
  id: "hydraulic_fault", title: i18n("Hydraulic fault nearby", "पास में हाइड्रोलिक फ़ॉल्ट"),
  steps: [
    i18n("Stay clear of the machine.", "मशीन से दूर रहें।"),
    i18n("Move upwind.", "हवा की दिशा में जाएँ।"),
    i18n("Radio your supervisor.", "सुपरवाइज़र को रेडियो करें।"),
  ],
  pictogram: "hazard-hydraulic", upwind_hint: true, version: 1,
};

// ── Replay (all seven evidence card types) ──────────────────────────────────────────────────────────
export const evidenceCards = {
  telemetry_trend: { type: "telemetry_trend" as const, id: "c_trend", title: i18n("Speed and pitch", "गति और झुकाव"),
    series: [
      { metric: "speed_kmh" as const, points: [{ t_ms: 0, v: 0 }, { t_ms: 60000, v: 6.2 }] },
      { metric: "pitch_deg" as const, points: [{ t_ms: 0, v: 3 }, { t_ms: 60000, v: 17.4 }] },
    ] },
  wind: { type: "wind" as const, id: "c_wind", title: i18n("Wind", "हवा"), from_deg: 250, kmh: 12, gust_kmh: 22 },
  map_snapshot: { type: "map_snapshot" as const, id: "c_map", title: i18n("Site map", "साइट नक्शा"),
    center: { lat: 21.1463, lon: 79.0882 }, zoom: 17,
    zones: [{ id: IDS.zone, name: "Bench 3", zone_type: "work",
      polygon: [{ lat: 21.146, lon: 79.088 }, { lat: 21.147, lon: 79.088 }, { lat: 21.147, lon: 79.089 }] }],
    trail: [pt(0, 21.1462, 79.0881)], machine_track: [pt(0, 21.1463, 79.0882)] },
  fault_code: { type: "fault_code" as const, id: "c_fault", title: i18n("Fault codes", "फ़ॉल्ट कोड"),
    codes: [{ code_type: "j1939_spn_fmi", code: "SPN 100 FMI 1", severity: "caution", description: i18n("Engine oil pressure low", "इंजन तेल दबाव कम") }] },
  protocol_card: { type: "protocol_card" as const, id: "c_card", title: i18n("Protocol card", "प्रोटोकॉल कार्ड"), card_id: "seatbelt_slopes" },
  weather: { type: "weather" as const, id: "c_weather", title: i18n("Weather", "मौसम"), temperature_c: 38.5, wbgt_c: 31.2 },
  shift_hours: { type: "shift_hours" as const, id: "c_shift", title: i18n("Hours on shift", "शिफ्ट के घंटे"), hours_on_shift: 3.7,
    circadian_band: "normal" as const },
};

export const replayScenario = {
  id: IDS.replay, event_id: IDS.event, event_type: "safety.seatbelt_breach" as const, occurred_sim_ts: T0,
  machine_code: "EXC-007", summary: i18n("Seatbelt off on a 17° slope", "17° ढलान पर सीटबेल्ट खुली"),
  brief: {
    title: i18n("What happened", "क्या हुआ"),
    situation: i18n("At 09:40 EXC-007 moved at 6 km/h on Bench 3 with the seatbelt off.", "09:40 पर EXC-007 बेंच 3 पर 6 किमी/घंटा चली, सीटबेल्ट खुली थी।"),
    goal: i18n("Find what mattered, then decide.", "जो मायने रखता है उसे ढूँढें, फिर निर्णय लें।"),
    time_budget_s: 60, audio_id: "replay.safety.seatbelt_breach.brief",
  },
  investigate: { cards: Object.values(evidenceCards), max_open: 4 },
  decide: { steps: [
    { step: 1, prompt: i18n("First action?", "पहला कदम?"), audio_id: null, time_limit_s: 15, kind: "single" as const,
      choices: [{ id: "stop", label: i18n("Stop the machine", "मशीन रोकें"), pictogram: "stop" },
        { id: "continue", label: i18n("Keep going", "चलते रहें"), pictogram: "go" }] },
    { step: 2, prompt: i18n("Then?", "फिर?"), audio_id: null, time_limit_s: 15, kind: "single" as const,
      choices: [{ id: "belt", label: i18n("Fasten the seatbelt", "सीटबेल्ट लगाएँ"), pictogram: "belt" },
        { id: "radio", label: i18n("Radio", "रेडियो"), pictogram: "radio" }] },
    { step: 3, prompt: i18n("Order the protocol", "प्रोटोकॉल क्रम"), audio_id: null, time_limit_s: 20, kind: "order" as const,
      choices: [{ id: "a", label: i18n("Park", "पार्क"), pictogram: "park" }, { id: "b", label: i18n("Report", "रिपोर्ट"), pictogram: "report" },
        { id: "c", label: i18n("Resume", "फिर शुरू"), pictogram: "go" }] },
  ] },
  reenactment: {
    duration_ms: 120000, trail: [pt(0, 21.1462, 79.0881), pt(60000, 21.1464, 79.0883)],
    machine_track: [{ ...pt(0, 21.1463, 79.0882), speed_kmh: 6.2, pitch_deg: 17.4 }],
    wind: [{ t_ms: 0, from_deg: 250, kmh: 12 }], real_response_ms: 8400,
  },
};

export const replayDebrief = {
  scores: { safety: 80, procedure: 66.7, efficiency: 100 },
  process_trace: {
    opened: ["c_trend", "c_card"], ideal: ["c_trend", "c_map", "c_card"],
    relevant: [
      { card_id: "c_trend", relevant: true, why: i18n("Pitch crossed 15°.", "झुकाव 15° से ऊपर गया।") },
      { card_id: "c_weather", relevant: false, why: i18n("Heat did not cause this.", "गर्मी कारण नहीं थी।") },
    ],
  },
  review: [
    { step: 1, chosen: ["stop"], best: ["stop"], why: i18n("Stop first.", "पहले रोकें।") },
    { step: 2, chosen: [], best: ["belt"], why: i18n("Timed out.", "समय समाप्त।") },
  ],
  rule: { card_id: "seatbelt_slopes", audio_id: "replay.safety.seatbelt_breach.rule",
    text: i18n("Seatbelt on before the machine moves; never on a slope without it.", "मशीन चलने से पहले सीटबेल्ट; ढलान पर कभी बिना नहीं।") },
  lesson_code: "seatbelt_slopes",
};

export const lessonContent = {
  code: "seatbelt_slopes", title: i18n("Seatbelt on slopes", "ढलान पर सीटबेल्ट"), duration_s: 90,
  cards: [
    { id: "k1", kind: "rule" as const, title: i18n("The rule", "नियम"), body: i18n("Fasten before moving.", "चलने से पहले लगाएँ।"),
      pictogram: "belt", image_path: null, audio_id: "lesson.seatbelt_slopes.k1" },
    { id: "k2", kind: "why" as const, title: i18n("Why", "क्यों"), body: i18n("Rollovers throw you out.", "पलटने पर बाहर गिरते हैं।"),
      pictogram: "rollover", image_path: null, audio_id: null },
    { id: "k3", kind: "check" as const, title: i18n("Check", "जाँच"), body: i18n("Click, tug, go.", "क्लिक, खींचो, चलो।"),
      pictogram: "check", image_path: null, audio_id: null },
  ],
  quiz: [1, 2, 3].map((n) => ({
    id: `q${n}`, prompt: i18n(`Question ${n}`, `प्रश्न ${n}`),
    choices: [{ id: "a", label: i18n("Yes", "हाँ"), pictogram: "yes" }, { id: "b", label: i18n("No", "नहीं"), pictogram: "no" }],
    correct_id: "a", why: i18n("Because.", "क्योंकि।"),
  })),
  video_path: null, source_refs: ["osha:1926.602"],
};

// ── Edge Functions and Realtime ─────────────────────────────────────────────────────────────────────
export const askRequest = { request_id: IDS.request, question: "What is this leak?", lang: "hi" as const,
  photo_path: `${IDS.user}/${IDS.request}.jpg`, history: [] };
export const askResponse = {
  request_id: IDS.request, status: "answered" as const, refusal_reason: null,
  answer: {
    steps: [{ text: "Stay clear of the machine and move upwind.", cited_ids: ["kb:osha-3120:p4"] }],
    rule: { text: "Do not operate equipment with a known hydraulic leak.", cited_id: "kb:osha-3120:p4" },
    grounded: true, handover_to_supervisor: true, proposed_action: null,
  },
  citations: [{ id: "kb:osha-3120:p4", kind: "doc" as const, title: "OSHA 3120", page: 4,
    snippet: "Do not operate equipment with a known hydraulic leak.", review_status: "reviewed" as const }],
  photo: { category: "hydraulic_leak" as const, confidence: 0.87 },
  provider_served: "groq_a" as const, model: "openai/gpt-oss-120b", fallback_used: null, latency_ms: 4210,
};
export const directorRequest = { request_id: IDS.request,
  command: { cmd: "new_run" as const, scenario_code: "review1", speed: 10 as const, rehearsal: true } };
export const directorResponse = { ok: true, run_id: IDS.run, message: null };
export const demoLoginRequest = { persona: "ravi" as const };
export const demoLoginResponse = { token_hash: "pkce_0123456789abcdef", type: "email" as const };
export const dispatchRequest = { dispatch_id: IDS.dispatch };
export const clockTick = { run_id: IDS.run, status: "playing" as const, speed: 10 as const, sim_now: T0, server_now: T1 };
export const machineDelta = { run_id: IDS.run, sim_ts: T0,
  machines: [{ machine_id: IDS.machine, code: "EXC-007", lat: 21.1463, lon: 79.0882, moving: true, health: "ok" as const }] };

// ── Evidence, analytics, audio ──────────────────────────────────────────────────────────────────────
export const evidenceMetric = { metric_key: "detector.precision" as const, value: 0.91, n: 120, details: { type: "idle_excess" },
  dataset_version: "gen-v1", model: null, computed_at: T1 };
export const taskAnalyticsRow = { task_type: "excavation" as const, condition: "hot" as const, n: 42, mean_actual_min: 58.1,
  mean_organiser_estimate_min: 50, mean_model_p50_min: 56.4, mae_organiser_min: 9.3, mae_model_min: 5.1,
  bias_organiser_min: -8.1, bias_model_min: -1.7 };
export const phrase = { id: "alert.seatbelt_off_moving.warning", group: "alert" as const,
  text: { en: "Seatbelt off. Stop and fasten it.", hi: "सीटबेल्ट खुली है। रुकें और लगाएँ।" } };
export const audioManifestEntry = { phrase_id: "alert.seatbelt_off_moving.warning", lang: "hi" as const,
  path: "/audio/hi/alert.seatbelt_off_moving.warning.mp3", bytes: 18234, duration_ms: 2100,
  provider: "sarvam" as const, model: "bulbul:v3", text_sha256: HASH1, status: "ok" as const };

/**
 * schema ↔ fixture pairs, used by the contract tests and by Track F's fixture loader. `broken` is a
 * dotted path to a nested field the test overwrites with an invalid value (a real bound, not the first key).
 */
export type Fixture = { name: string; schema: z.ZodType; value: unknown; broken: string };
const eventFixtures: Fixture[] = EVENT_TYPES.map((type: EventType) => ({
  name: `event.${type}`, schema: eventSchema(type), broken: "payload",
  value: { ...seatbeltBreachEvent, type, payload: EVENT_PAYLOADS[type] },
}));
export const FIXTURES: Fixture[] = [
  ...eventFixtures,
  { name: "my_snapshot", schema: MySnapshotOut, value: mySnapshot, broken: "tasks.0.task_type" },
  { name: "rpc.pair_machine.in", schema: PairMachineIn, value: rpc.pairMachineIn, broken: "p_request_id" },
  { name: "rpc.pair_machine.out", schema: PairMachineOut, value: rpc.pairMachineOut, broken: "paired_at" },
  { name: "rpc.task_start.in", schema: TaskStartIn, value: rpc.taskStartIn, broken: "p_eta_factors.0.multiplier" },
  { name: "rpc.task_start.out.started", schema: TaskStartOut, value: rpc.taskStartOutStarted, broken: "started_at" },
  { name: "rpc.task_start.out.blocked", schema: TaskStartOut, value: rpc.taskStartOutBlocked, broken: "missing.0" },
  { name: "rpc.task_pause.in", schema: TaskPauseIn, value: rpc.taskPauseIn, broken: "p_task_id" },
  { name: "rpc.task_complete.in", schema: TaskCompleteIn, value: rpc.taskCompleteIn, broken: "p_task_id" },
  { name: "rpc.sos_raise.in", schema: SosRaiseIn, value: rpc.sosRaiseIn, broken: "p_note" },
  { name: "rpc.sos_raise.out", schema: SosRaiseOut, value: rpc.sosRaiseOut, broken: "location_source" },
  { name: "rpc.sos_cancel.in", schema: SosCancelIn, value: rpc.sosCancelIn, broken: "p_alert_id" },
  { name: "rpc.incident_log.in", schema: IncidentLogIn, value: rpc.incidentLogIn, broken: "p_severity" },
  { name: "rpc.incident_log.out", schema: IncidentLogOut, value: rpc.incidentLogOut, broken: "event_id" },
  { name: "rpc.alert_ack.in", schema: AlertAckIn, value: rpc.alertAckIn, broken: "p_alert_id" },
  { name: "rpc.alert_ack.out", schema: AlertAckOut, value: rpc.alertAckOut, broken: "status" },
  { name: "rpc.ppe_override.in", schema: PpeOverrideIn, value: rpc.ppeOverrideIn, broken: "p_reason" },
  { name: "rpc.ppe_override.out", schema: PpeOverrideOut, value: rpc.ppeOverrideOut, broken: "valid_until" },
  { name: "rpc.ledger_verify.in", schema: LedgerVerifyIn, value: rpc.ledgerVerifyIn, broken: "p_from" },
  { name: "rpc.ledger_verify.out", schema: LedgerVerifyOut, value: rpc.ledgerVerifyOut, broken: "head_hash" },
  { name: "rpc.ledger_export.in", schema: LedgerExportIn, value: rpc.ledgerExportIn, broken: "p_last_seq" },
  { name: "rpc.ledger_export.row", schema: LedgerExportRow, value: rpc.ledgerExportRow, broken: "entry_hash" },
  { name: "rpc.ledger_recompute.out", schema: LedgerRecomputeOut, value: rpc.ledgerRecomputeOut, broken: "root_hex" },
  { name: "rpc.near_miss_list.out", schema: NearMissListOut, value: rpc.nearMissListOut, broken: "0.severity" },
  { name: "rpc.lesson_complete.in", schema: LessonCompleteIn, value: rpc.lessonCompleteIn, broken: "p_quiz_score" },
  { name: "rpc.replay_get.in", schema: ReplayGetIn, value: rpc.replayGetIn, broken: "p_replay_id" },
  { name: "rpc.replay_submit.in", schema: ReplaySubmitIn, value: rpc.replaySubmitIn, broken: "p_choices.0.ms" },
  { name: "rpc.lesson_assign.in", schema: LessonAssignIn, value: rpc.lessonAssignIn, broken: "p_operator_id" },
  { name: "rpc.consent_set.in", schema: ConsentSetIn, value: rpc.consentSetIn, broken: "p_granted" },
  { name: "protocol_card", schema: ProtocolCard, value: protocolCard, broken: "steps.0.en" },
  ...Object.entries(evidenceCards).map(([k, v]) => ({ name: `evidence_card.${k}`, schema: EvidenceCard as z.ZodType, value: v, broken: "title.en" })),
  { name: "replay_scenario", schema: ReplayScenario, value: replayScenario, broken: "decide.steps.0.kind" },
  { name: "replay_debrief", schema: ReplayDebriefResult, value: replayDebrief, broken: "scores.safety" },
  { name: "lesson_content", schema: LessonContent, value: lessonContent, broken: "quiz.0.correct_id" },
  { name: "ask_request", schema: AskRequest, value: askRequest, broken: "photo_path" },
  { name: "ask_response", schema: AskResponse, value: askResponse, broken: "citations.0.kind" },
  { name: "director_request", schema: DirectorRequest, value: directorRequest, broken: "command.speed" },
  { name: "director_response", schema: DirectorResponse, value: directorResponse, broken: "run_id" },
  { name: "demo_login_request", schema: DemoLoginRequest, value: demoLoginRequest, broken: "persona" },
  { name: "demo_login_response", schema: DemoLoginResponse, value: demoLoginResponse, broken: "type" },
  { name: "dispatch_request", schema: DispatchRequest, value: dispatchRequest, broken: "dispatch_id" },
  { name: "clock_tick", schema: ClockTick, value: clockTick, broken: "speed" },
  { name: "machine_delta", schema: MachineDelta, value: machineDelta, broken: "machines.0.health" },
  { name: "eta_estimate", schema: EtaEstimate, value: etaEstimate, broken: "factors.0.multiplier" },
  { name: "evidence_metric", schema: EvidenceMetric, value: evidenceMetric, broken: "metric_key" },
  { name: "task_analytics_row", schema: TaskAnalyticsRow, value: taskAnalyticsRow, broken: "condition" },
  { name: "phrase", schema: Phrase, value: phrase, broken: "text.hi" },
  { name: "audio_manifest_entry", schema: AudioManifestEntry, value: audioManifestEntry, broken: "text_sha256" },
];
