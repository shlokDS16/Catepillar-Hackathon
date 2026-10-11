import { describe, expect, it } from "vitest";
import { audioLangFor } from "./use-audio";

/** Screens.md i18n rules: alerts fall back to English in the Tamil UI; everything else is hidden there. */
describe("audioLangFor", () => {
  it("passes hi and en through", () => {
    expect(audioLangFor("alert.seatbelt_breach.warning", "hi")).toBe("hi");
    expect(audioLangFor("lesson.intro", "hi")).toBe("hi");
    expect(audioLangFor("alert.seatbelt_breach.warning", "en")).toBe("en");
    expect(audioLangFor("lesson.intro", "en")).toBe("en");
  });

  it("falls back to en for alert phrases in Tamil and hides the rest", () => {
    expect(audioLangFor("alert.seatbelt_breach.warning", "ta")).toBe("en");
    expect(audioLangFor("lesson.intro", "ta")).toBeNull();
  });
});
