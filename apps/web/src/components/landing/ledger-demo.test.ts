import { describe, expect, it } from "vitest";
import { ZERO_HASH, verifyLedger } from "@cat/shared/ledger";
import { TAMPER_AT, buildLedgerDemo, groups } from "./ledger-demo";

describe("landing ledger demo", () => {
  it("honest rows are accepted by the product's verifyLedger", async () => {
    const { honest } = await buildLedgerDemo();
    const res = await verifyLedger(honest);
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(6);
  });

  it("the tampered set fails at row 4 with a hash mismatch", async () => {
    const { tampered } = await buildLedgerDemo();
    const res = await verifyLedger(tampered);
    expect(res.ok).toBe(false);
    expect(res.first_bad_seq).toBe(TAMPER_AT);
    expect(res.reason).toBe("hash_mismatch");
  });

  it("links every row to the stored hash of the row before it, and only row 4 recomputes differently", async () => {
    const { rows } = await buildLedgerDemo();
    expect(rows[0].prev).toBe(ZERO_HASH);
    for (let i = 1; i < rows.length; i++) expect(rows[i].prev).toBe(rows[i - 1].stored);
    for (const r of rows) expect(r.recomputed === r.stored).toBe(r.seq !== TAMPER_AT);
  });

  it("groups a hash in fours", () => {
    expect(groups("0123456789abcdef0000")).toBe("0123 4567 89ab cdef");
  });
});
