import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.ts";
import { transactionControl } from "./sql-guard.ts";

describe("parseEnv", () => {
  it("handles the shapes found in the real .env", () => {
    const text = [
      "# comment",
      "A=plain",
      "B = spaced   # trailing comment",
      'C="quoted value" # note',
      "D='single # not a comment'",
      "E=postgres://u:p@h:5432/db?x=1",
      "export F=exported",
      'G="with \\"escaped\\" quotes"',
      "H=",
      "",
    ].join("\r\n");
    expect(parseEnv(text)).toEqual({
      A: "plain",
      B: "spaced",
      C: "quoted value",
      D: "single # not a comment",
      E: "postgres://u:p@h:5432/db?x=1",
      F: "exported",
      G: 'with "escaped" quotes',
      H: "",
    });
  });
});

describe("transactionControl", () => {
  it("allows plpgsql begin/end inside a $$ body", () => {
    expect(transactionControl("do $$\nbegin\n  assert 1 = 1;\nend $$;\n")).toBeNull();
    expect(transactionControl("create function f() returns void language plpgsql as $fn$ begin commit; end $fn$;")).toBeNull();
  });
  it("refuses top-level transaction control", () => {
    expect(transactionControl("select 1;\ncommit;\n")).toBe("commit");
    expect(transactionControl("BEGIN;\nselect 1;")).toBe("begin");
    expect(transactionControl("  rollback;")).toBe("rollback");
    expect(transactionControl("start transaction;")).toBe("start transaction");
  });
});
