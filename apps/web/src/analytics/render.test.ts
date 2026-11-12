import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { AnalyticsScreen } from "@/components/analytics/analytics-screen";
import { DEMO_EVIDENCE, DEMO_ROWS } from "./fixtures";

const html = (source: "demo" | "live") =>
  renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages: en },
      createElement(AnalyticsScreen, { rows: DEMO_ROWS, evidence: DEMO_EVIDENCE, source }),
    ),
  );
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("AnalyticsScreen render", () => {
  const out = html("demo");
  const chart = out.slice(out.indexOf('class="an-groups"'), out.indexOf("an-tablewrap"));
  const tbody = out.slice(out.indexOf("<tbody>"), out.indexOf("</tbody>"));

  it("the table equals the bars", () => {
    const bars = [...chart.matchAll(/class="bg-val t-mono"[^>]*>([^<]*)</g)].map((m) => m[1]).filter((v) => /^\d/.test(v));
    // td order per row: n, MAE organiser, MAE ours, actual, organiser, P50
    const fromTable = tbody.split("</tr>").filter((r) => r.includes("<td"))
      .flatMap((r) => [...r.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]).slice(3))
      .filter((v) => /^\d/.test(v));
    expect(bars.length).toBe(14); // 5 groups x 3 bars, minus the null P50
    expect([...bars].sort()).toEqual([...fromTable].sort());
  });
  it("labels demo data and never claims held-out or organiser fields", () => {
    expect(out).toContain("Simulated demo data");
    expect(out).not.toContain("held-out");
    expect(out).not.toContain("Organiser fields");
    expect(html("live")).toContain("held-out test tasks");
  });
  it("the verdict names n, excludes few-task groups and makes no significance claim", () => {
    const v = strip(out.slice(out.indexOf("an-verdict"), out.indexOf('class="an-groups"')));
    expect(v).toContain("n = 128");
    expect(v).toContain("No interval yet");
    expect(out.slice(out.indexOf("an-verdict"), out.indexOf('class="an-groups"'))).not.toContain("check");
  });
  it("has no concatenated meta text", () => {
    expect(out).not.toMatch(/tasksn/);
  });
  it("ETA and impact values reach screen readers", () => {
    expect(out).toContain("MAE ours: 4.7 min");
    expect(out).toContain("Repeat rate, control: 27%");
  });
});
