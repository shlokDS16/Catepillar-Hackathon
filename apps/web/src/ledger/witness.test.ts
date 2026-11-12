import { describe, expect, it, vi } from "vitest";
import { WITNESS_LINE } from "@cat/shared";
import { verifyLedger } from "@cat/shared/ledger";
import { RpcError } from "@/data/port";
import { BREAK_SEQ, LEDGER_ROWS, SEALED_SEQ, ledgerRows, ledgerVerdict, witnessLineFor, type LedgerScenario } from "@/ledger/fixtures";
import {
  BUSY_RETRY_MS, ExportCancelled, LedgerBusyError, checkRange, countSealed, diffAt, groupsOf4, exportAll, isCleanMatch, isPartialMatch, isSealed, judgeInternal, parsePaste, rowView,
  runCompare, tableWindow, verifiedCount, withBusyRetry,
} from "@/ledger/witness";

const H = "ab".repeat(32);
const LINE = `SPOTTER-LEDGER v1 seq=1..214 n=214 root=${H} head=${"cd".repeat(32)}`;

function portFor(scenario: LedgerScenario, opts: { busy?: number; recomputeFails?: boolean } = {}) {
  let busy = opts.busy ?? 0;
  return {
    ledgerExport: async (i: { p_first_seq: number; p_last_seq: number }) => {
      if (busy > 0) {
        busy--;
        throw new RpcError("ledger_busy");
      }
      return (await ledgerRows(scenario)).slice(i.p_first_seq - 1, i.p_last_seq);
    },
    ledgerRecompute: async () => {
      if (opts.recomputeFails) throw new RpcError("boom");
      return { first_seq: 1, last_seq: 214, leaf_count: 214, root_hex: H, head_hash: H };
    },
  };
}

describe("parsePaste (WITNESS_LINE)", () => {
  it("parses a valid line, with surrounding message text", () => {
    expect(WITNESS_LINE.test(LINE)).toBe(true);
    const p = parsePaste(`Checkpoint:\n${LINE}\nsent 08:00`);
    expect(p.state).toBe("ok");
    if (p.state === "ok") expect(p.witness).toMatchObject({ first_seq: 1, last_seq: 214, leaf_count: 214, root_hex: H });
  });
  it("empty and malformed", () => {
    expect(parsePaste("  \n")).toEqual({ state: "empty" });
    expect(parsePaste("SPOTTER-LEDGER v1 seq=1..2 n=2 root=zz head=yy").state).toBe("malformed");
    expect(parsePaste("hello").state).toBe("malformed");
  });
  it("a wrong range (first after last, or zero) is malformed", () => {
    expect(parsePaste(`SPOTTER-LEDGER v1 seq=9..3 n=1 root=${H} head=${H}`).state).toBe("malformed");
    expect(parsePaste(`SPOTTER-LEDGER v1 seq=0..3 n=4 root=${H} head=${H}`).state).toBe("malformed");
  });
});

describe("checkRange", () => {
  it("accepts a sane range and rejects the rest with the field", () => {
    expect(checkRange("1", "214")).toEqual({ ok: true, first: 1, last: 214 });
    expect(checkRange("", "5")).toEqual({ ok: false, field: "from" });
    expect(checkRange("1", "x")).toEqual({ ok: false, field: "to" });
    expect(checkRange("0", "5")).toEqual({ ok: false, field: "from" });
    expect(checkRange("9", "3")).toEqual({ ok: false, field: "order" });
  });
});

describe("first difference", () => {
  it("equal strings have none", () => expect(diffAt(H, H)).toBeNull());
  it("locates index, group and character", () => {
    const b = H.slice(0, 9) + (H[9] === "a" ? "b" : "a") + H.slice(10);
    expect(diffAt(H, b)).toEqual({ index: 9, group: 2, char: 1 });
    expect(diffAt("a".repeat(64), "b" + "a".repeat(63))).toEqual({ index: 0, group: 0, char: 0 });
  });
  it("groups a hash into 16 of 4", () => {
    const g = groupsOf4(H);
    expect(g).toHaveLength(16);
    expect(g.every((x) => x.length === 4)).toBe(true);
  });
});

