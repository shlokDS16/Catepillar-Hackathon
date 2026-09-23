import { EVENT_TYPES, type AnomalyDetected, type AnyEvent, type EVENT_REGISTRY, type EventType, type GuardianHazard } from "@cat/shared";
import type { z } from "zod";
import type { AlertRecord, AppEvent, Assignment, ClockTick, Machine, OperatorState, Snapshot, Task } from "@/data/types";

/**
 * The client state, reduced from `my_snapshot` plus the event stream (one `events` table is the
 * single source of truth, spec M0). Every module reads this one state; nothing in the UI is faked.
 */
export type Connectivity =
  | { kind: "fixture" }
  | { kind: "live" }
  | { kind: "reconnecting" }
  | { kind: "nosignal"; syncedAtMs: number };

export type AppState = {
  snapshot: Snapshot | null;
  tasks: Task[];
  alerts: AlertRecord[];
  machine: Machine | null;
  operator: OperatorState | null;
  assignments: Assignment[];
  /** Dispatch lines per alert id ("telegram sent", "twilio_voice answered"), newest last. */
  dispatch: Record<string, string[]>;
  /** Ledger sequence numbers per incident id, from `incident.logged`. */
  ledgerSeq: Record<string, number>;
  /** Vest and friends restored by sensor, or currently missing (from ppe.* events). */
  ppeMissing: string[];
  /** Guardian hazards keyed by anomaly id, so the map can draw them and the takeover can explain them. */
  guardian: Record<string, z.infer<typeof GuardianHazard>>;
  anomalies: Record<string, z.infer<typeof AnomalyDetected>>;
  clock: { sim_now: string; speed: number; status: string } | null;
  /** Wall-clock ms of the last frame (clock tick, event or snapshot); NO SIGNAL after 10 s. */
  lastFrameMs: number | null;
  connectivity: Connectivity;
  /** Sequence numbers already applied, so a Broadcast replay never double-applies. */
  seenSeq: number[];
};

export const initialState: AppState = {
  snapshot: null,
  tasks: [],
  alerts: [],
  machine: null,
  operator: null,
  assignments: [],
  dispatch: {},
  ledgerSeq: {},
  ppeMissing: [],
  guardian: {},
  anomalies: {},
  clock: null,
  lastFrameMs: null,
  connectivity: { kind: "fixture" },
  seenSeq: [],
};

export type Action =
  | { type: "snapshot"; snapshot: Snapshot; nowMs: number }
  | { type: "event"; event: AppEvent; nowMs: number }
  | { type: "clock"; tick: ClockTick; nowMs: number }
  | { type: "connectivity"; connectivity: Connectivity }
  | { type: "machine_moved"; machine: Partial<Pick<Machine, "location" | "moving" | "health" | "speed_kmh">>; nowMs: number };

function upsertAlert(alerts: AlertRecord[], next: AlertRecord): AlertRecord[] {
  const i = alerts.findIndex((a) => a.alert_id === next.alert_id);
  return i === -1 ? [...alerts, next] : alerts.map((a, j) => (j === i ? next : a));
}

function patchAlert(alerts: AlertRecord[], id: string, patch: Partial<AlertRecord>): AlertRecord[] {
  return alerts.map((a) => (a.alert_id === id ? { ...a, ...patch } : a));
}

const pick = (m: PayloadOf<"operator.motion_lock_changed">) => ({ motion_locked: m.motion_locked, call_allowed: m.call_allowed });
const nearestOf = (p: PayloadOf<"safety.proximity">) => ({ kind: p.other_kind, id: p.other_id, distance_m: p.distance_m, zone: p.zone });

