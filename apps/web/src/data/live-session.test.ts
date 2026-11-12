import { describe, expect, it } from "vitest";
import { enterLive, getLiveState, reportFallback, reportLive } from "./live-session";

describe("live session: the fallback notice is per call", () => {
  it("stays demo and ignores reports until Live is on", () => {
    reportFallback("my_snapshot");
    expect(getLiveState().source).toBe("demo");
  });

  it("one call succeeding does not clear another call's fallback", () => {
    enterLive("operator");
    expect(getLiveState().source).toBe("live");
    reportFallback("my_snapshot");
    reportLive("replay_get");
    expect(getLiveState().source).toBe("fallback");
    reportLive("my_snapshot");
    expect(getLiveState().source).toBe("live");
  });

  it("two failing calls need two successes", () => {
    enterLive("fleet_manager");
    reportFallback("ledger_verify");
    reportFallback("my_snapshot");
    reportLive("ledger_verify");
    expect(getLiveState().source).toBe("fallback");
    reportLive("my_snapshot");
    expect(getLiveState().source).toBe("live");
  });
});
