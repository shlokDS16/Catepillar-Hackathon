import { AnalyticsScreen } from "@/components/analytics/analytics-screen";
import { DEMO_EVIDENCE, DEMO_ROWS } from "@/analytics/fixtures";

/**
 * Only the FixtureAdapter exists until F13/IP5, so the demo rows are the source and are labelled "Simulated demo data".
 * When the live port lands, pass `source="live"` with the view rows; demo rows must never reach a live session.
 */
export default function Page() {
  return <AnalyticsScreen rows={DEMO_ROWS} evidence={DEMO_EVIDENCE} source="demo" />;
}
