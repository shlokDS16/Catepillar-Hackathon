/**
 * The browser (and offline) ledger verifier — R2-2, data-model §4.5, event-pipeline §5.
 *
 * Nothing here trusts the database to do arithmetic. Given the rows `public.ledger_export(first, last)`
 * returned, this recomputes every `entry_hash` from canonical v1 bytes, walks the chain, and rebuilds
 * the Merkle root and head hash with WebCrypto SHA-256. The fleet manager then compares the root and
 * head printed here with the `SPOTTER-LEDGER v1 …` line in her own Telegram chat. A redefined
 * `ledger_recompute()` — or any other server-side function — changes nothing in this file's answer.
 *
 * What it proves: the exported rows are internally consistent, and their root either does or does not
 * equal the externally witnessed one. What it does not prove: that the database served us all its rows
 * (a withheld row shows up as `seq_gap`), or that the web deploy running this code is honest — hence
 * `scripts/verify-ledger.ts`, which runs exactly this module offline.
 */
import { CANONICAL_V1_FIELDS, ZERO_HASH, canonicalBytes } from "./canonical";

/** One row of `public.ledger_export` (api-contracts §4 `LedgerExportRow`). Everything is text. */
export interface LedgerExportRow {
  seq: string;
  prev_hash: string;
  entry_hash: string;
  v: string;
  canonical_fields: Record<string, unknown>;
}

export type LedgerCheckReason = "seq_gap" | "link_broken" | "hash_mismatch" | "anchor_mismatch" | "witness_mismatch";

export interface LedgerVerifyResult {
  /** Every row recomputes to its stored hash and links to its predecessor. */
  ok: boolean;
  checked: number;
  first_bad_seq: number | null;
  reason: LedgerCheckReason | null;
  /** Human-readable detail for the first failure; never part of the proof. */
  detail: string | null;
  /** Recomputed, never read from the server: Merkle root over the range and the hash of its last row. */
  root_hex: string;
  head_hash: string;
  first_seq: number | null;
  last_seq: number | null;
}

const HEX64 = /^[0-9a-f]{64}$/;

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto SubtleCrypto is unavailable (a secure context is required)");
  return c.subtle;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // `data.slice()` hands SubtleCrypto a plain ArrayBuffer, which Node and every browser accept.
  const digest = await subtle().digest("SHA-256", data.slice().buffer);
  return new Uint8Array(digest);
}

/** `entry_hash` = lower-hex sha256 of the canonical v1 UTF-8 bytes (data-model §4.3 rule 6). */
export async function entryHash(entry: unknown): Promise<string> {
  return toHex(await sha256(canonicalBytes(entry)));
}

/**
 * Merkle root over the **raw 32-byte** hashes (data-model §4.5, re-check (c)):
 * leaf = sha256(0x00 ‖ hash), parent = sha256(0x01 ‖ left ‖ right), an odd node is carried up
 * unchanged, and an empty tree is sha256(''). Order is by `seq`.
 */
export async function merkleRoot(entryHashesHex: readonly string[]): Promise<string> {
  if (entryHashesHex.length === 0) return toHex(await sha256(new Uint8Array(0)));
  let level: Uint8Array[] = [];
  for (const h of entryHashesHex) level.push(await sha256(concat(Uint8Array.of(0x00), fromHex(h))));
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) next.push(level[i]!);                                   // odd node carried up
      else next.push(await sha256(concat(Uint8Array.of(0x01), level[i]!, level[i + 1]!)));
    }
    level = next;
  }
  return toHex(level[0]!);
}

function fail(
  checked: number, seq: number | null, reason: LedgerCheckReason, detail: string,
  rootHex: string, headHash: string, firstSeq: number | null, lastSeq: number | null,
): LedgerVerifyResult {
  return { ok: false, checked, first_bad_seq: seq, reason, detail, root_hex: rootHex, head_hash: headHash, first_seq: firstSeq, last_seq: lastSeq };
}

/**
 * Verify an exported range. `rows` need not be sorted; they are ordered by `seq` here.
 * The chain is anchored only when the range starts at `seq = 1` (then `prev_hash` must be 64 zeros);
 * for a later start the first row's `prev_hash` is taken as given, and everything after it is checked.
 */
