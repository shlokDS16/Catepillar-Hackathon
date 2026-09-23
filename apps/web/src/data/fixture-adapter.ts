import { MySnapshotOut } from "@cat/shared";
import { EVENT_PAYLOADS, IDS, lessonContent, mySnapshot, protocolCard, replayDebrief, replayScenario, rpc, seatbeltBreachEvent } from "@cat/shared/fixtures";
import { RpcError, type DataPort, type PortMessage } from "@/data/port";
import type { AppEvent, Snapshot } from "@/data/types";

/**
 * The FixtureAdapter: every read answers from @cat/shared/fixtures, every RPC succeeds after a short
 * wait and emits the events the server would, and the five demo beats (spec §7) can be played from
 * the director. Nothing here reaches the network. The SupabaseAdapter (F13) has the same shape.
 */
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Listener = (m: PortMessage) => void;

export type Beat = 1 | 2 | 3 | 4 | 5;

export class FixtureAdapter implements DataPort {
  private listeners = new Set<Listener>();
  private seq = 1000;
  private simMs = Date.parse(mySnapshot.run.sim_now);
  private ticker: ReturnType<typeof setInterval> | null = null;
  private snapshotValue: Snapshot;
  /** The director tab and the operator tab are separate JS contexts; beats travel over this channel. */
  private channel: BroadcastChannel | null = null;

