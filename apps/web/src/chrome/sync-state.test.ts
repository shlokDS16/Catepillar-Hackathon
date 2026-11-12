import { describe, expect, it } from "vitest";
import { syncState } from "./sync-state";

describe("syncState", () => {
  it("is Saved while connected with nothing waiting", () => {
    expect(syncState({ kind: "fixture" })).toEqual({ kind: "saved" });
    expect(syncState({ kind: "live" })).toEqual({ kind: "saved" });
  });
  it("counts queued writes", () => {
    expect(syncState({ kind: "live" }, 3)).toEqual({ kind: "queued", n: 3 });
    expect(syncState({ kind: "reconnecting" })).toEqual({ kind: "queued", n: 0 });
  });
  it("is Offline with no signal, keeping the queue size", () => {
    expect(syncState({ kind: "nosignal", syncedAtMs: 1 }, 2)).toEqual({ kind: "offline", n: 2 });
  });
  it("ignores a negative or fractional count", () => {
    expect(syncState({ kind: "live" }, -4)).toEqual({ kind: "saved" });
    expect(syncState({ kind: "live" }, 2.9)).toEqual({ kind: "queued", n: 2 });
  });
});
