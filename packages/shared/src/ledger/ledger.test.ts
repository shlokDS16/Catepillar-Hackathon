/**
 * B5 acceptance, TypeScript side (api-contracts §9): golden vectors 1-3 byte for byte, the restricted
 * domain enforced, and the reviewer's R2-2 repro — after a consistent rewrite the exported rows verify
 * against themselves and still disagree with the witnessed line.
 */
import { describe, expect, it } from "vitest";
import {
  CANONICAL_V1_FIELDS, CanonicalError, GOLDEN_VECTOR_1, GOLDEN_VECTOR_1_BYTES, GOLDEN_VECTOR_1_HASH,
  GOLDEN_VECTOR_2, GOLDEN_VECTOR_2_HASH, GOLDEN_VECTOR_3_ROOT, ZERO_HASH, canonicalize, canonicalBytes,
  compareWitness, entryHash, firstDifference, merkleRoot, parseWitnessLine, sha256, verifyLedger,
  type LedgerExportRow,
} from "./index";

const V1_CANONICAL =
  '{"context":{"pitch_deg":"17.4","ppe":["helmet","vest"],"speed_kmh":"6.2","zone":{"max_slope_deg":"15","name":"Bench 3"}},' +
  '"description":"सीटबेल्ट नहीं लगा, ढलान 17.4° \\"B3\\"","incident_type":"seatbelt_breach","lat":"21.146300","lon":"79.088200",' +
  '"machine_id":"33333333-3333-4333-8333-333333333333","non_punitive":false,"occurred_at":"2026-09-23T08:15:02.123456Z",' +
  '"operator_id":"22222222-2222-4222-8222-222222222222","prev_hash":"0000000000000000000000000000000000000000000000000000000000000000",' +
  '"recorded_at":"2026-09-23T08:15:03.000001Z","reported_by":null,"reporter_kind":"detector","run_id":null,"seq":"1","severity":"4",' +
  '"site_id":"11111111-1111-4111-8111-111111111111","source_event_id":"44444444-4444-4444-8444-444444444444","supersedes_seq":null,"v":"1"}';

/** An exported row as `public.ledger_export` returns it, built from a canonical entry. */
async function exportRow(fields: Record<string, unknown>): Promise<LedgerExportRow> {
  return {
    seq: fields.seq as string,
    prev_hash: fields.prev_hash as string,
    entry_hash: await entryHash(fields),
    v: fields.v as string,
    canonical_fields: fields,
  };
}

describe("canonical v1 (data-model §4.3)", () => {
  it("golden vector 1: byte-identical text, 797 UTF-8 bytes and the published hash", async () => {
    expect(canonicalize(GOLDEN_VECTOR_1)).toBe(V1_CANONICAL);
    expect(canonicalBytes(GOLDEN_VECTOR_1)).toHaveLength(GOLDEN_VECTOR_1_BYTES);
    await expect(entryHash(GOLDEN_VECTOR_1)).resolves.toBe(GOLDEN_VECTOR_1_HASH);
  });

  it("golden vector 2: the chain link", async () => {
    expect(GOLDEN_VECTOR_2.prev_hash).toBe(GOLDEN_VECTOR_1_HASH);
    await expect(entryHash(GOLDEN_VECTOR_2)).resolves.toBe(GOLDEN_VECTOR_2_HASH);
  });

  it("golden vector 3: Merkle over the raw 32-byte hashes", async () => {
    await expect(merkleRoot([GOLDEN_VECTOR_1_HASH, GOLDEN_VECTOR_2_HASH])).resolves.toBe(GOLDEN_VECTOR_3_ROOT);
  });

  it("the tree's edges: empty is sha256(''), one leaf is the leaf, an odd node is carried up", async () => {
    const empty = await merkleRoot([]);
    expect(empty).toBe(Array.from(await sha256(new Uint8Array(0))).map((b) => b.toString(16).padStart(2, "0")).join(""));
    const one = await merkleRoot([GOLDEN_VECTOR_1_HASH]);
    expect(one).not.toBe(GOLDEN_VECTOR_1_HASH);                       // the leaf is sha256(0x00 ‖ hash)
    const three = await merkleRoot([GOLDEN_VECTOR_1_HASH, GOLDEN_VECTOR_2_HASH, GOLDEN_VECTOR_1_HASH]);
    expect(three).not.toBe(GOLDEN_VECTOR_3_ROOT);
    expect(three).toHaveLength(64);
  });

  it("keys are sorted by byte value, never by JS iteration order", () => {
    // integer-like keys come first in JS object iteration; canonical v1 must ignore that
    expect(canonicalize({ b: "2", "1": "one", a: "1" })).toBe('{"1":"one","a":"1","b":"2"}');
    expect(canonicalize({ max_slope_deg: "15", name: "Bench 3" })).toBe('{"max_slope_deg":"15","name":"Bench 3"}');
  });

  it("escaping is only \" and \\; Devanagari and ° stay raw", () => {
    expect(canonicalize({ a: 'q"\\z°' })).toBe('{"a":"q\\"\\\\z°"}');
    expect(canonicalize({ a: "ढलान" })).toBe('{"a":"ढलान"}');
  });

  it("rejects JSON numbers, control characters and non-[a-z0-9_] keys", () => {
    expect(() => canonicalize({ speed_kmh: 6.2 })).toThrow(CanonicalError);
    expect(() => canonicalize({ a: "x\ty" })).toThrow(/control character/);
    expect(() => canonicalize({ Speed: "1" })).toThrow(/not ASCII/);
    expect(() => canonicalize({ a: undefined })).toThrow(CanonicalError);
  });

  it("the 20 canonical fields are the vectors' field set", () => {
    expect(Object.keys(GOLDEN_VECTOR_1).sort()).toEqual([...CANONICAL_V1_FIELDS].sort());
  });
});

