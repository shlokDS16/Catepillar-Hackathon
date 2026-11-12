import { describe, expect, it } from "vitest";
import { markPictogram } from "@/home/mark-picto";

describe("markPictogram", () => {
  it("maps fixture lesson codes through the table", () => {
    expect(markPictogram({ kind: "breach", lessonCode: "seatbelt_slopes" })).toBe("seatbelt");
    expect(markPictogram({ kind: "breach", lessonCode: "faulty_machine_nearby" })).toBe("fault");
  });
  it("heat marks use the heat pictogram", () => {
    expect(markPictogram({ kind: "heat", lessonCode: null })).toBe("heat");
  });
  it("a live breach mark with no assignment uses its alert kind (seatbelt stays a seatbelt)", () => {
    expect(markPictogram({ kind: "breach", lessonCode: null, alertKind: "seatbelt_off_moving" })).toBe("seatbelt");
    expect(markPictogram({ kind: "breach", lessonCode: null, alertKind: "proximity_zone" })).toBe("proximity");
  });
  it("falls back to a neutral pictogram", () => {
    expect(markPictogram({ kind: "breach", lessonCode: null })).toBe("fault");
    expect(markPictogram({ kind: "breach", lessonCode: "unknown_thing" })).toBe("fault");
  });
});
