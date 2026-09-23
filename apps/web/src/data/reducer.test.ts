import { describe, expect, it } from "vitest";
import { EVENT_PAYLOADS, IDS, mySnapshot, seatbeltBreachEvent } from "@cat/shared/fixtures";
import { MySnapshotOut } from "@cat/shared";
import type { AppEvent } from "@/data/types";
import { initialState, reduce, type AppState } from "./reducer";

const NOW = 1_000_000;
const snapshot = MySnapshotOut.parse(mySnapshot);

function ev<T extends keyof typeof EVENT_PAYLOADS>(type: T, seq: number, over: Partial<AppEvent> = {}): AppEvent {
  return { ...seatbeltBreachEvent, seq, type, payload: EVENT_PAYLOADS[type], ...over } as unknown as AppEvent;
}

function boot(): AppState {
  return reduce(initialState, { type: "snapshot", snapshot, nowMs: NOW });
}

describe("snapshot", () => {
  it("seeds tasks, alerts, machine, operator, assignments and the clock", () => {
    const s = boot();
    expect(s.tasks).toHaveLength(1);
    expect(s.alerts[0]?.alert_id).toBe(IDS.alert);
    expect(s.machine?.code).toBe("EXC-007");
    expect(s.operator?.motion_locked).toBe(true);
    expect(s.assignments[0]?.replay_id).toBe(IDS.replay);
    expect(s.clock?.speed).toBe(10);
    expect(s.lastFrameMs).toBe(NOW);
  });
  it("remembers recent_events seqs so a replayed broadcast is not applied twice", () => {
    const s = boot();
    const again = reduce(s, { type: "event", event: seatbeltBreachEvent as unknown as AppEvent, nowMs: NOW + 1 });
    expect(again).toBe(s);
  });
});

describe("alert family", () => {
  it("raised → acknowledged → resolved, keeping first_seen", () => {
    let s = boot();
    const raised = ev("alert.raised", 300, { recorded_at: "2026-09-24T09:50:00.000+05:30" });
    s = reduce(s, { type: "event", event: raised, nowMs: NOW });
    expect(s.alerts.find((a) => a.alert_id === IDS.alert)?.first_seen).toBe(snapshot.active_alerts[0].first_seen);
    s = reduce(s, { type: "event", event: ev("alert.acknowledged", 301), nowMs: NOW });
    expect(s.alerts[0]?.status).toBe("acknowledged");
    s = reduce(s, { type: "event", event: ev("alert.resolved", 302), nowMs: NOW });
    expect(s.alerts[0]?.status).toBe("resolved");
  });
  it("an upgrade keeps one alert and carries upgraded_from", () => {
    const s = boot();
    const up = ev("alert.raised", 310);
    (up.payload as { tier: string; upgraded_from: string }).tier = "critical";
    (up.payload as { tier: string; upgraded_from: string }).upgraded_from = "warning";
    const next = reduce(s, { type: "event", event: up, nowMs: NOW });
    expect(next.alerts).toHaveLength(1);
    expect(next.alerts[0]).toMatchObject({ tier: "critical", upgraded_from: "warning", status: "open" });
  });
  it("sos.raised adds a critical SOS alert and sos.cancelled resolves it", () => {
    let s = reduce(boot(), { type: "event", event: ev("sos.raised", 320), nowMs: NOW });
    expect(s.alerts.find((a) => a.kind === "sos")?.tier).toBe("critical");
    s = reduce(s, { type: "event", event: ev("sos.cancelled", 321), nowMs: NOW });
    expect(s.alerts.find((a) => a.kind === "sos")?.status).toBe("resolved");
  });
});

describe("dispatch family", () => {
  it("appends a channel:status line under the event's alert id", () => {
    let s = boot();
    s = reduce(s, { type: "event", event: ev("dispatch.sent", 330), nowMs: NOW });
    s = reduce(s, { type: "event", event: ev("dispatch.answered", 331), nowMs: NOW });
    expect(s.dispatch[IDS.alert]).toEqual(["telegram:sent", "twilio_voice:answered"]);
  });
});

