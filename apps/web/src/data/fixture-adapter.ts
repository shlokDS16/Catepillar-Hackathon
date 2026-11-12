import { AnomalyDetected, MySnapshotOut } from "@cat/shared";
import { EVENT_PAYLOADS, IDS, evidenceCards, lessonContent, mySnapshot, protocolCard, replayScenario, rpc, seatbeltBreachEvent } from "@cat/shared/fixtures";
import type { ReplayScenario } from "@cat/shared";
import { RpcError, type DataPort, type PortMessage } from "@/data/port";
import type { AppEvent, Snapshot } from "@/data/types";
import type { SiteMapData } from "@/map/site-map";
import type { LedgerScenario } from "@/ledger/fixtures";
import type { InboxItem } from "@/inbox/inbox";

/**
 * The FixtureAdapter: every read answers from @cat/shared/fixtures, every RPC succeeds after a short
 * wait and emits the events the server would, and the five demo beats (spec §7) can be played from
 * the director. Nothing here reaches the network. The SupabaseAdapter (F13) has the same shape.
 */
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Listener = (m: PortMessage) => void;

/** 6 and 7 are Ledger-only helpers: 6 = tamper with a re-hash (rewrite), 7 = reset the ledger to intact. */
export type Beat = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export class FixtureAdapter implements DataPort {
  private listeners = new Set<Listener>();
  private seq = 1000;
  private simMs = Date.parse(mySnapshot.run.sim_now);
  private ticker: ReturnType<typeof setInterval> | null = null;
  private snapshotValue: Snapshot;
  /** Which ledger the Ledger screen sees; the director's tamper beat flips it to a broken chain. */
  ledgerScenario: LedgerScenario = "intact";
  /** The director tab and the operator tab are separate JS contexts; beats travel over this channel. */
  private channel: BroadcastChannel | null = null;

  constructor(private latencyMs = 250) {
    // Browser only: the server render has no business listening for director beats (F06-F08 review).
    if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
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
      case 1: {
        // PPE: vest detected, so the blocked Start can go ahead (F06-F08 review: the flag must be
        // set here, or Start stays blocked after "vest on").
        this.markVestRestored();
        this.push(this.event("ppe.restored", { items: ["vest"] }));
        return;
      }
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
          // The anomaly also raises its own caution alert, so the Caution banner has a demo path:
          // the store builds alerts from alert.raised only, and without this the tier is unreachable.
          this.event("alert.raised", {
            ...EVENT_PAYLOADS["alert.raised"],
            alert_id: IDS.anomaly,
            kind: "anomaly_machine",
            tier: "caution",
            needs_ack: false,
            protocol_card_id: null,
            escalate_at: null,
          }),
          // The hazard carries the guardian alert's id in the envelope, so the takeover can pick it by alert id.
          this.event("guardian.hazard_near_operator", EVENT_PAYLOADS["guardian.hazard_near_operator"], { tier: "warning", alert_id: IDS.dispatch }),
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
      case 6:
        this.ledgerScenario = "rewrite";
        return;
      case 7:
        this.ledgerScenario = "intact";
        return;
      case 5: // Ledger: the checkpoint is published, then a tamper is detected.
        this.ledgerScenario = "chain_break";
        this.push(
          this.event("ledger.checkpoint_published", EVENT_PAYLOADS["ledger.checkpoint_published"]),
          this.event("ledger.tamper_detected", EVENT_PAYLOADS["ledger.tamper_detected"], { tier: "critical" }),
          // Tamper raises a critical alert: without it the critical takeover has no demo path and
          // beat 5 silently left the previous warning on screen.
          this.event("alert.raised", {
            ...EVENT_PAYLOADS["alert.raised"],
            alert_id: IDS.root,
            kind: "ledger_tamper",
            tier: "critical",
            needs_ack: true,
            protocol_card_id: null,
            escalate_at: null,
          }),
        );
        return;
    }
  }

  async protocolCard(id: string) {
    await wait(this.latencyMs);
    return id === protocolCard.id ? protocolCard : { ...protocolCard, id };
  }

  /**
   * S4 map data. The site centre, zone and trail come from the Replay map-snapshot fixture (the one
   * place the fixtures carry site geometry); EXC-014 is the Guardian beat's machine, placed where
   * Beat 3's anomaly reports it so the rings and the card agree.
   */
  async siteMap(): Promise<SiteMapData> {
    await wait(this.latencyMs);
    const plan = evidenceCards.map_snapshot;
    const me = this.snapshotValue.machine?.location ?? plan.center;
    // The fixtures carry one trail point; the demo walks the operator's machine up the bench so the
    // trail, heading and time cursor have something to show. Positions are assumed-sensor data.
    const approach = [
      { lat: 21.1452, lon: 79.0873 },
      { lat: 21.1455, lon: 79.0876 },
      { lat: 21.1458, lon: 79.0879 },
      { lat: 21.1461, lon: 79.0881 },
    ];
    /** Fixes spread evenly over `spanMs`, the last one `lastAgoMs` before the newest data. */
    const track = (pts: Array<{ lat: number; lon: number }>, spanMs: number, lastAgoMs: number) =>
      pts.map((p, i) => ({ ago_ms: lastAgoMs + (pts.length === 1 ? 0 : spanMs - (spanMs * i) / (pts.length - 1)), lat: p.lat, lon: p.lon }));
    return {
      center: plan.center,
      zones: plan.zones.map((z) => ({ id: z.id, name: z.name, zone_type: z.zone_type, polygon: z.polygon })),
      trail: [...approach, ...plan.trail.map((p) => ({ lat: p.lat, lon: p.lon })), me],
      machines: [
        // The Guardian beat's machine: parked, faulty, reporting.
        { id: IDS.anomaly, code: "EXC-014", lat: 21.1468, lon: 79.0879, moving: false, health: "fault", track: track([{ lat: 21.1468, lon: 79.0879 }, { lat: 21.1468, lon: 79.0879 }], 540_000, 8_000) },
        // A dumper on its haul loop: moving, healthy, close enough to see the heading arrow.
        {
          id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", code: "DMP-003", lat: 21.1473, lon: 79.0893, moving: true, health: "ok",
          track: track([{ lat: 21.1480, lon: 79.0908 }, { lat: 21.1478, lon: 79.0902 }, { lat: 21.1476, lon: 79.0897 }, { lat: 21.1473, lon: 79.0893 }], 540_000, 4_000),
        },
        // Last heard 95 s ago: drawn stale, not as a live position.
        { id: "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2", code: "EXC-011", lat: 21.1455, lon: 79.0894, moving: false, health: "ok", track: track([{ lat: 21.1455, lon: 79.0894 }, { lat: 21.1455, lon: 79.0894 }], 495_000, 95_000) },
      ],
    };
  }

  /**
   * S7 rows. One per kind the Inbox has to show: a tamper (Critical), a blocked PPE start, a
   * Guardian hazard and an idling anomaly (both with their sentence), a flood, a non-punitive
   * near-miss (no operator), plus one handled, one resolved and one suppressed.
   */
  async inbox(): Promise<InboxItem[]> {
    await wait(this.latencyMs);
    const at = (hhmm: string) => `2026-09-24T${hhmm}:00.000+05:30`;
    const row = (over: Partial<InboxItem> & Pick<InboxItem, "id" | "kind" | "tier" | "firstSeen">): InboxItem => ({
      status: "open", needsAck: false, occurrences: 1, operatorName: null, machineCode: null, taskId: null,
      taskBlocked: false, missing: [], dispatch: null, anomaly: null, nonPunitive: false, ...over,
    });
    const idle = AnomalyDetected.parse(EVENT_PAYLOADS["anomaly.detected"]);
    const hydraulic = AnomalyDetected.parse({
      ...EVENT_PAYLOADS["anomaly.detected"], anomaly_id: "f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5", anomaly_type: "hydraulic_temp_drift", method: "ewma",
      severity_score: 62, severity_tier: "warning", fuel_l: null, cost_inr: null, features: { value: 86, mean: 71 }, lat: 21.1468, lon: 79.0879,
      explanation: { en: "EXC-014 hydraulic oil is at 86 °C, rising above its normal 71 °C.", hi: "EXC-014 का हाइड्रोलिक तेल 86 °C है, सामान्य 71 °C से ऊपर।" },
    });
    return [
      row({ id: IDS.root, kind: "ledger_tamper", tier: "critical", firstSeen: at("09:41"), needsAck: true, dispatch: "telegram:sent" }),
      row({ id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1", kind: "ppe_missing", tier: "caution", firstSeen: at("09:43"), needsAck: true, operatorName: "Ravi", machineCode: "EXC-007", taskId: IDS.task, taskBlocked: true, missing: ["vest"], dispatch: "telegram:delivered" }),
      row({ id: IDS.dispatch, kind: "guardian_hazard", tier: "warning", firstSeen: at("09:47"), needsAck: true, operatorName: "Ravi", machineCode: "EXC-014", anomaly: hydraulic, dispatch: "telegram:sent" }),
      row({ id: IDS.anomaly, kind: "idle_excess", tier: "caution", firstSeen: at("09:20"), occurrences: 3, machineCode: "EXC-007", anomaly: idle }),
      row({ id: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2", kind: "alert_flood", tier: "caution", firstSeen: at("09:30"), needsAck: true, occurrences: 12 }),
      row({ id: "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3", kind: "near_miss", tier: "caution", firstSeen: at("09:10"), nonPunitive: true }),
      row({ id: IDS.alert, kind: "seatbelt_off_moving", tier: "warning", firstSeen: at("09:40"), status: "acknowledged", needsAck: true, operatorName: "Ravi", machineCode: "EXC-007", dispatch: "telegram:answered" }),
      row({ id: "a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4", kind: "proximity_zone", tier: "warning", firstSeen: at("08:55"), status: "resolved", needsAck: true, operatorName: "Meena", machineCode: "DMP-003" }),
      row({ id: "a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5", kind: "idle_excess", tier: "caution", firstSeen: at("08:30"), status: "suppressed", machineCode: "EXC-011" }),
    ];
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
    const overrideLive = this.overrideUntilMs !== null && this.simMs <= this.overrideUntilMs;
    if (missing && !this.vestRestored && !overrideLive) {
      this.push(this.event("task.start_blocked", { task_id: input.p_task_id, missing: ["vest"] }), this.event("ppe.missing", { task_id: input.p_task_id, missing: ["vest"] }, { tier: "caution" }));
      // An override that has run out blocks again with the contract's `override_expired` (interaction-map §7).
      if (this.overrideUntilMs !== null) throw new RpcError("override_expired");
      return { status: "blocked" as const, task_id: input.p_task_id, missing: ["vest" as const] };
    }
    this.push(this.event("task.started", { ...EVENT_PAYLOADS["task.started"], task_id: input.p_task_id, status: "in_progress", progress_pct: 0 }));
    this.progress = 0; // each task starts from zero (F06-F08 review: progress leaked across tasks)
    this.startProgress(input.p_task_id);
    return { status: "started" as const, task_id: input.p_task_id, started_at: new Date().toISOString() };
  }
  private vestRestored = false;
  /** Sim-time ms until which a supervisor override lets Start through. */
  private overrideUntilMs: number | null = null;
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
    // Only the seatbelt alert resolves by sensor a moment later; any other ack stays an ack.
    if (input.p_alert_id === IDS.alert) {
      setTimeout(
        () =>
          this.push(
            this.event("safety.seatbelt_resolved", { frame_seq: 2460 }),
            this.event("alert.resolved", { alert_id: input.p_alert_id, via: "sensor" }),
            this.event("operator.motion_lock_changed", { motion_locked: false, call_allowed: true, reason: "parked" }),
          ),
        4000,
      );
    }
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
    this.overrideUntilMs = this.simMs + 15 * 60_000;
    this.push(this.event("ppe.override_granted", EVENT_PAYLOADS["ppe.override_granted"]));
    return { ...rpc.ppeOverrideOut, valid_until: new Date(this.overrideUntilMs).toISOString() };
  }
  async ledgerVerify() {
    await wait(this.latencyMs);
    // Dynamic import: the ledger generator and verifier stay out of every other page's bundle.
    const { ledgerVerdict } = await import("@/ledger/fixtures");
    return ledgerVerdict(this.ledgerScenario);
  }
  async ledgerExport(input: { p_first_seq: number; p_last_seq: number }) {
    await wait(this.latencyMs);
    const { ledgerRows } = await import("@/ledger/fixtures");
    const rows = await ledgerRows(this.ledgerScenario);
    if (input.p_first_seq > rows.length || input.p_last_seq > rows.length) throw new RpcError("validation");
    return rows.slice(input.p_first_seq - 1, input.p_last_seq);
  }
  async ledgerRecompute(input: { p_first_seq: number; p_last_seq: number }) {
    await wait(this.latencyMs);
    const [{ ledgerRows }, { merkleRoot }] = await Promise.all([import("@/ledger/fixtures"), import("@cat/shared/ledger")]);
    const rows = (await ledgerRows(this.ledgerScenario)).slice(input.p_first_seq - 1, input.p_last_seq);
    if (rows.length === 0) throw new RpcError("validation");
    return {
      first_seq: input.p_first_seq,
      last_seq: input.p_first_seq + rows.length - 1,
      leaf_count: rows.length,
      root_hex: await merkleRoot(rows.map((r) => r.entry_hash)),
      head_hash: rows[rows.length - 1]!.entry_hash,
    };
  }
  async replayGet() {
    await wait(this.latencyMs);
    return replayScenario;
  }
  async replaySubmit(input: Parameters<DataPort["replaySubmit"]>[0]) {
    await wait(this.latencyMs * 3);
    const { fixtureAnswerKey, scoreReplay } = await import("@/replay/fixture-scoring");
    return scoreReplay(replayScenario as ReplayScenario, fixtureAnswerKey, input);
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
    this.overrideUntilMs = null;
  }
}