describe("verifyLedger on exported rows (R2-2)", () => {
  it("reproduces vector 3's root and head from the exported rows", async () => {
    const rows = [await exportRow({ ...GOLDEN_VECTOR_1 }), await exportRow({ ...GOLDEN_VECTOR_2 })];
    const result = await verifyLedger(rows);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.root_hex).toBe(GOLDEN_VECTOR_3_ROOT);
    expect(result.head_hash).toBe(GOLDEN_VECTOR_2_HASH);
  });

  it("an edited row gives hash_mismatch at its seq", async () => {
    const rows = [await exportRow({ ...GOLDEN_VECTOR_1 }), await exportRow({ ...GOLDEN_VECTOR_2 })];
    rows[0]!.canonical_fields = { ...GOLDEN_VECTOR_1, description: "nothing happened" };
    const result = await verifyLedger(rows);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("hash_mismatch");
    expect(result.first_bad_seq).toBe(1);
  });

  it("a missing row gives seq_gap", async () => {
    const third = { ...GOLDEN_VECTOR_2, seq: "3", prev_hash: GOLDEN_VECTOR_2_HASH };
    const rows = [await exportRow({ ...GOLDEN_VECTOR_1 }), await exportRow(third)];
    const result = await verifyLedger(rows);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("seq_gap");
  });

  it("a genesis that does not start at 64 zeros gives link_broken", async () => {
    const rows = [await exportRow({ ...GOLDEN_VECTOR_1, prev_hash: "a".repeat(64) })];
    const result = await verifyLedger(rows);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("link_broken");
  });

  it("a column that disagrees with its canonical field is refused before hashing", async () => {
    const rows = [await exportRow({ ...GOLDEN_VECTOR_1 })];
    rows[0]!.seq = "7";
    const result = await verifyLedger(rows);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("hash_mismatch");
  });

  it("an empty export is vacuously consistent", async () => {
    const result = await verifyLedger([]);
    expect(result.ok).toBe(true);
    expect(result.head_hash).toBe(ZERO_HASH);
  });
});

describe("witness comparison (data-model §4.5, event-pipeline §5)", () => {
  const line = `SPOTTER-LEDGER v1 seq=1..2 n=2 root=${GOLDEN_VECTOR_3_ROOT} head=${GOLDEN_VECTOR_2_HASH} at=14:02 IST`;

  it("parses the checkpoint line the fleet manager pastes", () => {
    const w = parseWitnessLine(line)!;
    expect(w).toMatchObject({ first_seq: 1, last_seq: 2, leaf_count: 2, root_hex: GOLDEN_VECTOR_3_ROOT });
    expect(parseWitnessLine("hello")).toBeNull();
  });

  it("an untampered ledger matches the witness", async () => {
    const rows = [await exportRow({ ...GOLDEN_VECTOR_1 }), await exportRow({ ...GOLDEN_VECTOR_2 })];
    expect(compareWitness(await verifyLedger(rows), parseWitnessLine(line)!).match).toBe(true);
  });

  /**
   * The reviewer's R2-2 repro, end to end in the browser's own code: the database owner rewrites the
   * row AND every later hash AND `ledger_roots` AND `ledger_recompute` itself. The exported rows are
   * then perfectly self-consistent — `ok: true` — and the root still differs from the line Anita read
   * in Telegram at 14:02. Nothing the server computes is used here, so redefining it changes nothing.
   */
  it("after a consistent rewrite the rows verify and the witness still disagrees", async () => {
    const tampered1 = { ...GOLDEN_VECTOR_1, description: "सीटबेल्ट लगा था" };
    const h1 = await entryHash(tampered1);
    const tampered2 = { ...GOLDEN_VECTOR_2, prev_hash: h1 };
    const rows = [await exportRow(tampered1), await exportRow(tampered2)];

    const result = await verifyLedger(rows);
    expect(result.ok).toBe(true);                                      // the database agrees with itself
    expect(result.root_hex).not.toBe(GOLDEN_VECTOR_3_ROOT);

    const comparison = compareWitness(result, parseWitnessLine(line)!);
    expect(comparison.match).toBe(false);
    expect(comparison.reason).toBe("witness_mismatch");
    expect(comparison.root_diff_at).toBeGreaterThanOrEqual(0);         // the UI highlights this character
    expect(comparison.detail).toContain("first difference at character");
  });

  it("firstDifference finds the first differing character, or -1", () => {
    expect(firstDifference("abc", "abc")).toBe(-1);
    expect(firstDifference("abc", "abd")).toBe(2);
    expect(firstDifference("abc", "ab")).toBe(2);
  });
});
