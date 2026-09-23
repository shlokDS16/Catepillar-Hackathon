import { describe, expect, it } from "vitest";
import { alertAudioLang, clipFor, feedbackPlan } from "./feedback";
import { STUB_AUDIO_MANIFEST } from "./stub-manifest";

describe("feedback plan per tier (interaction-map §5)", () => {
  it("info is silent", () => {
    expect(feedbackPlan("info", "idle_excess", "en", STUB_AUDIO_MANIFEST)).toMatchObject({ vibrate: null, clip: null });
  });
  it("caution vibrates [200] once and never plays audio", () => {
    const plan = feedbackPlan("caution", "ppe_missing", "hi", STUB_AUDIO_MANIFEST);
    expect(plan.vibrate).toEqual([200]);
    expect(plan.vibrateEveryMs).toBeNull();
    expect(plan.clip).toBeNull();
  });
  it("warning repeats [400,200,400] every 5 s and the clip every 10 s at most 6 times", () => {
    const plan = feedbackPlan("warning", "seatbelt_off_moving", "hi", STUB_AUDIO_MANIFEST);
    expect(plan.vibrate).toEqual([400, 200, 400]);
    expect(plan.vibrateEveryMs).toBe(5_000);
    expect(plan.clip).toBe("/audio/hi/alert.seatbelt_off_moving.warning.mp3");
    expect(plan.clipEveryMs).toBe(10_000);
    expect(plan.clipMaxPlays).toBe(6);
  });
  it("critical repeats [800,200,800,200,800] every 4 s and the clip until acknowledged", () => {
    const plan = feedbackPlan("critical", "guardian_hazard", "en", STUB_AUDIO_MANIFEST);
    expect(plan.vibrate).toEqual([800, 200, 800, 200, 800]);
    expect(plan.vibrateEveryMs).toBe(4_000);
    expect(plan.clip).toBe("/audio/en/alert.guardian_hazard.critical.mp3");
    expect(plan.clipMaxPlays).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("clip resolution from the manifest", () => {
  it("returns null for a phrase the manifest does not list, so [Listen] is hidden", () => {
    expect(clipFor(STUB_AUDIO_MANIFEST, "alert.sos.critical", "en")).toBeNull();
  });
  it("returns null for a `missing` entry", () => {
    const manifest = [{ ...STUB_AUDIO_MANIFEST[0], status: "missing" as const }];
    expect(clipFor(manifest, manifest[0].phrase_id, manifest[0].lang)).toBeNull();
  });
  it("the Tamil UI plays the English alert clip", () => {
    expect(alertAudioLang("ta")).toBe("en");
    expect(feedbackPlan("warning", "seatbelt_off_moving", "ta", STUB_AUDIO_MANIFEST).clip).toBe(
      "/audio/en/alert.seatbelt_off_moving.warning.mp3",
    );
  });
});
