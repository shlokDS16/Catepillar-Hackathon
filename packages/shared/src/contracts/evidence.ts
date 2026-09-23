/** Evidence-card metric keys (api-contracts §8, data-model §2.5.1). Per-type rows carry `details.type`. */
import { z } from "zod";

export const EvidenceKey = z.enum(["detector.precision", "detector.recall", "eta.mae.model", "eta.mae.organiser",
  "eta.p90_coverage", "fleet.idle_pct", "fleet.idle_pct.by_model", "loop.repeat_rate.assigned",
  "loop.repeat_rate.control", "rag.hit_at_5", "rag.faithfulness"]);

export const EvidenceMetric = z.object({ metric_key: EvidenceKey, value: z.number(), n: z.number().int().nullable(),
  details: z.record(z.string(), z.unknown()), dataset_version: z.string(), model: z.string().nullable(),
  computed_at: z.iso.datetime({ offset: true }) });

export type EvidenceKey = z.infer<typeof EvidenceKey>;
