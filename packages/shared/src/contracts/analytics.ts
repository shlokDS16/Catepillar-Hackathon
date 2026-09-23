/** Supervisor analytics, the one P0 chart (api-contracts §14): rows of `public.v_task_analytics`. */
import { z } from "zod";
import { TaskType, WeatherKind } from "./enums";

export const TaskAnalyticsRow = z.object({
  task_type: TaskType, condition: WeatherKind, n: z.number().int(),
  mean_actual_min: z.number(), mean_organiser_estimate_min: z.number(), mean_model_p50_min: z.number(),
  mae_organiser_min: z.number(), mae_model_min: z.number(),
  bias_organiser_min: z.number(), bias_model_min: z.number(),     // mean(estimate − actual)
});

export type TaskAnalyticsRow = z.infer<typeof TaskAnalyticsRow>;
