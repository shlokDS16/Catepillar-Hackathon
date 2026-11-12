import {
  compareWitness, firstDifference, parseWitnessLine, verifyLedger,
  type LedgerExportRow, type LedgerVerifyResult, type WitnessComparison, type WitnessLine,
} from "@cat/shared/ledger";
import type { DataPort } from "@/data/port";
import { RpcError } from "@/data/port";

/**
 * F15 helpers for /fm/ledger (S9): the paste parser, the range check, the first-difference locator,
 * the ledger_busy retry and the compare flow. Pure and port-driven so every branch is unit-tested.
 *
 * The published side (root, head, n) comes ONLY from the pasted line; it never reads the database.
 * The recomputed side is computed here in the browser by `verifyLedger` from exported rows.
 * `ledger_recompute` is a secondary "server says" line and never decides the verdict.
 */

export type PasteState =
  | { state: "empty" }
  | { state: "ok"; witness: WitnessLine }
  | { state: "malformed" };

/** Telegram messages can carry text around the checkpoint, so each line is tried in turn. */
export function parsePaste(text: string): PasteState {
  if (text.trim() === "") return { state: "empty" };
  for (const line of text.split(/\r?\n/)) {
    const w = parseWitnessLine(line);
    // The shared regex has no end anchor: a head longer than 64 hex characters must not be cut to fit.
    if (w && /head=[0-9a-f]{64}(\s|$)/.test(line.trim()) &&w.first_seq >= 1 && w.first_seq <= w.last_seq) return { state: "ok", witness: w };
  }
  return { state: "malformed" };
}

export type RangeField = "from" | "to" | "order" | "range";
export type RangeCheck = { ok: true; first: number; last: number } | { ok: false; field: Exclude<RangeField, "range"> };

const INT = /^\d{1,9}$/;

/** `validation` per interaction-map A23: not a positive integer, or first > last. */
export function checkRange(from: string, to: string): RangeCheck {
  const f = from.trim();
  const t = to.trim();
  if (!INT.test(f) || Number(f) < 1) return { ok: false, field: "from" };
  if (!INT.test(t) || Number(t) < 1) return { ok: false, field: "to" };
  if (Number(f) > Number(t)) return { ok: false, field: "order" };
  return { ok: true, first: Number(f), last: Number(t) };
}

export function groupsOf4(hex: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < hex.length; i += 4) out.push(hex.slice(i, i + 4));
  return out;
}

export interface DiffAt {
  /** Index into the 64-character string. */
  index: number;
  group: number;
  char: number;
}

/** Where the boxed group and the ▲ go; null when the two strings are equal. */
export function diffAt(a: string, b: string): DiffAt | null {
  const index = firstDifference(a, b);
  if (index === -1) return null;
  return { index, group: Math.floor(index / 4), char: index % 4 };
}

export const BUSY_RETRY_MS = 2000;

export class LedgerBusyError extends Error {
  constructor() {
    super("ledger_busy");
    this.name = "LedgerBusyError";
  }
}

const isBusy = (e: unknown) => e instanceof RpcError && e.code === "ledger_busy";

/** ledger_busy: retry once after 2 s, then give up with LedgerBusyError (handoff R2-5). Other errors pass through. */
export async function withBusyRetry<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isBusy(e)) throw e;
  }
  await sleep(BUSY_RETRY_MS);
  try {
    return await fn();
  } catch (e) {
    if (isBusy(e)) throw new LedgerBusyError();
    throw e;
  }
}

/** Sealed near-miss rows (backend privacy): the export marks them `sealed: true` and withholds content. */
export type ExportRow = LedgerExportRow & { sealed?: boolean };

/**
 * Every near-miss is treated as sealed in the UI, whether or not the backend set `sealed`: keyed on
 * `non_punitive` and the near_miss type too, so a row that arrives with its content still never shows it.
 */
export const isSealed = (row: ExportRow): boolean =>
  row.sealed === true || row.canonical_fields?.sealed === true || row.canonical_fields?.non_punitive === true || row.canonical_fields?.incident_type === "near_miss";
export const countSealed = (rows: readonly ExportRow[]): number => rows.filter(isSealed).length;

export type CompareOutcome =
  | { kind: "validation"; field: RangeField }
  | { kind: "busy" }
  | { kind: "network" }
  | {
      kind: "done";
      first: number;
      last: number;
      /** Recomputed in this browser from the exported rows. */
      local: LedgerVerifyResult;
      /** Sealed rows are chain-linked only; they are never counted as verified content. */
      sealed: number;
      /** null when no line was pasted: "Paste the Telegram line to compare". */
      witness: WitnessLine | null;
      comparison: WitnessComparison | null;
      /** The server's own recompute, secondary; null when unavailable. */
      server: { root_hex: string; head_hash: string; leaf_count: number } | null;
    };

