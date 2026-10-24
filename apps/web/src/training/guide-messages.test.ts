import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GUIDE_STEPS } from "./guide-steps";

type Tree = { [key: string]: Tree | string };

function catalogue(locale: string): Tree {
  const path = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Tree;
}

/** Every leaf key, dotted, so two catalogues can be compared shape-first. */
function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : keys(value, path);
  });
}

function leaves(tree: Tree): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: Tree, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") out.set(path, value);
      else walk(value, path);
    }
  };
  walk(tree, "");
  return out;
}

const en = catalogue("en").guide as Tree;
const hi = catalogue("hi").guide as Tree;

describe("the guide catalogue", () => {
  it("exists in English and Hindi (Tamil falls back to English by design)", () => {
    expect(typeof en).toBe("object");
    expect(typeof hi).toBe("object");
  });
  it("has the same keys in both languages", () => {
    expect(keys(hi).sort()).toEqual(keys(en).sort());
  });
  it("carries a phase word, a sentence and a rule for every step", () => {
    for (const step of GUIDE_STEPS) {
      for (const field of ["phase", "line", "rule"]) {
        expect(keys(en)).toContain(`steps.${step.id}.${field}`);
      }
    }
  });
  it("uses the same ICU placeholders in both languages", () => {
    const enLeaves = leaves(en);
    const hiLeaves = leaves(hi);
    for (const [path, text] of enLeaves) {
      const placeholders = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
      expect(placeholders(hiLeaves.get(path) ?? ""), path).toEqual(placeholders(text));
    }
  });
  it("is actually translated: no Hindi string is left as the English one", () => {
    const enLeaves = leaves(en);
    const hiLeaves = leaves(hi);
    for (const [path, text] of enLeaves) {
      expect(hiLeaves.get(path), path).not.toBe(text);
    }
  });
});