describe("task and PPE family", () => {
  it("progress and status follow task.* events", () => {
    let s = reduce(boot(), { type: "event", event: ev("task.progress", 340), nowMs: NOW });
    expect(s.tasks[0]?.progress_pct).toBe(40);
    s = reduce(s, { type: "event", event: ev("task.paused", 341), nowMs: NOW });
    expect(s.tasks[0]?.status).toBe("paused");
    s = reduce(s, { type: "event", event: ev("task.completed", 342), nowMs: NOW });
    expect(s.tasks[0]).toMatchObject({ status: "completed", progress_pct: 100 });
  });
  it("ppe.missing blocks the task; ppe.restored clears the item and marks it worn", () => {
    let s = reduce(boot(), { type: "event", event: ev("ppe.missing", 350), nowMs: NOW });
    expect(s.ppeMissing).toEqual(["vest"]);
    expect(s.tasks[0]?.status).toBe("blocked_ppe");
    s = reduce(s, { type: "event", event: ev("ppe.restored", 351), nowMs: NOW });
    expect(s.ppeMissing).toEqual([]);
    expect(s.operator?.ppe.vest).toBe(true);
  });
});

describe("machine, operator, guardian, anomaly", () => {
  it("seatbelt breach and resolve flip seatbelt_fastened", () => {
    let s = reduce(boot(), { type: "event", event: ev("safety.seatbelt_breach", 360), nowMs: NOW });
    expect(s.machine?.seatbelt_fastened).toBe(false);
    s = reduce(s, { type: "event", event: ev("safety.seatbelt_resolved", 361), nowMs: NOW });
    expect(s.machine?.seatbelt_fastened).toBe(true);
  });
  it("motion lock follows the server event", () => {
    const e = ev("operator.motion_lock_changed", 370);
    (e.payload as { motion_locked: boolean; call_allowed: boolean }).motion_locked = false;
    (e.payload as { motion_locked: boolean; call_allowed: boolean }).call_allowed = true;
    const s = reduce(boot(), { type: "event", event: e, nowMs: NOW });
    expect(s.operator).toMatchObject({ motion_locked: false, call_allowed: true });
  });
  it("guardian hazards and anomalies are keyed by anomaly id and cleared", () => {
    let s = reduce(boot(), { type: "event", event: ev("guardian.hazard_near_operator", 380), nowMs: NOW });
    s = reduce(s, { type: "event", event: ev("anomaly.detected", 381), nowMs: NOW });
    expect(s.guardian[IDS.anomaly]?.machine_code).toBe("EXC-014");
    expect(s.anomalies[IDS.anomaly]?.cost_inr).toBe(1290);
    s = reduce(s, { type: "event", event: ev("guardian.hazard_cleared", 382), nowMs: NOW });
    s = reduce(s, { type: "event", event: ev("anomaly.cleared", 383), nowMs: NOW });
    expect(s.guardian).toEqual({});
    expect(s.anomalies).toEqual({});
  });
});

describe("ledger, training, scenario, heartbeat", () => {
  it("incident.logged records the ledger seq; replay_ready fills the assignment", () => {
    let s = boot();
    s = reduce(s, { ...{ type: "event" as const }, event: ev("incident.logged", 390), nowMs: NOW });
    expect(s.ledgerSeq[IDS.incident]).toBe(214);
    s = reduce(s, { type: "event", event: ev("training.replay_ready", 391), nowMs: NOW });
    expect(s.assignments[0]?.replay_id).toBe(IDS.replay);
  });
  it("scenario events and clock ticks move the clock and the heartbeat", () => {
    let s = reduce(boot(), { type: "event", event: ev("scenario.speed_changed", 400), nowMs: NOW + 5 });
    expect(s.clock?.speed).toBe(60);
    s = reduce(s, { type: "clock", tick: { run_id: IDS.run, status: "playing", speed: 10, sim_now: "2026-09-24T09:41:00.000+05:30", server_now: "2026-09-24T09:41:01.000+05:30" }, nowMs: NOW + 9 });
    expect(s.clock?.speed).toBe(10);
    expect(s.lastFrameMs).toBe(NOW + 9);
  });
  it("an unknown event type still counts as a frame", () => {
    const s = reduce(boot(), { type: "event", event: { ...seatbeltBreachEvent, seq: 999, type: "future.thing", payload: {} } as unknown as AppEvent, nowMs: NOW + 3 });
    expect(s.lastFrameMs).toBe(NOW + 3);
  });
});