function patchTask(tasks: Task[], id: string, patch: Partial<Task>): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "snapshot": {
      const s = action.snapshot;
      return {
        ...state,
        snapshot: s,
        tasks: s.tasks,
        alerts: s.active_alerts,
        machine: s.machine,
        operator: s.operator_state,
        assignments: s.assignments,
        clock: s.run ? { sim_now: s.run.sim_now, speed: s.run.speed, status: s.run.status } : state.clock,
        lastFrameMs: action.nowMs,
        seenSeq: s.recent_events.map((e) => e.seq),
      };
    }
    case "clock":
      return {
        ...state,
        clock: { sim_now: action.tick.sim_now, speed: action.tick.speed, status: action.tick.status },
        lastFrameMs: action.nowMs,
      };
    case "connectivity":
      return { ...state, connectivity: action.connectivity };
    case "machine_moved":
      return state.machine ? { ...state, machine: { ...state.machine, ...action.machine }, lastFrameMs: action.nowMs } : state;
    case "event":
      return applyEvent(state, action.event, action.nowMs);
  }
}

type PayloadOf<T extends EventType> = z.infer<(typeof EVENT_REGISTRY)[T]["payload"]>;
/** The registry knows the payload shape per type; the discriminated union does not narrow by itself. */
const payload = <T extends EventType>(e: AnyEvent, type: T): PayloadOf<T> => {
  void type;
  return e.payload as PayloadOf<T>;
};

/** Registered types narrow to their payload; anything else renders generically and only counts as a frame. */
function isKnown(e: AppEvent): e is AnyEvent {
  return (EVENT_TYPES as readonly string[]).includes(e.type);
}

