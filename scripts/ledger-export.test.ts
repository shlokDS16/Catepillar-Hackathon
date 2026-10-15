/**
 * B5 acceptance: SQL and TypeScript agree byte for byte on a **live** row, not only on the golden
 * vectors. An event is emitted, drained into the ledger and exported, and the browser verifier
 * (`@cat/shared/ledger`) recomputes its `entry_hash`, the chain and the Merkle root from the exported
 * canonical fields alone. Everything happens inside a transaction that is always rolled back, so this
 * is safe against the shared project. Skipped when no connection is configured.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { canonicalize, entryHash, merkleRoot, verifyLedger, type LedgerExportRow } from "../packages/shared/src/ledger/index.ts";
import { poolerUrl } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";

class Rollback extends Error { constructor(readonly payload: unknown) { super("rollback"); } }
const env = loadEnv();
const enabled = Boolean(env.CONNECTION_STRING && env.SUPABASE_DB_PASSWORD);
const sql = enabled ? postgres(poolerUrl(env), { max: 1, prepare: false, onnotice: () => {} }) : null;

interface Harvest { rows: LedgerExportRow[]; written: string; serverRoot: string }

/** Writes one ledger entry from an event and hands back what `ledger_export` says about the range. */
async function harvest(): Promise<Harvest> {
  return await sql!.begin(async (tx) => {
    const [site] = await tx<{ id: string }[]>`
      insert into public.sites (code, name, site_type, location)
      values ('TSPARI', 'canonical parity', 'quarry',
              extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography)
      returning id`;
    const key = `inc:parity:${Date.now()}`;
    // Devanagari, a quote, a backslash and decimals: every canonical v1 formatting rule at once.
    const payload = tx.json({ incident_type: "near_miss", severity: 2,
      description: 'ढलान 17.4° "B3" \\ ठीक', non_punitive: true, lat: 21.1463, lon: 79.0882 });
    await tx`select private.emit_event('incident.reported', ${payload}::jsonb, ${key}, 'user', ${site!.id}::uuid)`;
    await tx`select private.ledger_drain()`;
    const [written] = await tx<{ entry_hash: string }[]>`
      select entry_hash from public.incidents where idempotency_key = ${"ledger:" + key}`;
    const [range] = await tx<{ first: string; last: string }[]>`
      select min(seq)::text as first, max(seq)::text as last from public.incidents`;
    const rows = await tx<LedgerExportRow[]>`
      select seq, prev_hash, entry_hash, v, canonical_fields
      from public.ledger_export(${range!.first}::bigint, ${range!.last}::bigint)`;
    const [server] = await tx<{ root_hex: string }[]>`
      select (public.ledger_recompute(${range!.first}::bigint, ${range!.last}::bigint)) ->> 'root_hex' as root_hex`;
    throw new Rollback({ rows: rows.map((r) => ({ ...r })), written: written!.entry_hash, serverRoot: server!.root_hex });
  }).catch((e: unknown) => {
    if (e instanceof Rollback) return e.payload as Harvest;
    throw e;
  });
}

describe.skipIf(!enabled)("ledger_export ↔ @cat/shared/ledger", () => {
  afterAll(async () => { await sql?.end(); });

  it("the TS verifier reproduces every hash, the chain and the root of a live range", async () => {
    const { rows, written, serverRoot } = await harvest();
    expect(rows.length).toBeGreaterThan(0);

    const result = await verifyLedger(rows);
    expect(result.detail).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(rows.length);

    // the row just written: SQL's entry_hash is reproduced from the exported canonical fields alone
    const mine = rows.find((r) => r.entry_hash === written)!;
    expect(mine).toBeDefined();
    await expect(entryHash(mine.canonical_fields)).resolves.toBe(written);

    // the canonical text is well formed and carries the formatting rules of data-model §4.3
    const canonical = canonicalize(mine.canonical_fields);
    expect(canonical).toContain('"description":"ढलान 17.4° \\"B3\\" \\\\ ठीक"');
    expect(canonical).toContain('"lat":"21.146300"');                       // numeric(9,6)::text, 6 decimals
    expect(canonical).toMatch(/"occurred_at":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z"/);
    expect(canonical).toContain('"v":"1"');

    // and the server's convenience recompute happens to agree — which the browser never relies on
    await expect(merkleRoot(rows.map((r) => r.entry_hash))).resolves.toBe(result.root_hex);
    expect(result.root_hex).toBe(serverRoot);
  }, 60_000);
});
