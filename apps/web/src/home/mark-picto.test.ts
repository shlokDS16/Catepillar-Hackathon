import { describe, expect, it } from "vitest";
import { markPictogram } from "@/home/mark-picto";

describe("markPictogram", () => {
  it("picks the pictogram from the event type", () => {
    expect(markPictogram({ kind: "breach", lessonCode: "seatbelt_slopes" })).toBe("seatbelt");
    expect(markPictogram({ kind: "breach", lessonCode: "proximity_zone_basics" })).toBe("proximity");
    expect(markPictogram({ kind: "breach", lessonCode: "ppe_vest_check" })).toBe("vest");
  });
  it("heat marks use the heat pictogram", () => {
    expect(markPictogram({ kind: "heat", lessonCode: null })).toBe("heat");
  });
  it("falls back to a neutral pictogram, never the seatbelt", () => {
    expect(markPictogram({ kind: "breach", lessonCode: null })).toBe("fault");
    expect(markPictogram({ kind: "breach", lessonCode: "unknown_thing" })).toBe("fault");
  });
});
