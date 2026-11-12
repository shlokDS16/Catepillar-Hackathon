import { describe, expect, it } from "vitest";
import { sectionClipId } from "@/replay/debrief";

describe("sectionClipId", () => {
  it("derives a section clip id from the rule's phrase id", () => {
    expect(sectionClipId("replay.safety.seatbelt_breach.rule", "scores")).toBe(
      "replay.safety.seatbelt_breach.debrief_scores",
    );
  });
  it("is null without a rule clip, so no [Listen] is faked", () => {
    expect(sectionClipId(null, "what")).toBeNull();
  });
});