export async function runCompare(
  port: Pick<DataPort, "ledgerExport" | "ledgerRecompute">,
  input: { from: string; to: string; paste: PasteState },
  sleep?: (ms: number) => Promise<void>,
): Promise<CompareOutcome> {
  const range = checkRange(input.from, input.to);
  if (!range.ok) return { kind: "validation", field: range.field };
  try {
    const rows = (await withBusyRetry(
      () => port.ledgerExport({ p_first_seq: range.first, p_last_seq: range.last }),
      sleep,
    )) as ExportRow[];
    const local = await verifyLedger(rows);
    const witness = input.paste.state === "ok" ? input.paste.witness : null;
    const comparison = witness ? compareWitness(local, witness) : null;
    let server: { root_hex: string; head_hash: string; leaf_count: number } | null = null;
    try {
      const r = await port.ledgerRecompute({ p_first_seq: range.first, p_last_seq: range.last });
      server = { root_hex: r.root_hex, head_hash: r.head_hash, leaf_count: r.leaf_count };
    } catch {
      server = null; // secondary line only; the verdict never depends on it
    }
    return { kind: "done", first: range.first, last: range.last, local, sealed: local.sealed, witness, comparison, server };
  } catch (e) {
    if (e instanceof LedgerBusyError) return { kind: "busy" };
    if (e instanceof RpcError && e.code === "validation") return { kind: "validation", field: "range" };
    return { kind: "network" };
  }
}

/** ledger_export refuses ranges over 5000 rows. */
export const EXPORT_PAGE = 5000;

export class ExportCancelled extends Error {
  constructor() {
    super("export_cancelled");
    this.name = "ExportCancelled";
  }
}

/** Export 1..head in pages of at most EXPORT_PAGE rows and join them. Each page retries once on ledger_busy. */
export async function exportAll(
  port: Pick<DataPort, "ledgerExport">,
  head: number,
  sleep?: (ms: number) => Promise<void>,
  /** Checked before each page; false stops the export (Stop, unmount, a newer run) with ExportCancelled. */
  isCurrent: () => boolean = () => true,
): Promise<ExportRow[]> {
  const all: ExportRow[] = [];
  for (let first = 1; first <= head; first += EXPORT_PAGE) {
    if (!isCurrent()) throw new ExportCancelled();
    const last = Math.min(head, first + EXPORT_PAGE - 1);
    const page = (await withBusyRetry(() => port.ledgerExport({ p_first_seq: first, p_last_seq: last }), sleep)) as ExportRow[];
    all.push(...page);
  }
  return all;
}

export type InternalJudgement = "clean" | "partial" | "failed" | "unchecked";

/**
 * The Internal check verdict. A tick ("clean") needs this browser's own full recompute: status `verified`,
 * covering exactly seq 1..head, with the same count and head hash the server reports. A short, empty,
 * late-starting or head-mismatched export is `failed`, never a tick. `unchecked`: no local recompute.
 */
export function judgeInternal(
  out: { ok: boolean; head_seq: number; head_hash: string },
  local: LedgerVerifyResult | null,
): InternalJudgement {
  if (!out.ok) return "failed";
  if (local === null) return "unchecked";
  if (local.status === "failed") return "failed";
  const covers =
    out.head_seq === 0
      ? local.checked === 0
      : local.first_seq === 1 && local.last_seq === out.head_seq && local.checked === out.head_seq && local.head_hash === out.head_hash;
  if (!covers) return "failed";
  return local.status === "verified" ? "clean" : "partial";
}

/** Rows the table asks for: the newest N, or a window around the broken row so #N is on screen. */
export function tableWindow(head: number, badSeq: number | null, size = 25): { first: number; last: number } {
  if (badSeq === null || badSeq > head || badSeq < 1) return { first: Math.max(1, head - size + 1), last: head };
  const first = Math.max(1, Math.min(badSeq - Math.floor(size / 2), head - size + 1));
  return { first, last: Math.min(head, first + size - 1) };
}

/** Rows whose content this browser actually checked. Sealed rows are chain-linked only, never "verified". */
export const verifiedCount = (checked: number, sealed: number): number => Math.max(0, checked - sealed);

/**
 * A clean full match: every row recomputed in the browser (status "verified", no sealed rows) AND the witness
 * matched. The only state that gets a tick. A match over a range with sealed rows is `isPartialMatch`.
 */
export function isCleanMatch(out: Extract<CompareOutcome, { kind: "done" }>): boolean {
  return out.local.status === "verified" && out.comparison?.match === true && out.comparison.partial === false;
}

/** Chain and witness agree, but sealed rows were not checked byte for byte: never a tick. */
export function isPartialMatch(out: Extract<CompareOutcome, { kind: "done" }>): boolean {
  return out.local.status === "verified_with_sealed" && out.comparison?.match === true;
}

/** Entries-table cells. Sealed and near-miss rows expose no operator, machine, place or text. */
export interface RowView {
  seq: string;
  sealed: boolean;
  time: string | null;
  type: string | null;
  operator: string | null;
  machine: string | null;
  hashPrefix: string;
}

export function rowView(row: ExportRow): RowView {
  const hashPrefix = row.entry_hash.slice(0, 8);
  if (isSealed(row)) return { seq: row.seq, sealed: true, time: null, type: null, operator: null, machine: null, hashPrefix };
  const f = row.canonical_fields;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const at = str(f.occurred_at);
  return {
    seq: row.seq,
    sealed: false,
    time: at ? at.slice(0, 16).replace("T", " ") : null,
    type: str(f.incident_type),
    operator: str(f.operator_id)?.slice(0, 8) ?? null,
    machine: str(f.machine_id)?.slice(0, 8) ?? null,
    hashPrefix,
  };
}
