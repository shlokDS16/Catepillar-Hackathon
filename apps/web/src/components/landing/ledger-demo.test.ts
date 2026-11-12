import { describe, expect, it } from "vitest";
import { ZERO_HASH } from "@cat/shared/ledger";
import { buildLedgerDemo, groups } from "./ledger-demo";

describe("landing ledger demo", () => {
  it("links every row to the stored hash of the row before it", async () => {
    const rows = await buildLedgerDemo();
    expect(rows).toHaveLength(6);
    expect(rows[0].prev).toBe(ZERO_HASH);
    for (let i = 1; i < rows.length; i++) expect(rows[i].prev).toBe(rows[i - 1].stored);
  });

  it("breaks the chain exactly at row 4: its recomputed hash differs from the stored one", async () => {
    const rows = await buildLedgerDemo();
    for (const r of rows) {
      if (r.seq === 4) {
        expect(r.tampered).toBe(true);
        expect(r.recomputed).not.toBe(r.stored);
      } else {
        expect(r.tampered).toBe(false);
        expect(r.recomputed).toBe(r.stored);
      }
    }
  });

  it("is deterministic", async () => {
    expect(await buildLedgerDemo()).toEqual(await buildLedgerDemo());
  });

  it("groups a hash in fours", () => {
    expect(groups("0123456789abcdef0000")).toBe("0123 4567 89ab cdef");
  });
});
