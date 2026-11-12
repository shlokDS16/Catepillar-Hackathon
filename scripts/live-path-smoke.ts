/**
 * D18 live-path smoke: signs in as the seeded demo operator and fleet manager (credentials from the
 * git-ignored .env, written by scripts/seed-demo-users.ts) and calls the four RPCs the web Live switch
 * uses, as the right role, validating each response with the shared zod contracts.
 *
 *   pnpm exec tsx scripts/live-path-smoke.ts
 *
 * Prints PASS or FAIL per RPC. It never prints a value, token or credential, and it never calls
 * sos_raise, sos_cancel or anything else that dispatches. replay_submit uses a fixed request id, so a
 * re-run returns the stored debrief instead of adding an attempt.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LedgerVerifyOut, MySnapshotOut, ReplayDebriefResult, ReplayScenario } from "../packages/shared/src/index.ts";
import { loadEnv, requireEnv } from "./lib/env.ts";

const REQUEST_ID = "5d1f0a64-7c1e-4f0b-9a52-0d11e0a5e001";
const env = requireEnv(loadEnv(), "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "DEMO_OPERATOR_EMAIL", "DEMO_OPERATOR_PASSWORD", "DEMO_FM_EMAIL", "DEMO_FM_PASSWORD");

const results: { rpc: string; role: string; ok: boolean; note: string }[] = [];
async function check(rpc: string, role: string, fn: () => Promise<string>) {
  try {
    results.push({ rpc, role, ok: true, note: await fn() });
  } catch (e) {
    results.push({ rpc, role, ok: false, note: (e as Error).message.slice(0, 120) });
  }
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in rejected (${error.status ?? "?"})`);
  return c;
}
async function call<T>(c: SupabaseClient, fn: string, args: Record<string, unknown> | undefined, schema: { parse(v: unknown): T }): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`rpc error: ${error.message.slice(0, 60)}`);
  return schema.parse(data);
}

let op = null as SupabaseClient | null;
let fm = null as SupabaseClient | null;
await check("auth sign-in", "operator", async () => ((op = await signIn(env.DEMO_OPERATOR_EMAIL!, env.DEMO_OPERATOR_PASSWORD!)), "signed in"));
await check("auth sign-in", "fleet_manager", async () => ((fm = await signIn(env.DEMO_FM_EMAIL!, env.DEMO_FM_PASSWORD!)), "signed in"));

let replayId: string | null = null;
if (op) {
  const o = op;
  await check("my_snapshot", "operator", async () => {
    const snap = await call(o, "my_snapshot", undefined, MySnapshotOut);
    if (snap.profile.role !== "operator") throw new Error("profile role is not operator");
    replayId = snap.assignments.find((a) => a.replay_id)?.replay_id ?? null;
    return `contract ok, ${snap.assignments.length} assignment(s), replay ${replayId ? "present" : "missing"}`;
  });
  let scenario: ReplayScenario | null = null;
  await check("replay_get", "operator", async () => {
    if (!replayId) throw new Error("no replay_id in the snapshot");
    scenario = await call(o, "replay_get", { p_replay_id: replayId }, ReplayScenario);
    return `contract ok, ${scenario.decide.steps.length} decide steps`;
  });
  await check("replay_submit", "operator", async () => {
    if (!replayId || !scenario) throw new Error("no replay to submit");
    const sc: ReplayScenario = scenario;
    const out = await call(
      o,
      "replay_submit",
      {
        p_replay_id: replayId,
        p_request_id: REQUEST_ID,
        p_open_order: sc.investigate.cards.slice(0, sc.investigate.max_open ?? 3).map((c) => c.id),
        p_choices: sc.decide.steps.map((s) => ({ step: s.step, choice_ids: [s.choices[0]!.id], ms: 1500 })),
      },
      ReplayDebriefResult,
    );
    return `contract ok, ${out.review.length} review rows`;
  });
}
if (fm) {
  const f = fm;
  await check("my_snapshot", "fleet_manager", async () => {
    const snap = await call(f, "my_snapshot", undefined, MySnapshotOut);
    if (snap.profile.role !== "fleet_manager") throw new Error("profile role is not fleet_manager");
    return "contract ok";
  });
  await check("ledger_verify", "fleet_manager", async () => {
    const v = await call(f, "ledger_verify", { p_from: 1, p_to: null }, LedgerVerifyOut);
    if (!v.ok) throw new Error("ledger verdict is not ok");
    return "contract ok, verdict ok";
  });
}
if (op) {
  const o = op;
  await check("ledger_verify refused", "operator", async () => {
    const { error } = await o.rpc("ledger_verify", { p_from: 1, p_to: null });
    if (!error) throw new Error("an operator could verify the ledger");
    return "operator is refused, as designed";
  });
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.rpc.padEnd(22)} ${r.role.padEnd(14)} ${r.note}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
