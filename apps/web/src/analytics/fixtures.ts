/**
 * The DEMO_EVIDENCE values below are typed constants: no script, SQL view or test output in this repo computes them
 * (checked 2026-11-12), so the screen labels them "illustrative, not measured". Do not present them as results.
 * Demo rows for /fm/analytics until the live view is wired (IP5). Simulated, shaped like `v_task_analytics`. */
import type { LooseRow, EvidenceLite } from "./analytics";

const row = (task_type: LooseRow["task_type"], condition: LooseRow["condition"], n: number, a: number | null, o: number | null,
  m: number | null, mo: number | null, mm: number | null): LooseRow => ({
  task_type, condition, n, mean_actual_min: a, mean_organiser_estimate_min: o, mean_model_p50_min: m,
  mae_organiser_min: mo, mae_model_min: mm,
  bias_organiser_min: a !== null && o !== null ? o - a : null, bias_model_min: a !== null && m !== null ? m - a : null,
});

export const DEMO_ROWS: LooseRow[] = [
  row("excavation", "hot", 42, 58.1, 50, 56.4, 9.3, 5.1),
  row("trenching", "hot", 31, 44.6, 38, 43.2, 7.4, 4.6),
  row("material_loading", "hot", 55, 22.4, 18, 21.7, 4.9, 3.1),
  row("grading", "hot", 6, 71.0, 60, 69.5, 11.2, 7.0),
  row("demolition", "hot", 18, 96.3, 80, null, 17.5, null),
  row("excavation", "clear", 64, 47.2, 50, 46.8, 5.6, 3.9),
  row("trenching", "clear", 48, 36.1, 38, 36.0, 4.2, 3.3),
  row("material_loading", "clear", 70, 17.9, 18, 18.2, 2.8, 2.5),
  row("grading", "rain", 22, 80.4, 60, 77.0, 21.3, 8.4),
  row("excavation", "rain", 19, 66.0, 50, 62.5, 17.1, 7.7),
];

export const DEMO_EVIDENCE: EvidenceLite[] = [
  { metric_key: "detector.precision", value: 0.91, n: 120, details: { type: "idle_excess" } },
  { metric_key: "detector.recall", value: 0.84, n: 120, details: { type: "idle_excess" } },
  { metric_key: "detector.precision", value: 0.88, n: 64, details: { type: "overheat" } },
  { metric_key: "detector.recall", value: 0.79, n: 64, details: { type: "overheat" } },
  { metric_key: "eta.mae.model", value: 4.7, n: 190 },
  { metric_key: "eta.mae.organiser", value: 8.6, n: 190 },
  { metric_key: "eta.p90_coverage", value: 0.89, n: 190 },
  { metric_key: "loop.repeat_rate.assigned", value: 0.12, n: 40 },
  { metric_key: "loop.repeat_rate.control", value: 0.27, n: 40 },
  { metric_key: "fleet.idle_pct", value: 0.18, n: 12 },
];