describe("withBusyRetry", () => {
  it("retries once after 2 s then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const r = await withBusyRetry(async () => {
      if (n++ === 0) throw new RpcError("ledger_busy");
      return "ok";
    }, sleep);
    expect(r).toBe("ok");
    expect(sleep).toHaveBeenCalledExactlyOnceWith(BUSY_RETRY_MS);
    expect(BUSY_RETRY_MS).toBe(2000);
  });
  it("gives up after the single retry", async () => {
    const fn = vi.fn(async () => {
      throw new RpcError("ledger_busy");
    });
    await expect(withBusyRetry(fn, async () => {})).rejects.toBeInstanceOf(LedgerBusyError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("does not retry other errors", async () => {
    const fn = vi.fn(async () => {
      throw new RpcError("validation");
    });
    await expect(withBusyRetry(fn, async () => {})).rejects.toMatchObject({ code: "validation" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("runCompare on the fixtures", () => {
  const sleep = async () => {};
  it("match: the published line equals the browser recompute; the sealed row is counted, not verified", async () => {
    const line = await witnessLineFor();
    const out = await runCompare(portFor("intact"), { from: "1", to: "214", paste: parsePaste(line) }, sleep);
    expect(out.kind).toBe("done");
    if (out.kind !== "done") return;
    expect(out.comparison?.match).toBe(true);
    expect(out.local.checked).toBe(LEDGER_ROWS);
    expect(out.sealed).toBe(1);
    expect(out.server).not.toBeNull();
  });
  it("mismatch: a consistent rewrite passes the chain but not the witness", async () => {
    const line = await witnessLineFor();
    const out = await runCompare(portFor("rewrite"), { from: "1", to: "214", paste: parsePaste(line) }, sleep);
    if (out.kind !== "done") throw new Error("expected done");
    expect(out.local.status).not.toBe("failed");
    expect(out.comparison?.match).toBe(false);
    expect(out.comparison?.root_diff_at).toBeGreaterThanOrEqual(0);
  });
  it("chain break: reports the broken sequence number", async () => {
    const line = await witnessLineFor();
    const out = await runCompare(portFor("chain_break"), { from: "1", to: "214", paste: parsePaste(line) }, sleep);
    if (out.kind !== "done") throw new Error("expected done");
    expect(out.local.ok).toBe(false);
    expect(out.local.first_bad_seq).toBe(BREAK_SEQ);
    expect(out.comparison?.match).toBe(false);
    const v = await ledgerVerdict("chain_break");
    expect(v.ok).toBe(false);
    expect(v.first_bad_seq).toBe(BREAK_SEQ);
  });
  it("no pasted line: recomputed values only", async () => {
    const out = await runCompare(portFor("intact"), { from: "1", to: "10", paste: { state: "empty" } }, sleep);
    if (out.kind !== "done") throw new Error("expected done");
    expect(out.comparison).toBeNull();
    expect(out.witness).toBeNull();
  });
  it("wrong typed range does not match the line", async () => {
    const line = await witnessLineFor();
    const out = await runCompare(portFor("intact"), { from: "1", to: "100", paste: parsePaste(line) }, sleep);
    if (out.kind !== "done") throw new Error("expected done");
    expect(out.comparison?.match).toBe(false);
  });
  it("validation, busy retry, busy give-up, and a failing server line", async () => {
    const paste = { state: "empty" } as const;
    expect(await runCompare(portFor("intact"), { from: "9", to: "3", paste }, sleep)).toEqual({ kind: "validation", field: "order" });
    expect((await runCompare(portFor("intact", { busy: 1 }), { from: "1", to: "5", paste }, sleep)).kind).toBe("done");
    expect((await runCompare(portFor("intact", { busy: 2 }), { from: "1", to: "5", paste }, sleep)).kind).toBe("busy");
    const noServer = await runCompare(portFor("intact", { recomputeFails: true }), { from: "1", to: "5", paste }, sleep);
    expect(noServer.kind === "done" && noServer.server).toBeNull();
  });
});

describe("rowView privacy", () => {
  it("a sealed or near-miss row never exposes operator, machine, place or text", async () => {
    const rows = await ledgerRows("intact");
    const sealed = rowView(rows[SEALED_SEQ - 1]!);
    expect(sealed).toEqual({ seq: String(SEALED_SEQ), sealed: true, time: null, type: null, operator: null, machine: null, hashPrefix: sealed.hashPrefix });
    // HIGH review fix: a non_punitive row WITHOUT the sealed flag is still sealed in the UI.
    const nmRow = { ...rows[0]!, canonical_fields: { ...rows[0]!.canonical_fields, non_punitive: true, operator_id: "22222222-2222-4222-8222-222222222222" } };
    expect(isSealed(nmRow)).toBe(true);
    expect(rowView(nmRow)).toEqual({ seq: "1", sealed: true, time: null, type: null, operator: null, machine: null, hashPrefix: nmRow.entry_hash.slice(0, 8) });
    expect(countSealed([nmRow, rows[1]!])).toBe(1);
    const typed = { ...rows[0]!, canonical_fields: { ...rows[0]!.canonical_fields, incident_type: "near_miss" } };
    expect(rowView(typed).sealed).toBe(true);
    expect(rowView(rows[0]!).operator).toBe("22222221");
  });
});

describe("judgeInternal and paging (short review)", () => {
  it("a tick needs a full local recompute covering exactly 1..head with the same head hash", async () => {
    const rows = await ledgerRows("intact");
    const nonSealed = rows.filter((r) => r.canonical_fields.sealed !== true);
    const full = await verifyLedger(rows);
    const head = { ok: true, head_seq: LEDGER_ROWS, head_hash: rows[rows.length - 1]!.entry_hash };
    expect(judgeInternal(head, full)).toBe("partial"); // sealed row present: never a tick
    expect(judgeInternal(head, null)).toBe("unchecked");
    expect(judgeInternal({ ...head, ok: false }, full)).toBe("failed");
    // empty export
    expect(judgeInternal(head, await verifyLedger([]))).toBe("failed");
    // truncated export (1..100 of 214)
    expect(judgeInternal(head, await verifyLedger(rows.slice(0, 100)))).toBe("failed");
    // export starting at seq > 1
    expect(judgeInternal(head, await verifyLedger(rows.slice(10)))).toBe("failed");
    // mismatched head hash
    expect(judgeInternal({ ...head, head_hash: "f".repeat(64) }, full)).toBe("failed");
    // a clean ledger (no sealed row): first 6 rows
    const six = rows.slice(0, 6);
    const r6 = await verifyLedger(six);
    expect(r6.status).toBe("verified");
    expect(judgeInternal({ ok: true, head_seq: 6, head_hash: six[5]!.entry_hash }, r6)).toBe("clean");
    expect(nonSealed.length).toBe(LEDGER_ROWS - 1);
  });
  it("exports in pages of at most 5000 and joins them", async () => {
    const calls: Array<[number, number]> = [];
    const port = {
      ledgerExport: async (i: { p_first_seq: number; p_last_seq: number }) => {
        calls.push([i.p_first_seq, i.p_last_seq]);
        return Array.from({ length: i.p_last_seq - i.p_first_seq + 1 }, (_, k) => ({ seq: String(i.p_first_seq + k) })) as never;
      },
    };
    const all = await exportAll(port, 12000);
    expect(calls).toEqual([[1, 5000], [5001, 10000], [10001, 12000]]);
    expect(all).toHaveLength(12000);
  });
});

describe("review fixes", () => {
  it("tableWindow shows the broken row, else the newest rows", () => {
    expect(tableWindow(214, null)).toEqual({ first: 190, last: 214 });
    const w = tableWindow(214, 187);
    expect(w.first).toBeLessThanOrEqual(187);
    expect(w.last).toBeGreaterThanOrEqual(187);
    expect(w.last - w.first + 1).toBe(25);
    expect(tableWindow(10, 3)).toEqual({ first: 1, last: 10 });
  });
  it("a head longer than 64 hex characters is rejected", () => {
    expect(parsePaste(`SPOTTER-LEDGER v1 seq=1..2 n=2 root=${H} head=${"cd".repeat(32)}e`).state).toBe("malformed");
    expect(parsePaste(`${LINE} `).state).toBe("ok");
  });
  it("a range outside the ledger is a validation outcome, not a network error", async () => {
    const out = await runCompare(portFor("intact"), { from: "1", to: "999", paste: { state: "empty" } }, async () => {});
    expect(out.kind).toBe("done"); // portFor slices silently; the fixture adapter raises validation, covered next
    const failing = { ...portFor("intact"), ledgerExport: async () => { throw new RpcError("validation"); } };
    expect(await runCompare(failing, { from: "500", to: "600", paste: { state: "empty" } }, async () => {})).toEqual({ kind: "validation", field: "range" });
    const down = { ...portFor("intact"), ledgerExport: async () => { throw new Error("offline"); } };
    expect((await runCompare(down, { from: "1", to: "5", paste: { state: "empty" } }, async () => {})).kind).toBe("network");
  });
  it("sealed rows are not counted as verified, and only a clean full match reads as verified", async () => {
    expect(verifiedCount(214, 1)).toBe(213);
    const line = await witnessLineFor();
    const good = await runCompare(portFor("intact"), { from: "1", to: "214", paste: parsePaste(line) }, async () => {});
    const bad = await runCompare(portFor("rewrite"), { from: "1", to: "214", paste: parsePaste(line) }, async () => {});
    const broken = await runCompare(portFor("chain_break"), { from: "1", to: "214", paste: parsePaste(line) }, async () => {});
    if (good.kind !== "done" || bad.kind !== "done" || broken.kind !== "done") throw new Error("expected done");
    // Range 1..214 holds the sealed row #7: chain and witness agree, but that is never a tick.
    expect([isCleanMatch(good), isCleanMatch(bad), isCleanMatch(broken)]).toEqual([false, false, false]);
    expect(good.local.status).toBe("verified_with_sealed");
    expect(good.comparison?.partial).toBe(true);
    expect(isPartialMatch(good)).toBe(true);
    expect([isPartialMatch(bad), isPartialMatch(broken)]).toEqual([false, false]);
    // A range with no sealed row is the one clean match.
    const clean = await runCompare(portFor("intact"), { from: "8", to: "214", paste: parsePaste(await witnessLineFor(8, 214)) }, async () => {});
    if (clean.kind !== "done") throw new Error("expected done");
    expect(clean.local.status).toBe("verified");
    expect(isCleanMatch(clean)).toBe(true);
  });
  it("a line without np= cannot confirm sealed rows, and sealed fixture rows have exactly 5 keys", async () => {
    const line = (await witnessLineFor()).replace(/ np=[0-9a-f]{64}$/, "");
    const out = await runCompare(portFor("intact"), { from: "1", to: "214", paste: parsePaste(line) }, async () => {});
    if (out.kind !== "done") throw new Error("expected done");
    expect(out.comparison?.match).toBe(false);
    const sealedRow = (await ledgerRows("intact"))[SEALED_SEQ - 1]!;
    expect(Object.keys(sealedRow.canonical_fields).sort()).toEqual(["non_punitive", "prev_hash", "sealed", "seq", "v"]);
    const p = parsePaste(await witnessLineFor());
    expect(p.state === "ok" && p.witness.np_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("exportAll cancellation", () => {
  it("stops between pages once it is no longer current", async () => {
    let calls = 0;
    const port = { ledgerExport: vi.fn(async () => { calls++; return []; }) } as never;
    await expect(exportAll(port, 12000, undefined, () => calls < 1)).rejects.toBeInstanceOf(ExportCancelled);
    expect(calls).toBe(1);
  });
});
