import { LedgerVerifyOut, MySnapshotOut, ReplayDebriefResult, ReplayScenario } from "@cat/shared";
import type { DataPort } from "@/data/port";

/**
 * D18 thin live path. The LiveAdapter answers four calls from the real backend, as the signed-in
 * user: my_snapshot, replay_get, replay_submit and ledger_verify. Every response is validated with
 * the shared zod contract. Everything else, and every SOS method, is the FixtureAdapter's (SOS stays
 * on the dry-run path on purpose: D15, no calls or messages). When a live call fails, for any
 * reason, that one call is answered from the fixtures and `onFallback` tells the UI to say so.
 */
export type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type RpcCaller = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

export type LiveHooks = {
  /** A live call failed and was answered from fixtures. */
  onFallback: () => void;
  /** A live call succeeded (clears the notice). */
  onLive: () => void;
};

type Schema<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false } };

export class LiveAdapter implements DataPort {
  constructor(
    private rpc: RpcCaller,
    private fixtures: DataPort,
    private hooks: LiveHooks,
  ) {}

  /** One live call: RPC, then contract validation. Any failure (network, server error, bad shape) is a fallback. */
  private async live<T>(fn: string, args: Record<string, unknown> | undefined, schema: Schema<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      const { data, error } = await this.rpc(fn, args);
      if (error) throw new Error("rpc failed");
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new Error("contract mismatch");
      this.hooks.onLive();
      return parsed.data;
    } catch {
      this.hooks.onFallback();
      return fallback();
    }
  }

  // ── live ───────────────────────────────────────────────────────────────────────────────────
  snapshot: DataPort["snapshot"] = () => this.live("my_snapshot", undefined, MySnapshotOut, () => this.fixtures.snapshot());

  replayGet: DataPort["replayGet"] = (input) => this.live("replay_get", { p_replay_id: input.p_replay_id }, ReplayScenario, () => this.fixtures.replayGet(input));

  replaySubmit: DataPort["replaySubmit"] = (input) =>
    this.live(
      "replay_submit",
      { p_replay_id: input.p_replay_id, p_request_id: input.p_request_id, p_open_order: input.p_open_order, p_choices: input.p_choices },
      ReplayDebriefResult,
      () => this.fixtures.replaySubmit(input),
    );

  ledgerVerify: DataPort["ledgerVerify"] = (input) =>
    this.live("ledger_verify", { p_from: input.p_from ?? 1, p_to: input.p_to ?? null }, LedgerVerifyOut, () => this.fixtures.ledgerVerify(input));

  // ── fixtures ───────────────────────────────────────────────────────────────────────────────
  subscribe: DataPort["subscribe"] = (onMessage) => this.fixtures.subscribe(onMessage);
  protocolCard: DataPort["protocolCard"] = (id) => this.fixtures.protocolCard(id);
  siteMap: DataPort["siteMap"] = () => this.fixtures.siteMap();
  inbox: DataPort["inbox"] = () => this.fixtures.inbox();
  pairMachine: DataPort["pairMachine"] = (i) => this.fixtures.pairMachine(i);
  consentSet: DataPort["consentSet"] = (i) => this.fixtures.consentSet(i);
  taskStart: DataPort["taskStart"] = (i) => this.fixtures.taskStart(i);
  taskPause: DataPort["taskPause"] = (i) => this.fixtures.taskPause(i);
  taskComplete: DataPort["taskComplete"] = (i) => this.fixtures.taskComplete(i);
  alertAck: DataPort["alertAck"] = (i) => this.fixtures.alertAck(i);
  incidentLog: DataPort["incidentLog"] = (i) => this.fixtures.incidentLog(i);
  ask: DataPort["ask"] = (i) => this.fixtures.ask(i);
  ppeOverride: DataPort["ppeOverride"] = (i) => this.fixtures.ppeOverride(i);
  ledgerExport: DataPort["ledgerExport"] = (i) => this.fixtures.ledgerExport(i);
  ledgerRecompute: DataPort["ledgerRecompute"] = (i) => this.fixtures.ledgerRecompute(i);
  lessonGet: DataPort["lessonGet"] = (c) => this.fixtures.lessonGet(c);
  lessonComplete: DataPort["lessonComplete"] = (i) => this.fixtures.lessonComplete(i);
  recurrence: DataPort["recurrence"] = (c) => this.fixtures.recurrence(c);

  /** SOS is always the fixture dry-run path (D15). These never reach the network. */
  sosRaise: DataPort["sosRaise"] = (i) => this.fixtures.sosRaise(i);
  sosCancel: DataPort["sosCancel"] = (i) => this.fixtures.sosCancel(i);
}
