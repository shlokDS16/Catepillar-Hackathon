/**
 * B12 acceptance (the skip-locked proof against committed rows is the flagged local-stack test at the bottom): the sos-escalator job runs on its own connection, takes no advisory lock, and never waits
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

});

/**
 * FOR UPDATE SKIP LOCKED against COMMITTED rows. Another session can only contend for rows it can see, so a
 * rolled-back proof cannot show this, and committing fixtures to the shared project is forbidden (lane rule).
 * It therefore runs only against a throwaway database: start the local stack (`supabase start`, `supabase db reset`),
 * then   B12_LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm exec vitest run scripts/alert-escalator-concurrency.test.ts
 * Do it before B13 turns live sending on. The fixtures are committed to that local database and removed afterwards.
 */
const localUrl = process.env.B12_LOCAL_DB_URL;
describe.skipIf(!localUrl)("sos-escalator skip locked (local stack only)", () => {
  it("a locked, due alert is skipped by a second run and escalated exactly once by the first", async () => {
    const a = postgres(localUrl!, { max: 1, prepare: false, onnotice: () => {} });
    const b = postgres(localUrl!, { max: 1, prepare: false, onnotice: () => {} });
    const site = await a<{ id: string }[]>`insert into public.sites (code, name, site_type, location)
      values ('SQLB12L', 'b12 local', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography) returning id`;
    const alert = await a<{ id: string }[]>`select private.raise_alert(null, 'sos', 'sos:-:' || gen_random_uuid()::text, 'critical', ${site[0]!.id}, null, null, false) as id`;
    try {
      let held: () => void;
      let letGo: () => void;
      const taken = new Promise<void>((r) => { held = r; });
      const release = new Promise<void>((r) => { letGo = r; });
      const session = a.begin(async (tx) => {
        await tx`select id from public.alerts where id = ${alert[0]!.id} for update`;
        held();
        await release;
      });
      await taken;
      const t0 = Date.now();
      const r = await b<{ v: { escalated: number } }[]>`select private.escalate_step(clock_timestamp() + interval '61 seconds') as v`;
      expect(Date.now() - t0).toBeLessThan(2_000);                   // skipped, not waited for
      const mid = await b<{ status: string }[]>`select status from public.alerts where id = ${alert[0]!.id}`;
      expect(mid[0]!.status).toBe("open");                           // the locked row was left alone
      expect(r[0]!.v.escalated).toBe(0);
      letGo!();
      await session;
      const first = await b<{ v: { escalated: number } }[]>`select private.escalate_step(clock_timestamp() + interval '61 seconds') as v`;
      const again = await b<{ v: { escalated: number } }[]>`select private.escalate_step(clock_timestamp() + interval '61 seconds') as v`;
      expect(first[0]!.v.escalated).toBe(1);
      expect(again[0]!.v.escalated).toBe(0);                         // once
    } finally {
      await a`delete from public.dispatches where alert_id = ${alert[0]!.id}`;
      await a`delete from public.events where alert_id = ${alert[0]!.id}`;
      await a`delete from public.alerts where id = ${alert[0]!.id}`;
      await a`delete from public.sites where id = ${site[0]!.id}`;
      await a.end(); await b.end();
    }
  }, 60_000);

  it("an operator ack racing an upgrade to critical cannot close the critical (007c/007d)", async () => {
    const a = postgres(localUrl!, { max: 1, prepare: false, onnotice: () => {} });
    const b = postgres(localUrl!, { max: 1, prepare: false, onnotice: () => {} });
    const site = await a<{ id: string }[]>`insert into public.sites (code, name, site_type, location)
      values ('SQLB12R', 'b12 race', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography) returning id`;
    const hk = `seatbelt:-:race-${Date.now()}`;
    const alert = await a<{ id: string }[]>`select private.raise_alert(null, 'seatbelt_off_moving', ${hk}, 'warning', ${site[0]!.id}, null, null, false) as id`;
    try {
      let upgraded: () => void;
      let commit: () => void;
      const ready = new Promise<void>((r) => { upgraded = r; });
      const go = new Promise<void>((r) => { commit = r; });
      const upgrade = a.begin(async (tx) => {                       // session A: the upgrade, uncommitted, row locked
        await tx`select private.raise_alert(null, 'seatbelt_off_moving', ${hk}, 'critical', ${site[0]!.id}, null, null, false)`;
        upgraded();
        await go;
      });
      await ready;
      // session B: an operator-role ack on the row A holds; it must wait, then see the critical and leave it open
      const ack = b`select (private.ack_alert(${alert[0]!.id}, 'app', null, 'operator')).status as status`;
      await new Promise((r) => setTimeout(r, 500));
      commit!();
      await upgrade;
      expect((await ack)[0]!.status).toBe("open");
      const row = await b<{ tier: string; status: string; n: number }[]>`select tier, status,
        (select count(*)::int from public.dispatches where alert_id = ${alert[0]!.id}) as n from public.alerts where id = ${alert[0]!.id}`;
      expect(row[0]).toMatchObject({ tier: "critical", status: "open" });
      expect(row[0]!.n).toBeGreaterThanOrEqual(1);                   // the critical's immediate dispatch was planned (dry run)
    } finally {
      await a`delete from public.dispatches where alert_id = ${alert[0]!.id}`;
      await a`delete from public.events where alert_id = ${alert[0]!.id}`;
      await a`delete from public.alerts where id = ${alert[0]!.id}`;
      await a`delete from public.sites where id = ${site[0]!.id}`;
      await a.end(); await b.end();
    }
  }, 60_000);
});
