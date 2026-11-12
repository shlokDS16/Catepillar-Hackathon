import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { dataLabel } from "./data-label";

const t = (key: string, v: Record<string, string | number> = {}) => {
  const raw = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en) as string;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));
};
const formatTime = () => "09:40";
const clock = { sim_now: "2026-09-24T09:40:00.000+05:30", speed: 10 };

describe("dataLabel", () => {
  it("reads Demo data for fixtures and never says fixture", () => {
    const s = dataLabel({ connectivity: { kind: "fixture" }, clock, t, formatTime });
    expect(s).toBe("Demo data · 09:40 · 10× speed");
    expect(s.toLowerCase()).not.toContain("fixture");
    expect(dataLabel({ connectivity: { kind: "fixture" }, clock: null, t, formatTime })).toBe("Demo data");
  });
  it("live shows the run state and never the fixture clock or a second Demo data", () => {
    const live = dataLabel({ connectivity: { kind: "fixture" }, clock, t, formatTime, source: "live", runStatus: "paused" });
    expect(live).toBe("Live data · run paused");
    expect(dataLabel({ connectivity: { kind: "live" }, clock, t, formatTime, source: "live" })).toBe("Live data · no run");
    const fb = dataLabel({ connectivity: { kind: "fixture" }, clock, t, formatTime, source: "fallback" });
    expect(fb).toBe("Live data unavailable, showing demo data");
  });
  it("keeps the other states", () => {
    expect(dataLabel({ connectivity: { kind: "reconnecting" }, clock, t, formatTime })).toBe("Reconnecting…");
    expect(dataLabel({ connectivity: { kind: "nosignal", syncedAtMs: 1 }, clock, t, formatTime })).toBe("No signal · synced 09:40");
  });
});