function applyEvent(state: AppState, raw: AppEvent, nowMs: number): AppState {
  if (state.seenSeq.includes(raw.seq)) return state;
  const base: AppState = { ...state, lastFrameMs: nowMs, seenSeq: [...state.seenSeq.slice(-200), raw.seq] };
  if (!isKnown(raw)) return base;
  const e = raw;

  switch (e.type) {
    // ── Alerts ──
    case "alert.raised": {
      const raised = payload(e, "alert.raised");
      const existing = state.alerts.find((a) => a.alert_id === raised.alert_id);
      return {
        ...base,
        alerts: upsertAlert(state.alerts, {
          ...raised,
          status: "open",
          first_seen: existing?.first_seen ?? e.recorded_at,
        }),
      };
    }
    case "alert.acknowledged":
      return { ...base, alerts: patchAlert(state.alerts, payload(e, "alert.acknowledged").alert_id, { status: "acknowledged" }) };
    case "alert.escalated":
      return { ...base, alerts: patchAlert(state.alerts, payload(e, "alert.escalated").alert_id, { status: "escalated" }) };
    case "alert.resolved":
      return { ...base, alerts: patchAlert(state.alerts, payload(e, "alert.resolved").alert_id, { status: "resolved" }) };
    case "alert.suppressed":
      return { ...base, alerts: patchAlert(state.alerts, payload(e, "alert.suppressed").alert_id, { status: "suppressed" }) };
    case "sos.raised":
      return {
        ...base,
        alerts: upsertAlert(state.alerts, {
          alert_id: payload(e, "sos.raised").alert_id,
          kind: "sos",
          tier: "critical",
          needs_ack: false,
          escalate_at: null,
          occurrences: 1,
          protocol_card_id: null,
          upgraded_from: null,
          status: "open",
          first_seen: e.recorded_at,
        }),
      };
    case "sos.cancelled":
      return { ...base, alerts: patchAlert(state.alerts, payload(e, "sos.cancelled").alert_id, { status: "resolved" }) };

    // ── Dispatch lines belong to the alert the event carries ──
    case "dispatch.sent":
    case "dispatch.delivered":
    case "dispatch.answered":
    case "dispatch.failed":
    case "dispatch.suppressed": {
      const id = e.alert_id ?? "unknown";
      const d = payload(e, "dispatch.sent");
      const line = `${d.channel}:${d.status}`;
      return { ...base, dispatch: { ...state.dispatch, [id]: [...(state.dispatch[id] ?? []), line] } };
    }

    // ── Tasks ──
    case "task.started":
    case "task.paused":
    case "task.completed":
    case "task.progress": {
      const t = payload(e, "task.progress");
      return {
        ...base,
        tasks: patchTask(state.tasks, t.task_id, {
          status: t.status,
          progress_pct: t.progress_pct,
          eta_p50_min: t.eta_p50_min,
          eta_p90_min: t.eta_p90_min,
        }),
      };
    }
    case "task.start_blocked":
    case "ppe.missing": {
      const m = payload(e, "ppe.missing");
      const taskId = m.task_id;
      return {
        ...base,
        ppeMissing: m.missing,
        tasks: taskId ? patchTask(state.tasks, taskId, { status: "blocked_ppe" }) : state.tasks,
      };
    }
    case "ppe.restored": {
      const items = payload(e, "ppe.restored").items;
      const restored = new Set<string>(items);
      return {
        ...base,
        ppeMissing: state.ppeMissing.filter((i) => !restored.has(i)),
        operator: state.operator
          ? { ...state.operator, ppe: { ...state.operator.ppe, ...Object.fromEntries(items.map((i) => [i, true])) } }
          : state.operator,
      };
    }
    case "ppe.override_granted":
      return { ...base, ppeMissing: [] };

    // ── Machine and operator ──
    case "safety.seatbelt_breach":
      return state.machine ? { ...base, machine: { ...state.machine, seatbelt_fastened: false, speed_kmh: payload(e, "safety.seatbelt_breach").speed_kmh, moving: true } } : base;
    case "safety.seatbelt_resolved":
      return state.machine ? { ...base, machine: { ...state.machine, seatbelt_fastened: true } } : base;
    case "operator.motion_lock_changed":
      return state.operator
        ? { ...base, operator: { ...state.operator, ...pick(payload(e, "operator.motion_lock_changed")) } }
        : base;
    case "safety.proximity":
      return state.operator
        ? {
            ...base,
            operator: {
              ...state.operator,
              nearest: nearestOf(payload(e, "safety.proximity")),
            },
          }
        : base;

    // ── Guardian and anomalies ──
    case "guardian.hazard_near_operator":
      {
      const g = payload(e, "guardian.hazard_near_operator");
      return { ...base, guardian: { ...state.guardian, [g.anomaly_id]: g } };
    }
    case "guardian.hazard_cleared": {
      const { [payload(e, "guardian.hazard_cleared").anomaly_id]: _gone, ...rest } = state.guardian;
      void _gone;
      return { ...base, guardian: rest };
    }
    case "anomaly.detected":
      {
      const a = payload(e, "anomaly.detected");
      return { ...base, anomalies: { ...state.anomalies, [a.anomaly_id]: a } };
    }
    case "anomaly.cleared": {
      const { [payload(e, "anomaly.cleared").anomaly_id]: _gone, ...rest } = state.anomalies;
      void _gone;
      return { ...base, anomalies: rest };
    }

    // ── Ledger, training, scenario ──
    case "incident.logged":
      {
      const l = payload(e, "incident.logged");
      return { ...base, ledgerSeq: { ...state.ledgerSeq, [l.incident_id]: l.seq } };
    }
    case "training.replay_ready": {
      const r = payload(e, "training.replay_ready");
      return {
        ...base,
        assignments: state.assignments.map((a) => (a.because_event_id === r.source_event_id ? { ...a, replay_id: r.replay_id } : a)),
      };
    }
    case "training.lesson_assigned": {
      const la = payload(e, "training.lesson_assigned");
      return state.assignments.some((a) => a.id === la.assignment_id)
        ? base
        : {
            ...base,
            assignments: [...state.assignments, { id: la.assignment_id, lesson_code: la.lesson_code, because_event_id: la.because_event_id, replay_id: null }],
          };
    }
    case "scenario.started":
    case "scenario.paused":
    case "scenario.resumed":
    case "scenario.speed_changed":
    case "scenario.jumped":
    case "scenario.finished":
      {
      const sc = payload(e, "scenario.started");
      return { ...base, clock: { sim_now: sc.sim_now, speed: sc.speed, status: sc.status } };
    }
    default:
      // Informational types: the frame still counts as a heartbeat.
      return base;
  }
}
