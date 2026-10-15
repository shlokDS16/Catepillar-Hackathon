/**
 * B5 acceptance: "a checkpoint racing the drain is never self-inconsistent" and "ledger_verify waits
 * 10 s for the lock and then answers ledger_busy" (N3, R2-5). Both need two real sessions, which
 * `scripts/sqltest.ts` (one connection, one transaction) cannot provide.
 *
 * Nothing is committed: each session works inside a transaction that is always rolled back, so this is
 * safe against the shared project. Skipped when no connection is configured.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { poolerUrl } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";

class Rollback extends Error {}
const env = loadEnv();
const enabled = Boolean(env.CONNECTION_STRING && env.SUPABASE_DB_PASSWORD);
const open = () => postgres(poolerUrl(env), { max: 1, prepare: false, onnotice: () => {} });
const holder = enabled ? open() : null;      // session A: holds the drain's advisory lock
const rival = enabled ? open() : null;       // session B: tries to checkpoint / verify against it

/** Runs `body` in session B while session A sits inside `ledger_drain`, holding lock 4210001. */
async function whileDraining<T>(body: () => Promise<T>): Promise<T> {
  let lockTaken: () => void;
  let letGo: () => void;
  const taken = new Promise<void>((r) => { lockTaken = r; });
  const release = new Promise<void>((r) => { letGo = r; });

  const session = holder!.begin(async (tx) => {
    await tx`select private.ledger_drain(0)`;                 // takes pg_advisory_xact_lock(4210001)
    const held = await tx<{ n: number }[]>`select count(*)::int as n from pg_locks
      where locktype = 'advisory' and classid = 0 and objid = 4210001 and objsubid = 1 and pid = pg_backend_pid()`;
    expect(held[0]!.n).toBe(1);
    lockTaken();
    await release;
    throw new Rollback();                                     // nothing this session did is kept
  }).catch((e) => { if (!(e instanceof Rollback)) throw e; });

  await taken;
  try {
    return await body();
  } finally {
    letGo!();
    await session;
  }
}

describe.skipIf(!enabled)("ledger lock 4210001", () => {
  afterAll(async () => { await holder?.end(); await rival?.end(); });

  it("a checkpoint racing the drain waits rather than reading a half-written ledger", async () => {
    await whileDraining(async () => {
      await expect(rival!.begin(async (tx) => {
        await tx`set local lock_timeout = '1s'`;
        await tx`select private.ledger_checkpoint()`;         // must block on the lock, not compute
        throw new Rollback();
      })).rejects.toMatchObject({ code: "55P03" });            // lock_not_available, never a root over a
                                                               // partially drained range
    });
  }, 30_000);

  it("ledger_verify answers ledger_busy after its own 10 s lock timeout (R2-5)", async () => {
    const t0 = Date.now();
    await whileDraining(async () => {
      await expect(rival!.begin(async (tx) => {
        await tx`select public.ledger_verify(1, null)`;
        throw new Rollback();
      })).rejects.toMatchObject({ message: "ledger_busy" });
    });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(9_000);     // it waited, it did not fail fast
  }, 60_000);

  it("the lock is released with the transaction: verify succeeds once the drain is gone", async () => {
    const rows = await rival!.begin(async (tx) => {
      const out = await tx<{ v: Record<string, unknown> }[]>`select public.ledger_verify(1, null) as v`;
      throw Object.assign(new Rollback(), { out });
    }).catch((e: Rollback & { out?: { v: Record<string, unknown> }[] }) => e.out);
    expect(rows?.[0]?.v).toHaveProperty("head_seq");
  }, 30_000);
});
