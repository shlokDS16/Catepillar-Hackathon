import { describe, expect, it, vi } from "vitest";
import { mySnapshot } from "@cat/shared/fixtures";
import { demoReplayScenario } from "@/replay/fixture-recording";
import { ledgerVerdict } from "@/ledger/fixtures";
import { FixtureAdapter } from "./fixture-adapter";
import { LiveAdapter, type RpcCaller, type RpcResult } from "./live-adapter";

const ok = (data: unknown): RpcResult => ({ data, error: null });
const fail = (message = "boom"): RpcResult => ({ data: null, error: { message } });

function setup(reply: (fn: string, args?: Record<string, unknown>) => RpcResult | Promise<RpcResult>) {
  const rpc = vi.fn<RpcCaller>(async (fn, args) => reply(fn, args));
  const hooks = { onFallback: vi.fn(), onLive: vi.fn() };
  const fixtures = new FixtureAdapter(0);
  return { rpc, hooks, fixtures, live: new LiveAdapter(rpc, fixtures, hooks) };
}

describe("LiveAdapter: the four live calls", () => {
  it("snapshot calls my_snapshot, returns the validated body and reports live", async () => {
    const { live, rpc, hooks } = setup(() => ok(mySnapshot));
    const snap = await live.snapshot();
    expect(rpc).toHaveBeenCalledWith("my_snapshot", undefined);
    expect(snap.profile.role).toBe(mySnapshot.profile.role);
    expect(hooks.onLive).toHaveBeenCalledTimes(1);
    expect(hooks.onFallback).not.toHaveBeenCalled();
  });

  it("replayGet and replaySubmit map their arguments to the RPC parameter names", async () => {
    const result = {
      scores: { safety: 80, procedure: 70, efficiency: 60 },
      process_trace: { opened: [], ideal: [], relevant: [] },
      review: [],
      rule: { card_id: "seatbelt_slopes", text: { en: "Belt on.", hi: "बेल्ट बाँधें।" }, audio_id: null },
      lesson_code: null,
    };
    const { live, rpc } = setup((fn) => (fn === "replay_get" ? ok(demoReplayScenario) : ok(result)));
    const id = "11111111-1111-4111-8111-111111111111";
    const req = "22222222-2222-4222-8222-222222222222";
    expect((await live.replayGet({ p_replay_id: id })).event_type).toBe("safety.seatbelt_breach");
    expect(rpc).toHaveBeenCalledWith("replay_get", { p_replay_id: id });
    const out = await live.replaySubmit({ p_replay_id: id, p_request_id: req, p_open_order: ["a"], p_choices: [{ step: 1, choice_ids: ["x"], ms: 1200 }] });
    expect(out.scores.safety).toBe(80);
    expect(rpc).toHaveBeenLastCalledWith("replay_submit", {
      p_replay_id: id,
      p_request_id: req,
      p_open_order: ["a"],
      p_choices: [{ step: 1, choice_ids: ["x"], ms: 1200 }],
    });
  });

  it("ledgerVerify defaults its range to the whole chain", async () => {
    const { live, rpc } = setup(async () => ok(await ledgerVerdict("intact")));
    const out = await live.ledgerVerify({});
    expect(out.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("ledger_verify", { p_from: 1, p_to: null });
  });
});

describe("LiveAdapter: fallback", () => {
  it("a server error answers that call from fixtures and reports the fallback", async () => {
    const { live, hooks, fixtures } = setup(() => fail("forbidden"));
    const spy = vi.spyOn(fixtures, "snapshot");
    const snap = await live.snapshot();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(snap.profile.user_id).toBeTruthy();
    expect(hooks.onFallback).toHaveBeenCalledTimes(1);
    expect(hooks.onLive).not.toHaveBeenCalled();
  });

  it("a thrown network error and a body that breaks the contract both fall back", async () => {
    const thrown = setup(() => {
      throw new Error("offline");
    });
    await expect(thrown.live.replayGet({ p_replay_id: "11111111-1111-4111-8111-111111111111" })).resolves.toMatchObject({ event_type: "safety.seatbelt_breach" });
    expect(thrown.hooks.onFallback).toHaveBeenCalledTimes(1);

    const bad = setup(() => ok({ not: "a snapshot" }));
    await bad.live.snapshot();
    expect(bad.hooks.onFallback).toHaveBeenCalledTimes(1);
    expect(bad.hooks.onLive).not.toHaveBeenCalled();
  });
});

describe("LiveAdapter: everything else is fixtures", () => {
  it("SOS and the other methods never touch the network", async () => {
    const { live, rpc, fixtures } = setup(() => ok(null));
    const raise = vi.spyOn(fixtures, "sosRaise").mockResolvedValue({ sos_id: "x" } as never);
    const cancel = vi.spyOn(fixtures, "sosCancel").mockResolvedValue(undefined);
    await live.sosRaise({ p_request_id: "22222222-2222-4222-8222-222222222222" } as never);
    await live.sosCancel({ p_sos_id: "33333333-3333-4333-8333-333333333333" } as never);
    await live.protocolCard("seatbelt_slopes");
    await live.inbox();
    expect(raise).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });
});
