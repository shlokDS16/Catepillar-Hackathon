import { afterEach, describe, expect, it, vi } from "vitest";
import { IDS } from "@cat/shared/fixtures";
import { FixtureAdapter } from "./fixture-adapter";
import { initialState, reduce, type AppState } from "./reducer";
import type { AppEvent, Snapshot } from "./types";

/** Run a beat (or any action) and collect what the store would receive. */
async function collect(adapter: FixtureAdapter, run: () => Promise<void>): Promise<AppEvent[]> {
  const seen: AppEvent[] = [];
  const off = adapter.subscribe((m) => {
    if (m.kind === "event") seen.push(m.event);
  });
  await run();
  off();
  return seen;
}

function fold(snap: Snapshot, events: AppEvent[]): AppState {
  let s = reduce(initialState, { type: "snapshot", snapshot: snap, nowMs: 0 });
  for (const e of events) s = reduce(s, { type: "event", event: e, nowMs: 0 });
  return s;
}

describe("FixtureAdapter baseline and new beats", () => {
  it("starts consistent: vest off, task blocked on it, one PPE caution, replay assigned, no ledger alert", async () => {
    const snap = await new FixtureAdapter(0).snapshot();
    expect(snap.operator_state?.ppe.vest).toBe(false);
    expect(snap.tasks[0]?.status).toBe("blocked_ppe");
    expect(snap.active_alerts.map((a) => [a.kind, a.tier])).toEqual([["ppe_missing", "caution"]]);
    expect(snap.assignments).toHaveLength(1);
    expect(snap.assignments[0]).toMatchObject({ lesson_code: "seatbelt_slopes", replay_id: IDS.replay });
    expect(snap.machine?.moving).toBe(false);
  });

  it("Beat 1 clears the PPE caution and unblocks the task", async () => {
    const adapter = new FixtureAdapter(0);
    const snap = await adapter.snapshot();
    const s = fold(snap, await collect(adapter, () => adapter.playBeat(1)));
    expect(s.tasks[0]?.status).toBe("planned");
    expect(s.alerts.every((a) => a.status === "resolved")).toBe(true);
  });

  it("the inbox has no ledger alert until Beat 5 and never says sent for a dry run", async () => {
    const rows = await new FixtureAdapter(0).inbox();
    expect(rows.some((r) => r.kind === "ledger_tamper")).toBe(false);
    for (const r of rows) if (r.dispatch) expect(r.dispatch).toBe("telegram:dry_run");
  });

  it("Beat 5 raises the critical ledger alert with a dry-run dispatch line", async () => {
    const adapter = new FixtureAdapter(0);
    const seen = await collect(adapter, () => adapter.playBeat(5));
    expect(seen.some((e) => e.type === "alert.raised" && (e.payload as { kind: string }).kind === "ledger_tamper")).toBe(true);
    const line = seen.find((e) => e.type === "dispatch.sent");
    expect(line?.payload).toMatchObject({ status: "dry_run" });
    expect(line?.alert_id).toBe(IDS.root);
  });

  it("Beat 8 resolves the seatbelt alert, fastens the belt and lifts the motion lock (parked)", async () => {
    const adapter = new FixtureAdapter(0);
    const seen = await collect(adapter, () => adapter.playBeat(8));
    expect(seen.map((e) => e.type)).toEqual(["safety.seatbelt_resolved", "alert.resolved", "operator.motion_lock_changed"]);
    expect(seen[1]?.payload).toMatchObject({ alert_id: IDS.alert });
    expect(seen[2]?.payload).toMatchObject({ motion_locked: false, call_allowed: true, reason: "parked" });
  });

  it("Beat 2 then Beat 8 leaves no open warning, no lock and a stopped machine", async () => {
    const adapter = new FixtureAdapter(0);
    const snap = await adapter.snapshot();
    const s = fold(snap, await collect(adapter, async () => {
      await adapter.playBeat(2);
      await adapter.playBeat(8);
    }));
    expect(s.alerts.filter((a) => a.tier === "warning").every((a) => a.status === "resolved")).toBe(true);
    expect(s.operator?.motion_locked).toBe(false);
    expect(s.machine?.moving).toBe(false);
    expect(s.machine?.seatbelt_fastened).toBe(true);
  });

  it("Beat 4 re-announces the seeded assignment instead of adding a second one", async () => {
    const adapter = new FixtureAdapter(0);
    const snap = await adapter.snapshot();
    const s = fold(snap, await collect(adapter, () => adapter.playBeat(4)));
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0]?.replay_id).toBe(IDS.replay);
  });
});

describe("FixtureAdapter reload persistence", () => {
  function stubBrowser() {
    const mem = new Map<string, string>();
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
      location: { reload: vi.fn() },
    });
    return mem;
  }
  afterEach(() => vi.unstubAllGlobals());

  /** What a fresh page load would see: the snapshot, then the replayed events. */
  async function reload(): Promise<{ adapter: FixtureAdapter; state: AppState; seen: AppEvent[] }> {
    const adapter = new FixtureAdapter(0);
    const seen: AppEvent[] = [];
    const off = adapter.subscribe((m) => {
      if (m.kind === "event") seen.push(m.event);
    });
    const snap = await adapter.snapshot();
    await new Promise((r) => setTimeout(r, 5));
    off();
    return { adapter, state: fold(snap, seen), seen };
  }

  it("a new adapter after Beats 1 and 2 replays them and remembers the vest", async () => {
    stubBrowser();
    const first = new FixtureAdapter(0);
    await first.playBeat(1);
    await first.playBeat(2);

    const { adapter, state, seen } = await reload();
    expect(seen.map((e) => e.type)).toEqual(expect.arrayContaining(["ppe.restored", "safety.seatbelt_breach", "alert.raised"]));
    expect(state.operator?.motion_locked).toBe(true);
    expect(state.alerts.some((a) => a.kind === "seatbelt_off_moving" && a.status === "open")).toBe(true);
    expect((await adapter.taskStart({ p_task_id: IDS.task, p_request_id: IDS.request })).status).toBe("started");
    await adapter.taskPause({ p_task_id: IDS.task });
  });

  it("keeps the ledger tamper state across a reload", async () => {
    stubBrowser();
    await new FixtureAdapter(0).playBeat(5);
    const verdict = await new FixtureAdapter(0).ledgerVerify();
    expect(verdict.ok).toBe(false);
  });

  it("Beat 2 then Beat 8 stays cleared after a reload", async () => {
    stubBrowser();
    const first = new FixtureAdapter(0);
    await first.playBeat(2);
    await first.playBeat(8);
    const { state } = await reload();
    expect(state.alerts.filter((a) => a.tier === "warning").every((a) => a.status === "resolved")).toBe(true);
    expect(state.operator?.motion_locked).toBe(false);
    expect(state.machine?.moving).toBe(false);
  });

  it("Reset demo clears the stored state, reloads, and a late timer cannot write it back", async () => {
    const mem = stubBrowser();
    const adapter = new FixtureAdapter(0);
    await adapter.playBeat(1);
    expect(mem.size).toBe(1);
    adapter.resetDemo();
    expect(mem.size).toBe(0);
    await adapter.playBeat(2);
    expect(mem.size).toBe(0);
  });
});