export async function verifyLedger(rows: readonly LedgerExportRow[]): Promise<LedgerVerifyResult> {
  const sorted = [...rows].sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0));
  if (sorted.length === 0) {
    return { ok: true, checked: 0, first_bad_seq: null, reason: null, detail: null, root_hex: await merkleRoot([]), head_hash: ZERO_HASH, first_seq: null, last_seq: null };
  }
  const firstSeq = Number(sorted[0]!.seq);
  const lastSeq = Number(sorted[sorted.length - 1]!.seq);
  const hashes: string[] = [];
  let previous: string | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    const seq = Number(row.seq);
    const rootSoFar = await merkleRoot(hashes);
    const headSoFar = hashes[hashes.length - 1] ?? ZERO_HASH;

    if (i > 0 && seq !== Number(sorted[i - 1]!.seq) + 1) {
      return fail(i, seq, "seq_gap", `seq jumped from ${sorted[i - 1]!.seq} to ${row.seq}`, rootSoFar, headSoFar, firstSeq, lastSeq);
    }
    const keys = Object.keys(row.canonical_fields).sort();
    const want = [...CANONICAL_V1_FIELDS].sort();
    if (keys.length !== want.length || keys.some((k, n) => k !== want[n])) {
      return fail(i, seq, "hash_mismatch", `row ${row.seq} does not carry exactly the 20 canonical v1 fields`, rootSoFar, headSoFar, firstSeq, lastSeq);
    }
    for (const [column, value] of [["seq", row.seq], ["prev_hash", row.prev_hash], ["v", row.v]] as const) {
      if (row.canonical_fields[column] !== value) {
        return fail(i, seq, "hash_mismatch", `row ${row.seq}: column ${column} disagrees with the canonical field`, rootSoFar, headSoFar, firstSeq, lastSeq);
      }
    }
    if (!HEX64.test(row.entry_hash) || !HEX64.test(row.prev_hash)) {
      return fail(i, seq, "hash_mismatch", `row ${row.seq}: hashes are not 64 lower-case hex characters`, rootSoFar, headSoFar, firstSeq, lastSeq);
    }

    const expectedPrev = previous ?? (seq === 1 ? ZERO_HASH : row.prev_hash);
    if (row.prev_hash !== expectedPrev) {
      return fail(i, seq, "link_broken", `row ${row.seq}: prev_hash ${row.prev_hash} ≠ ${expectedPrev}`, rootSoFar, headSoFar, firstSeq, lastSeq);
    }

    let computed: string;
    try {
      computed = await entryHash(row.canonical_fields);
    } catch (err) {
      return fail(i, seq, "hash_mismatch", `row ${row.seq}: ${(err as Error).message}`, rootSoFar, headSoFar, firstSeq, lastSeq);
    }
    if (computed !== row.entry_hash) {
      return fail(i, seq, "hash_mismatch", `row ${row.seq}: recomputed ${computed} ≠ stored ${row.entry_hash}`, rootSoFar, headSoFar, firstSeq, lastSeq);
    }
    hashes.push(computed);
    previous = computed;
  }

  return {
    ok: true, checked: sorted.length, first_bad_seq: null, reason: null, detail: null,
    root_hex: await merkleRoot(hashes), head_hash: hashes[hashes.length - 1]!,
    first_seq: firstSeq, last_seq: lastSeq,
  };
}

/** The checkpoint line as it is sent to Telegram (data-model §4.5). Mirrors `private.ledger_checkpoint`. */
export const WITNESS_LINE_RE = /^SPOTTER-LEDGER v1 seq=(\d+)\.\.(\d+) n=(\d+) root=([0-9a-f]{64}) head=([0-9a-f]{64})/;

export interface WitnessLine {
  first_seq: number;
  last_seq: number;
  leaf_count: number;
  root_hex: string;
  head_hash: string;
}

/** Parse the line the fleet manager pastes from her own chat. Returns null when it is not a checkpoint. */
export function parseWitnessLine(text: string): WitnessLine | null {
  const m = WITNESS_LINE_RE.exec(text.trim());
  if (!m) return null;
  return { first_seq: Number(m[1]), last_seq: Number(m[2]), leaf_count: Number(m[3]), root_hex: m[4]!, head_hash: m[5]! };
}

/** Index of the first differing character, or -1 when the two strings are equal (UI highlights it). */
export function firstDifference(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

export interface WitnessComparison {
  /** The range, count, root and head the witness claims all match what we recomputed. */
  match: boolean;
  reason: LedgerCheckReason | null;
  detail: string | null;
  root_diff_at: number;
  head_diff_at: number;
}

/**
 * Compare a recomputed range with the witnessed line. This is the only check that can catch a
 * consistent rewrite (`demo_tamper(seq, 'rehash')`): the rows agree with themselves, the server's own
 * recompute agrees with them, and this comparison still fails.
 */
export function compareWitness(result: LedgerVerifyResult, witness: WitnessLine): WitnessComparison {
  if (!result.ok) {
    return { match: false, reason: result.reason, detail: result.detail, root_diff_at: -1, head_diff_at: -1 };
  }
  const rootDiff = firstDifference(result.root_hex, witness.root_hex);
  const headDiff = firstDifference(result.head_hash, witness.head_hash);
  if (result.first_seq !== witness.first_seq || result.last_seq !== witness.last_seq) {
    return {
      match: false, reason: "witness_mismatch",
      detail: `witness covers seq ${witness.first_seq}..${witness.last_seq}, the export covers ${result.first_seq}..${result.last_seq}`,
      root_diff_at: rootDiff, head_diff_at: headDiff,
    };
  }
  if (result.checked !== witness.leaf_count) {
    return {
      match: false, reason: "witness_mismatch",
      detail: `witness counts ${witness.leaf_count} entries, the export has ${result.checked}`,
      root_diff_at: rootDiff, head_diff_at: headDiff,
    };
  }
  if (rootDiff !== -1 || headDiff !== -1) {
    return {
      match: false, reason: "witness_mismatch",
      detail: rootDiff !== -1
        ? `recomputed root ${result.root_hex} ≠ witnessed ${witness.root_hex} (first difference at character ${rootDiff + 1})`
        : `recomputed head ${result.head_hash} ≠ witnessed ${witness.head_hash} (first difference at character ${headDiff + 1})`,
      root_diff_at: rootDiff, head_diff_at: headDiff,
    };
  }
  return { match: true, reason: null, detail: null, root_diff_at: -1, head_diff_at: -1 };
}