  constructor(private latencyMs = 250) {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("spotter-director");
      this.channel.onmessage = (m: MessageEvent<{ beat: Beat }>) => void this.playBeat(m.data.beat);
    }
    // Start the demo with no open alert and the machine parked, so the beats can build the story.
    const base = MySnapshotOut.parse(mySnapshot);
    this.snapshotValue = {
      ...base,
      active_alerts: [],
      machine: base.machine ? { ...base.machine, moving: false, speed_kmh: 0, seatbelt_fastened: true } : null,
      operator_state: base.operator_state ? { ...base.operator_state, motion_locked: false, call_allowed: true, ppe: { helmet: true, vest: false, boots: true, gloves: true } } : null,
      tasks: [
        { ...base.tasks[0], status: "planned", progress_pct: 0 },
        { ...base.tasks[0], id: IDS.zone, task_type: "trenching", status: "planned", planned_start: "2026-09-24T11:00:00.000+05:30", progress_pct: 0 },
      ],
      assignments: [],
      recent_events: [],
    };
  }

  async snapshot(): Promise<Snapshot> {
    await wait(this.latencyMs);
    return this.snapshotValue;
  }

  subscribe(onMessage: Listener): () => void {
    this.listeners.add(onMessage);
    if (!this.ticker) {
      // A 1 Hz clock at 10× sim speed, like the server's ClockTick.
      this.ticker = setInterval(() => {
        this.simMs += 10_000;
        this.emit({
          kind: "clock",
          tick: { run_id: IDS.run, status: "playing", speed: 10, sim_now: new Date(this.simMs).toISOString(), server_now: new Date().toISOString() },
        });
      }, 1000);
    }
    return () => {
      this.listeners.delete(onMessage);
      if (this.listeners.size === 0 && this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    };
  }

  private emit(m: PortMessage) {
    this.listeners.forEach((l) => l(m));
  }

  /** Builds an event row like the server's, with a fresh seq and the current sim time. */
  private event<T extends keyof typeof EVENT_PAYLOADS>(type: T, payload: (typeof EVENT_PAYLOADS)[T] | Record<string, unknown>, extra: Partial<AppEvent> = {}): AppEvent {
    this.seq += 1;
    return {
      ...seatbeltBreachEvent,
      seq: this.seq,
      type,
      tier: null,
      sim_ts: new Date(this.simMs).toISOString(),
      recorded_at: new Date().toISOString(),
      payload,
      ...extra,
    } as unknown as AppEvent;
  }

  private push(...events: AppEvent[]) {
    for (const e of events) this.emit({ kind: "event", event: e });
  }

  /** From the director tab: play here and in every other open tab. */
  broadcastBeat(beat: Beat) {
    this.channel?.postMessage({ beat });
    void this.playBeat(beat);
  }

  /** The five demo beats (spec §7). Each emits exactly what the pipeline would. */
  async playBeat(beat: Beat): Promise<void> {
    switch (beat) {
      case 1: // PPE: vest detected, so the blocked Start can go ahead.
        this.push(this.event("ppe.restored", { items: ["vest"] }));
        return;
      case 2: {
        // Seatbelt off on a slope while moving: breach, warning, motion lock.
        this.push(
          this.event("operator.motion_lock_changed", { motion_locked: true, call_allowed: false, reason: "moving" }),
          this.event("safety.seatbelt_breach", EVENT_PAYLOADS["safety.seatbelt_breach"], { tier: "warning" }),
          this.event("alert.raised", {
            ...EVENT_PAYLOADS["alert.raised"],
            escalate_at: new Date(Date.now() + 20_000).toISOString(),
          }),
        );
        return;
      }
      case 3: {
        // Guardian: EXC-014's hydraulic drift, the operator on foot 38 m away.
        const anomaly = { ...EVENT_PAYLOADS["anomaly.detected"], anomaly_type: "hydraulic_temp_drift" as const, method: "ewma" as const, severity_score: 62, severity_tier: "warning" as const,
          explanation: { en: "EXC-014 hydraulic oil is at 86 °C, rising above its normal 71 °C.", hi: "EXC-014 का हाइड्रोलिक तेल 86 °C है, सामान्य 71 °C से ऊपर।" },
          fuel_l: null, cost_inr: null, features: { value: 86, mean: 71 }, lat: 21.1468, lon: 79.0879 };
        this.push(
          this.event("operator.motion_lock_changed", { motion_locked: false, call_allowed: true, reason: "on_foot" }),
          this.event("anomaly.detected", anomaly, { tier: "caution" }),
          this.event("guardian.hazard_near_operator", EVENT_PAYLOADS["guardian.hazard_near_operator"], { tier: "warning" }),
          this.event("alert.raised", {
            ...EVENT_PAYLOADS["alert.raised"],
            alert_id: IDS.dispatch,
            kind: "guardian_hazard",
            protocol_card_id: "hydraulic_fault",
            escalate_at: new Date(Date.now() + 15_000).toISOString(),
          }),
        );
        return;
      }
      case 4: // The Loop: replay ready from the seatbelt event, lesson assigned.
        this.push(
          this.event("training.lesson_assigned", EVENT_PAYLOADS["training.lesson_assigned"]),
          this.event("training.replay_ready", EVENT_PAYLOADS["training.replay_ready"]),
        );
        return;
      case 5: // Ledger: the checkpoint is published, then a tamper is detected.
        this.push(this.event("ledger.checkpoint_published", EVENT_PAYLOADS["ledger.checkpoint_published"]), this.event("ledger.tamper_detected", EVENT_PAYLOADS["ledger.tamper_detected"], { tier: "critical" }));
        return;
    }
  }

  async protocolCard(id: string) {
    await wait(this.latencyMs);
    return id === protocolCard.id ? protocolCard : { ...protocolCard, id };
  }

  async pairMachine(input: { p_machine_code: string; p_request_id: string }) {
    await wait(this.latencyMs);
    if (input.p_machine_code.toUpperCase() !== "EXC-007") throw new RpcError("not_found");
    return rpc.pairMachineOut;
  }
  async consentSet() {
    await wait(this.latencyMs);
  }

  async taskStart(input: { p_task_id: string; p_request_id: string }) {
    await wait(this.latencyMs);
    const missing = this.snapshotValue.operator_state?.ppe.vest === false;
    if (missing && !this.vestRestored) {
      this.push(this.event("task.start_blocked", { task_id: input.p_task_id, missing: ["vest"] }), this.event("ppe.missing", { task_id: input.p_task_id, missing: ["vest"] }, { tier: "caution" }));
      return { status: "blocked" as const, task_id: input.p_task_id, missing: ["vest" as const] };
    }
    this.push(this.event("task.started", { ...EVENT_PAYLOADS["task.started"], task_id: input.p_task_id, status: "in_progress", progress_pct: 0 }));
    this.startProgress(input.p_task_id);
    return { status: "started" as const, task_id: input.p_task_id, started_at: new Date().toISOString() };
  }
  private vestRestored = false;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private progress = 0;
  private startProgress(taskId: string) {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => {
      this.progress = Math.min(100, this.progress + 10);
      this.push(this.event("task.progress", { ...EVENT_PAYLOADS["task.progress"], task_id: taskId, progress_pct: this.progress, eta_p50_min: Math.max(0, 52 - this.progress / 2), eta_p90_min: Math.max(0, 61 - this.progress / 2) }));
      if (this.progress >= 100 && this.progressTimer) clearInterval(this.progressTimer);
    }, 6000);
  }
  async taskPause(input: { p_task_id: string }) {
    await wait(this.latencyMs);
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.push(this.event("task.paused", { ...EVENT_PAYLOADS["task.paused"], task_id: input.p_task_id, progress_pct: this.progress }));
  }
  async taskComplete(input: { p_task_id: string }) {
    await wait(this.latencyMs);
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.push(this.event("task.completed", { ...EVENT_PAYLOADS["task.completed"], task_id: input.p_task_id }));
  }

  async alertAck(input: { p_alert_id: string }) {
    await wait(this.latencyMs);
    this.push(this.event("alert.acknowledged", { alert_id: input.p_alert_id, via: "app", by_role: "operator" }));
    // The demo's seatbelt alert resolves by sensor a moment later.
    setTimeout(() => this.push(this.event("safety.seatbelt_resolved", { frame_seq: 2460 }), this.event("alert.resolved", { alert_id: input.p_alert_id, via: "sensor" }), this.event("operator.motion_lock_changed", { motion_locked: false, call_allowed: true, reason: "parked" })), 4000);
    return { alert_id: input.p_alert_id, status: "acknowledged" as const };
  }

  async sosRaise() {
    await wait(this.latencyMs);
    return { ...rpc.sosRaiseOut, escalate_at: new Date(Date.now() + 60_000).toISOString(), server_now: new Date().toISOString() };
  }
  async sosCancel() {
    await wait(this.latencyMs);
  }
  async incidentLog() {
    await wait(this.latencyMs);
    setTimeout(() => this.push(this.event("incident.logged", { ...EVENT_PAYLOADS["incident.logged"], seq: 216 })), 1500);
    return rpc.incidentLogOut;
  }
  async ppeOverride() {
    await wait(this.latencyMs);
    this.vestRestored = true;
    this.push(this.event("ppe.override_granted", EVENT_PAYLOADS["ppe.override_granted"]));
    return rpc.ppeOverrideOut;
  }
  async ledgerVerify() {
    await wait(this.latencyMs);
    return { ...rpc.ledgerVerifyOut, ok: true, first_bad_seq: null, reason: null };
  }
  async ledgerExport() {
    await wait(this.latencyMs);
    return [rpc.ledgerExportRow];
  }
  async ledgerRecompute() {
    await wait(this.latencyMs);
    return rpc.ledgerRecomputeOut;
  }
  async replayGet() {
    await wait(this.latencyMs);
    return replayScenario;
  }
  async replaySubmit() {
    await wait(this.latencyMs * 3);
    return replayDebrief;
  }
  async lessonGet() {
    await wait(this.latencyMs);
    return lessonContent;
  }
  async lessonComplete() {
    await wait(this.latencyMs);
  }

  /** Beat 1's "vest on" also unblocks Start for the fixture's PPE check. */
  markVestRestored() {
    this.vestRestored = true;
  }
}
