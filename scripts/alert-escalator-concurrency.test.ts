/**
 * B12 acceptance: the sos-escalator job runs on its own connection, takes no advisory lock, and never waits
 * for another session (event-pipeline §3: "a failing or slow tick cannot delay it"; §8 "Escalation: concurrent
 * job runs -> FOR UPDATE SKIP LOCKED + CAS"). That needs two real sessions, which `scripts/sqltest.ts` cannot give.
 *
 * Nothing is committed: each session works inside a transaction that is always rolled back, so this is safe
 * against the shared project. Skipped when no connection is configured or migration 007 is not applied yet.
 * Dry run only: escalate_step writes dispatch rows as dry_run and never calls pg_net.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { poolerUrl } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";

class Rollback extends Error {}
const env = loadEnv();
const enabled = Boolean(env.CONNECTION_STRING && env.SUPABASE_DB_PASSWORD);
const open = () => postgres(poolerUrl(env), { max: 1, prepare: false, onnotice: () => {} });
const holder = enabled ? open() : null;      // session A: holds uncommitted alert and dispatch rows (and row locks)
const rival = enabled ? open() : null;       // session B: a second run of the escalator, as an overlapping cron run would be
let deployed = false;

beforeAll(async () => {
  if (!enabled) return;
  const r = await rival!`select to_regprocedure('private.escalate_step(timestamptz)') is not null as ok`;
  deployed = Boolean(r[0]?.ok);
});
afterAll(async () => { await holder?.end(); await rival?.end(); });

describe.skipIf(!enabled)("sos-escalator concurrency", () => {
  it("a second run is never blocked by a session that holds alerts, and takes no advisory lock", async function () {
    if (!deployed) return;       // before `supabase db push` there is nothing to measure
    let held: () => void;
    let letGo: () => void;
    const taken = new Promise<void>((r) => { held = r; });
    const release = new Promise<void>((r) => { letGo = r; });
    const session = holder!.begin(async (tx) => {
      const site = await tx<{ id: string }[]>`insert into public.sites (code, name, site_type, location)
        values ('SQLB12C', 'b12 concurrency', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography)
        returning id`;
      const alert = await tx<{ id: string }[]>`select private.raise_alert(null, 'sos', 'sos:-:' || gen_random_uuid()::text, 'critical',
        ${site[0]!.id}, null, null, false) as id`;
      await tx`select private.escalate_step(clock_timestamp() + interval '61 seconds')`;   // A escalates its own alert and keeps the locks
      const mine = await tx<{ status: string }[]>`select status from public.alerts where id = ${alert[0]!.id}`;
      expect(mine[0]!.status).toBe("escalating");
      const adv = await tx<{ n: number }[]>`select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`;
      expect(adv[0]!.n).toBe(0);                                                           // no advisory lock in A
      held();
      await release;
      throw new Rollback();
    }).catch((e) => { if (!(e instanceof Rollback)) throw e; });

    await taken;
    try {
      const t0 = Date.now();
      const out = await rival!.begin(async (tx) => {
        await tx`set local lock_timeout = '2s'`;
        const r = await tx<{ v: { errors: number } }[]>`select private.escalate_step(clock_timestamp() + interval '61 seconds') as v`;
        const adv = await tx<{ n: number }[]>`select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`;
        throw Object.assign(new Rollback(), { out: { errors: r[0]!.v.errors, adv: adv[0]!.n } });
      }).catch((e: Rollback & { out?: { errors: number; adv: number } }) => e.out);
      expect(Date.now() - t0).toBeLessThan(5_000);          // it ran to completion without waiting for A
      expect(out).toEqual({ errors: 0, adv: 0 });           // and took no advisory lock
    } finally {
      letGo!();
      await session;
    }
  }, 60_000);

  it("rows another session has locked are skipped, not waited for (real committed alerts, if any)", async function () {
    if (!deployed) return;
    // Lock every live open alert in A, then run the escalator in B with a 2 s lock timeout: SKIP LOCKED means it
    // returns at once instead of timing out. With no live open alert there is nothing to lock and the check is vacuous.
    let held: () => void;
    let letGo: () => void;
    const taken = new Promise<number>((r) => { held = () => r(0); });
    const release = new Promise<void>((r) => { letGo = r; });
    let locked = 0;
    const session = holder!.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`select id from public.alerts where status in ('open', 'escalating') for update`;
      locked = rows.length;
      held();
      await release;
      throw new Rollback();
    }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
    await taken;
    try {
      const t0 = Date.now();
      await rival!.begin(async (tx) => {
        await tx`set local lock_timeout = '2s'`;
        await tx`select private.escalate_step(clock_timestamp() + interval '61 seconds')`;
        throw new Rollback();
      }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
      expect(Date.now() - t0).toBeLessThan(5_000);
      if (locked === 0) console.log("note: no live open alert existed, so skip-locked was exercised against nothing");
    } finally {
      letGo!();
      await session;
    }
  }, 60_000);
});
