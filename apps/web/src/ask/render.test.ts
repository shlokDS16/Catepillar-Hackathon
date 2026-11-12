import { askAnsweredLeak, askAnsweredPrestart, askDegraded, askRateLimited } from "@cat/shared/fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import { AskResult } from "@/components/ask/ask-sheet";

const html = (response: Parameters<typeof AskResult>[0]["response"], onReview = vi.fn(), messages: object = en, locale = "en") =>
  renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale, messages } as unknown as Parameters<typeof NextIntlClientProvider>[0],
      createElement(AskResult, { response, onReview }),
    ),
  );
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("AskResult render", () => {
  it("answered: rule plate with source, numbered steps with marks, citation and photo chips, handover, Review and log, SIM caption", () => {
    const text = strip(html(askAnsweredLeak));
    expect(text).toContain("Do not operate equipment with a known hydraulic leak.");
    expect(text).toContain("Source: OSHA 3120, page 4");
    expect(text).toContain("Talk to your supervisor");
    expect(text).toContain("OSHA 3120 · page 4");
    expect(text).toContain("Looks like: hydraulic leak · 72 %");
    expect(text).toContain("Review and log");
    expect(text).toContain("SIM");
    expect(text).toContain("not a live model");
    expect(html(askAnsweredLeak)).toContain("<ol");
    expect(html(askAnsweredLeak).match(/class="ask-mark/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it("no proposed_action: no Review and log; a draft citation says so", () => {
    const out = html(askAnsweredPrestart);
    expect(strip(out)).not.toContain("Review and log");
    expect(strip(out)).toContain("Draft guidance, confirm with supervisor");
  });
  it("refused: only the refusal copy, no steps, no Review and log", () => {
    const text = strip(html(askRateLimited));
    expect(text).toContain("Too many questions. Wait a minute.");
    expect(text).not.toContain("Steps");
    expect(text).not.toContain("Review and log");
  });
  it("degraded: the answer plus the Backup model line", () => {
    const text = strip(html(askDegraded));
    expect(text).toContain("Backup model");
    expect(text).toContain("Steps");
  });
  it("renders in Hindi from the same fixture", () => {
    const text = strip(html(askAnsweredLeak, vi.fn(), hi, "hi"));
    expect(text).toContain("देखें और दर्ज करें");
    expect(text).toContain("हाइड्रोलिक रिसाव");
  });
});
