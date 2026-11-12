import { describe, expect, it } from "vitest";
import { sectionClipId } from "@/replay/debrief";

describe("sectionClipId", () => {
  it("is one generic phrase id per Debrief section", () => {
    expect(sectionClipId("scores")).toBe("replay.debrief.scores");
    expect(sectionClipId("path")).toBe("replay.debrief.path");
  });
});
