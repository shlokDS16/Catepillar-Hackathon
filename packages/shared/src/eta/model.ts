/**
 * ETA model v1 (api-contracts §8, spec M6): a handbook-style baseline per task type × exp(sum of fitted
 * log-multipliers) for the condition factors, with a split-conformal P90 band. Pure: the same function runs
 * in the browser ("why this estimate", what-if slider) and in `scripts/eta-fit.ts` (B16, which writes
 * `model.v1.ts`). The factors returned are exactly what `task_start` stores (G2-9).
 */
import { z } from "zod";
import { SkillLevel, TaskType, WeatherKind } from "../contracts/enums";
import { EtaFactor } from "../contracts/events";
import { MODEL_V1_DATA } from "./model.v1";

export const EtaInput = z.object({ task_type: TaskType, weather: WeatherKind, operator_skill: SkillLevel,
  machine_age_years: z.number().min(0).max(40), temperature_c: z.number().nullable(),
  wind_kmh: z.number().nullable(), shift_hour: z.number().int().min(0).max(23).nullable() });
export const EtaEstimate = z.object({ p50_min: z.number(), p90_min: z.number(), factors: z.array(EtaFactor),
  model_version: z.string() });
export type EtaInput = z.infer<typeof EtaInput>;
export type EtaEstimate = z.infer<typeof EtaEstimate>;

/** The fitted artefact (B16): baselines in minutes, log-multipliers by factor key, conformal q90 on log residuals. */
export const EtaModel = z.object({
  version: z.string(),
  fitted_at: z.string().nullable(),          // null until B16 fits it on the `train` split
  baseline_min: z.record(TaskType, z.number().positive()),
  log_multipliers: z.record(z.string(), z.number()),   // key → ln(multiplier); missing key = 0 (×1.00)
  q90_log: z.number().min(0),                // P90 = P50 · exp(q90_log); split-conformal 90 % quantile (rank ⌈(n+1)·0.9⌉)
  n_train: z.number().int().nullable(), n_calib: z.number().int().nullable(),
});
export type EtaModel = z.infer<typeof EtaModel>;
export const MODEL_V1: EtaModel = EtaModel.parse(MODEL_V1_DATA);

export const ageBucket = (years: number) => (years < 5 ? "lt5" : years < 10 ? "5to10" : years < 20 ? "10to20" : "20plus");
export const heatBand = (t: number | null) => (t === null ? null : t >= 40 ? "extreme" : t >= 35 ? "high" : t >= 30 ? "warm" : t <= 5 ? "cold" : "normal");
export const windBand = (w: number | null) => (w === null ? null : w >= 40 ? "strong" : w >= 25 ? "fresh" : "calm");
export const circadianBand = (h: number | null) =>
  (h === null ? null : h >= 2 && h < 6 ? "night_trough" : h >= 13 && h < 15 ? "post_lunch_dip" : "normal");

/**
 * Factor keys in evaluation order. `assumed` marks a factor whose input is neither an organiser field nor
 * real open data: only the circadian band (shift hour is synthetic; api-contracts §11). Weather, skill
 * and age are organiser fields; temperature and wind come from the Open-Meteo archive (CC BY 4.0).
 */
export function etaFactorKeys(input: EtaInput): { key: string; assumed: boolean }[] {
  const keys: { key: string; assumed: boolean }[] = [
    { key: `weather:${input.weather}`, assumed: false },
    { key: `skill:${input.operator_skill}`, assumed: false },
    { key: `age:${ageBucket(input.machine_age_years)}`, assumed: false },
  ];
  const heat = heatBand(input.temperature_c);
  if (heat) keys.push({ key: `heat:${heat}`, assumed: false });
  const wind = windBand(input.wind_kmh);
  if (wind) keys.push({ key: `wind:${wind}`, assumed: false });
  const circadian = circadianBand(input.shift_hour);
  if (circadian) keys.push({ key: `circadian:${circadian}`, assumed: true });
  return keys;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function estimateEta(rawInput: EtaInput, model: EtaModel = MODEL_V1): EtaEstimate {
  const input = EtaInput.parse(rawInput);
  const baseline = model.baseline_min[input.task_type];
  const factors = etaFactorKeys(input).map(({ key, assumed }) => ({
    key, assumed, multiplier: Math.round(Math.exp(model.log_multipliers[key] ?? 0) * 1000) / 1000,
  }));
  const p50 = factors.reduce((acc, f) => acc * f.multiplier, baseline);
  return { p50_min: round1(p50), p90_min: round1(p50 * Math.exp(model.q90_log)), factors, model_version: model.version };
}
