/**
 * Offline ledger verifier (B5, R2-2). It runs the **same** code the browser runs —
 * `@cat/shared/ledger` — so a compromised web deploy is not the only way to check the chain, and so
 * the check can be repeated later from a file, with no database at all.
 *
 *   pnpm exec tsx scripts/verify-ledger.ts --from 1 --to 214
 *   pnpm exec tsx scripts/verify-ledger.ts --from 1 --to 214 --save ledger-1-214.csv
 *   pnpm exec tsx scripts/verify-ledger.ts --file ledger-1-214.csv \
 *        --witness "SPOTTER-LEDGER v1 seq=1..214 n=214 root=… head=… at=14:02 IST"
 *
 * `--witness` is the line the fleet manager read in her own Telegram chat. Nothing the database says
 * about the root is trusted: it is recomputed here from the exported rows. Exit code 0 only when the
 * rows are self-consistent and, when a witness was given, when the recomputed root and head equal it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  compareWitness, parseWitnessLine, verifyLedger, type LedgerExportRow,
} from "../packages/shared/src/ledger/index.ts";
import { connect } from "./lib/db.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Minimal RFC 4180 reader: quoted fields may hold commas, newlines and doubled quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function toCsv(rows: readonly LedgerExportRow[]): string {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = "seq,prev_hash,entry_hash,v,canonical_fields\n";
  return head + rows.map((r) =>
    [r.seq, r.prev_hash, r.entry_hash, r.v, JSON.stringify(r.canonical_fields)].map(cell).join(",")).join("\n") + "\n";
}

function fromFile(path: string): LedgerExportRow[] {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".json")) return JSON.parse(text) as LedgerExportRow[];
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error(`${path} is empty`);
  const at = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`${path} has no "${name}" column`);
    return i;
  };
  const [cSeq, cPrev, cEntry, cV, cFields] = ["seq", "prev_hash", "entry_hash", "v", "canonical_fields"].map(at);
  return body.map((r) => ({
    seq: r[cSeq!]!, prev_hash: r[cPrev!]!, entry_hash: r[cEntry!]!, v: r[cV!]!,
    canonical_fields: JSON.parse(r[cFields!]!) as Record<string, unknown>,
  }));
}

async function fromDatabase(first: number, last: number): Promise<LedgerExportRow[]> {
  const sql = connect({ quiet: true });
  try {
    const rows = await sql<LedgerExportRow[]>`select seq, prev_hash, entry_hash, v, canonical_fields
      from public.ledger_export(${first}::bigint, ${last}::bigint)`;
    return rows.map((r) => ({ ...r }));
  } finally {
    await sql.end();
  }
}

const file = arg("file");
const from = Number(arg("from") ?? 1);
const to = Number(arg("to") ?? 0);
if (!file && !(Number.isInteger(from) && Number.isInteger(to) && to >= from && from >= 1)) {
  console.error("usage: verify-ledger.ts (--file rows.csv|rows.json | --from N --to M) [--witness \"SPOTTER-LEDGER …\"] [--save out.csv]");
  process.exit(2);
}

const rows = file ? fromFile(file) : await fromDatabase(from, to);
const save = arg("save");
if (save) {
  writeFileSync(save, save.endsWith(".json") ? JSON.stringify(rows, null, 2) : toCsv(rows), "utf8");
  console.log(`saved  ${rows.length} rows → ${save}`);
}

const result = await verifyLedger(rows);
console.log(`source      ${file ?? `ledger_export(${from}, ${to})`}`);
console.log(`rows        ${result.checked}  (seq ${result.first_seq ?? "-"}..${result.last_seq ?? "-"})`);
console.log(`chain       ${result.ok ? "consistent" : `BROKEN at seq ${result.first_bad_seq} (${result.reason})`}`);
if (!result.ok) console.log(`            ${result.detail}`);
console.log(`root        ${result.root_hex}`);
console.log(`head        ${result.head_hash}`);
console.log("\nThis is internal consistency only. The proof is the comparison below, against a line");
console.log("read from the fleet manager's own Telegram chat — never from the database.");

const witnessText = arg("witness");
if (!witnessText) {
  console.log("\nwitness     (none given; pass --witness \"SPOTTER-LEDGER v1 …\" to compare)");
  process.exitCode = result.ok ? 0 : 1;
} else {
  const witness = parseWitnessLine(witnessText);
  if (!witness) {
    console.log("\nwitness     NOT A CHECKPOINT LINE");
    process.exitCode = 2;
  } else {
    const comparison = compareWitness(result, witness);
    console.log(`\nwitness     seq ${witness.first_seq}..${witness.last_seq} n=${witness.leaf_count}`);
    console.log(`            root ${witness.root_hex}`);
    console.log(`            head ${witness.head_hash}`);
    console.log(`verdict     ${comparison.match ? "MATCH — the ledger is the one that was witnessed" : "MISMATCH"}`);
    if (!comparison.match) {
      console.log(`            ${comparison.detail}`);
      if (comparison.root_diff_at >= 0) {
        console.log(`            recomputed ${result.root_hex}`);
        console.log(`            witnessed  ${witness.root_hex}`);
        console.log(`                       ${" ".repeat(comparison.root_diff_at)}^ first difference`);
      }
    }
    process.exitCode = comparison.match ? 0 : 1;
  }
}
