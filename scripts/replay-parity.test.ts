/**
 * B10b acceptance: "replay_submit returns exactly what the web's scoreReplay returns for the same scenario and
 * answers", and "the stored replay parses with ReplayScenario".
 *
 *  1. PARITY: the fixture scenario and its answer key (apps/web/src/replay/fixture-scoring.ts) are written into
 *     replay_scenarios inside a transaction that is always rolled back; a fixed set of hand-made answers plus 250
 *     seeded random ones go through `public.replay_submit` (as the operator, over RLS) and through `scoreReplay`;
 *     the two results must be deep-equal, scores to the last digit.
 *  2. BUILD: the 010_replay.sql prelude (a scenario with frames), one breach frame, `private.step_loop`, then the
 *     stored `scenario_json` is parsed with the zod `ReplayScenario` (incl. event_ms and seatbelt_fastened).
 *  3. QUEUE: a loop_queue row that cannot be built is marked with an error and committed; nothing else is touched.
 *
 * Nothing in 1 and 2 is committed. Skipped when no connection is configured.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { ReplayScenario } from "../packages/shared/src/index.ts";
import { replayScenario } from "../packages/shared/src/fixtures/index.ts";
import { fixtureAnswerKey, scoreReplay, type SubmitInput } from "../apps/web/src/replay/fixture-scoring.ts";
import { poolerUrl } from "./lib/db.ts";
import { loadEnv, repoRoot } from "./lib/env.ts";

class Rollback extends Error {}
const env = loadEnv();
const enabled = Boolean(env.CONNECTION_STRING && env.SUPABASE_DB_PASSWORD);
const sql = enabled ? postgres(poolerUrl(env), { max: 1, prepare: false, onnotice: () => {} }) : null;
afterAll(async () => { await sql?.end(); });
const d = enabled ? describe : describe.skip;

type Choice = SubmitInput["p_choices"][number];

/** Deterministic PRNG (mulberry32) so a failure reproduces. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CARDS = ["c_trend", "c_map", "c_card", "c_wind", "c_fault", "c_weather", "c_shift"];
const STEP_CHOICES: Record<number, string[]> = { 1: ["stop", "continue"], 2: ["belt", "radio"], 3: ["a", "b", "c"] };
const LIMIT_MS: Record<number, number> = { 1: 15000, 2: 15000, 3: 20000 };

function cases(): SubmitInput[] {
  const hand: SubmitInput[] = [
    { p_open_order: ["c_trend", "c_map", "c_card"], p_choices: [{ step: 1, choice_ids: ["stop"], ms: 1000 }, { step: 2, choice_ids: ["belt"], ms: 1000 }, { step: 3, choice_ids: ["a", "b", "c"], ms: 1000 }] },
    { p_open_order: [], p_choices: [] },
    { p_open_order: ["c_wind", "c_fault", "c_weather", "c_shift"], p_choices: [{ step: 1, choice_ids: ["continue"], ms: 20000 }] },
    { p_open_order: ["c_trend", "c_trend", "c_map", "c_card", "c_wind", "c_shift"], p_choices: [{ step: 1, choice_ids: ["stop"], ms: 15000 }, { step: 3, choice_ids: ["c", "b", "a"], ms: 20001 }] },
    { p_open_order: ["c_card", "c_map", "c_trend"], p_choices: [{ step: 3, choice_ids: ["b", "a", "c"], ms: 500 }] },
    { p_open_order: ["c_trend", "nope", "c_map"], p_choices: [{ step: 2, choice_ids: ["belt", "radio"], ms: 0 }, { step: 3, choice_ids: ["a"], ms: 0 }] },
    { p_open_order: ["c_trend", "c_map", "c_card"], p_choices: [{ step: 1, choice_ids: ["stop"], ms: 100 }, { step: 1, choice_ids: ["continue"], ms: 100 }, { step: 9, choice_ids: ["x"], ms: 1 }] },
    { p_open_order: ["c_map", "c_trend", "c_wind"], p_choices: [{ step: 2, choice_ids: ["belt"], ms: 15000 }, { step: 3, choice_ids: ["a", "c", "b"], ms: 19999 }] },
  ];
  const rand = rng(10_000_011);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const shuffle = <T,>(xs: readonly T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const random: SubmitInput[] = [];
  for (let n = 0; n < 250; n++) {
    const open: string[] = [];
    const len = Math.floor(rand() * 9);
    for (let i = 0; i < len; i++) open.push(rand() < 0.06 ? "unknown_card" : pick(CARDS));   // repeats and strays are part of the point
    const choices: Choice[] = [];
    for (const step of [1, 2, 3]) {
      if (rand() < 0.2) continue;                                                              // a timed-out step is absent
      const pool = STEP_CHOICES[step]!;
      const ids = step === 3 ? shuffle(pool).slice(0, 1 + Math.floor(rand() * 3)) : shuffle(pool).slice(0, 1 + Math.floor(rand() * 2));
      const lim = LIMIT_MS[step]!;
      choices.push({ step, choice_ids: ids, ms: pick([0, lim - 1, lim, lim + 1, lim * 2, Math.floor(rand() * lim * 1.5)]) });
      if (rand() < 0.05) choices.push({ step, choice_ids: [pick(pool)], ms: 1 });             // a duplicate answer: the first wins
    }
    random.push({ p_open_order: open, p_choices: choices });
  }
  return [...hand, ...random];
}

const rows = (x: unknown) => JSON.parse(JSON.stringify(x));

d("replay_submit matches the web scoreReplay", () => {
  it("returns exactly what scoreReplay returns for the same scenario and answers", async () => {
    const all = cases();
    let compared = 0;
    try {
      await sql!.begin(async (tx) => {
        await tx.unsafe(`
          create temp table ids (k text primary key, v uuid) on commit drop;
          insert into ids select k, gen_random_uuid() from unnest(array['site','op','u','scn','ev','rs']) k;
          grant select on ids to authenticated;
          insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            select v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parity@b10b.local', '', now(), '{}', '{}', now(), now() from ids where k = 'u';
          insert into public.sites (id, code, name, site_type, location)
            select v, 'SQLPARITY', 'parity site', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography from ids where k = 'site';
          insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym)
            select o.v, 'OP-PARITY', 'Parity', 'novice', s.v, 'Operator-PAR' from ids o, ids s where o.k = 'op' and s.k = 'site';
          insert into public.profiles (user_id, role, operator_id, site_id, display_name)
            select u.v, 'operator', o.v, s.v, 'Parity' from ids u, ids o, ids s where u.k = 'u' and o.k = 'op' and s.k = 'site';`);
        const [{ ev }] = await tx<{ ev: string }[]>`
          select (private.emit_event('safety.seatbelt_breach', '{"frame_seq": 1}', 'parity:' || gen_random_uuid()::text, 'system',
                   (select v from ids where k = 'site'), p_operator_id => (select v from ids where k = 'op'))).id::text as ev`;
        const [{ rid }] = await tx<{ rid: string }[]>`
          insert into public.replay_scenarios (source_event_id, operator_id, template_version, scenario_json, answer_key)
          values (${ev}::uuid, (select v from ids where k = 'op'), 1, ${JSON.stringify(replayScenario)}::text::jsonb, ${JSON.stringify(fixtureAnswerKey)}::text::jsonb)
          returning id::text as rid`;
        await tx.unsafe(`set local role authenticated`);
        await tx`select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'u'), 'role', 'authenticated')::text, true)`;

        const payload = all.map((c, ord) => ({ ord, open: c.p_open_order, choices: c.p_choices }));
        const got = await tx<{ ord: number; res: unknown }[]>`
          select x.ord, public.replay_submit(${rid}::uuid, gen_random_uuid(), array(select jsonb_array_elements_text(x.open)), x.choices) as res
            from jsonb_to_recordset(${JSON.stringify(payload)}::text::jsonb) as x(ord int, open jsonb, choices jsonb) order by x.ord`;
        expect(got).toHaveLength(all.length);
        for (const row of got) {
          const input = all[row.ord]!;
          const expected = rows(scoreReplay(replayScenario as never, fixtureAnswerKey, input));
          expect(rows(row.res), `case ${row.ord}: ${JSON.stringify(input)}`).toEqual(expected);
          compared++;
        }
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    expect(compared).toBe(all.length);
    console.log(`replay parity: ${compared} answer sets, replay_submit == scoreReplay`);
  }, 120_000);
});

d("build_replay output parses with the ReplayScenario contract", () => {
  it("a breach frame becomes one replay that ReplayScenario accepts, with event_ms and the belt", async () => {
    const prelude = readFileSync(join(repoRoot(), "supabase", "tests", "010_replay.sql"), "utf8").split("-- ── 0.")[0]!;
    let parsed: ReturnType<typeof ReplayScenario.safeParse> | null = null;
    let raw: { reenactment: { event_ms?: number; machine_track: { seatbelt_fastened?: boolean | null }[] } } | null = null;
    try {
      await sql!.begin(async (tx) => {
        await tx.unsafe(prelude);
        await tx.unsafe(`select pg_temp.apply(11)`);
        await tx.unsafe(`delete from private.loop_queue where event_id not in (select id from public.events where run_id = pg_temp.id('run'))`);
        const [{ n }] = await tx<{ n: number }[]>`select private.step_loop(20) as n`;
        expect(n).toBe(1);
        const [row] = await tx<{ j: unknown }[]>`select scenario_json as j from public.replay_scenarios`;
        parsed = ReplayScenario.safeParse(row!.j);
        raw = row!.j as typeof raw;
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    const p = parsed as unknown as ReturnType<typeof ReplayScenario.safeParse>;
    expect(p.success, p.success ? "" : JSON.stringify(p.error.issues.slice(0, 5))).toBe(true);
    expect(raw!.reenactment.event_ms).toBe(600000);
    expect(p.success && p.data.reenactment.event_ms).toBe(600000);
    const belts = raw!.reenactment.machine_track.map((p) => p.seatbelt_fastened);
    expect(belts.slice(0, 10).every((b) => b === true)).toBe(true);
    expect(belts.slice(10).every((b) => b === false)).toBe(true);
  }, 60_000);
});

d("a queue row that cannot be built", () => {
  it("is marked with an error, committed, and leaves everything else alone", async () => {
    const [{ id }] = await sql!<{ id: string }[]>`select gen_random_uuid()::text as id`;
    try {
      await sql!`insert into private.loop_queue (event_id) values (${id}::uuid)`;
      // Either this call or the worker's own step 2 (whichever is first) takes the row; both write the same thing.
      await sql!`select private.step_loop(20)`;
      let row: { done_at: string | null; error: string | null } | undefined;
      for (let i = 0; i < 10 && !row?.error; i++) {
        [row] = await sql!<{ done_at: string | null; error: string | null }[]>`select done_at, error from private.loop_queue where event_id = ${id}::uuid`;
        if (!row?.error) await new Promise((r) => setTimeout(r, 500));
      }
      expect(row?.error).toBe("event not found");
      expect(row?.done_at).toBeNull();
    } finally {
      await sql!`delete from private.loop_queue where event_id = ${id}::uuid`;
    }
  }, 30_000);
});
