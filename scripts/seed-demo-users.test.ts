import { describe, expect, it } from "vitest";
import { isDemoEmail, newPassword, upsertEnv } from "./seed-demo-users.ts";

describe("seed-demo-users helpers", () => {
  it("isDemoEmail only accepts the throwaway demo domain", () => {
    expect(isDemoEmail("ravi.operator@spotter-demo.test")).toBe(true);
    expect(isDemoEmail("someone@gmail.com")).toBe(false);
    expect(isDemoEmail("x@spotter-demo.test.evil.com")).toBe(false);
  });
  it("upsertEnv replaces existing keys, appends new ones and leaves every other line alone", () => {
    const before = "A=1\nDEMO_FM_EMAIL=old@x.test # note\nB = 2\n";
    const after = upsertEnv(before, { DEMO_FM_EMAIL: "new@x.test", DEMO_FM_PASSWORD: "pw" });
    expect(after).toBe("A=1\nDEMO_FM_EMAIL=new@x.test\nB = 2\nDEMO_FM_PASSWORD=pw\n");
  });
  it("upsertEnv adds the newline a last line without one is missing, and works on an empty file", () => {
    expect(upsertEnv("A=1", { K: "v" })).toBe("A=1\nK=v\n");
    expect(upsertEnv("", { K: "v" })).toBe("K=v\n");
  });
  it("generated passwords are long, url-safe and different each time", () => {
    const a = newPassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newPassword()).not.toBe(a);
  });
});
