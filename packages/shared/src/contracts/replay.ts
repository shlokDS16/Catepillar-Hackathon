/**
 * Replay (api-contracts §5, D10): four phases, Brief → Investigate → Decide → Debrief. The client JSON
 * carries no answer key: `relevant`, `why` and the correct choices stay server-side until `replay_submit`.
 */
import { z } from "zod";
import { I18nText, Id, LatLon, Ts } from "./enums";
import { ReplayScores } from "./events";

const Pt = z.object({ t_ms: z.number().int(), lat: z.number(), lon: z.number() });
export const EvidenceType = z.enum(["telemetry_trend", "wind", "map_snapshot", "fault_code",
  "protocol_card", "weather", "shift_hours"]);
export const TrendMetric = z.enum(["speed_kmh", "pitch_deg", "roll_deg", "seatbelt", "hydraulic_temp_c", "rpm"]);
export const EvidenceCard = z.discriminatedUnion("type", [
  z.object({ type: z.literal("telemetry_trend"), id: z.string(), title: I18nText,
    series: z.array(z.object({ metric: TrendMetric, points: z.array(z.object({ t_ms: z.number().int(), v: z.number() })) })) }),
  z.object({ type: z.literal("wind"), id: z.string(), title: I18nText, from_deg: z.number(), kmh: z.number(), gust_kmh: z.number().nullable() }),
  z.object({ type: z.literal("map_snapshot"), id: z.string(), title: I18nText, center: LatLon, zoom: z.number(),
    zones: z.array(z.object({ id: Id, name: z.string(), zone_type: z.string(), polygon: z.array(LatLon) })),
    trail: z.array(Pt).max(600), machine_track: z.array(Pt).max(600) }),
  z.object({ type: z.literal("fault_code"), id: z.string(), title: I18nText,
    codes: z.array(z.object({ code_type: z.string(), code: z.string(), severity: z.string(), description: I18nText })) }),
  z.object({ type: z.literal("protocol_card"), id: z.string(), title: I18nText, card_id: z.string() }),   // ProtocolCard by id
  z.object({ type: z.literal("weather"), id: z.string(), title: I18nText, temperature_c: z.number(), wbgt_c: z.number().nullable() }),
  z.object({ type: z.literal("shift_hours"), id: z.string(), title: I18nText, hours_on_shift: z.number(),
    circadian_band: z.enum(["normal", "post_lunch_dip", "night_trough"]) }),
]);

export const ReplayEventType = z.enum(["safety.seatbelt_breach"]);   // P0; Guardian replay is P1 (additive)
export const DecideStep = z.object({ step: z.number().int(), prompt: I18nText, audio_id: z.string().nullable(),
  time_limit_s: z.number().int().positive(),
  kind: z.enum(["single", "order"]),                                  // "order" = arrange protocol actions in sequence
  choices: z.array(z.object({ id: z.string(), label: I18nText, pictogram: z.string() })).min(2).max(5) });

export const ReplayScenario = z.object({
  id: Id, event_id: Id, event_type: ReplayEventType, occurred_sim_ts: Ts,
  machine_code: z.string(), summary: I18nText,
  brief: z.object({ title: I18nText, situation: I18nText, goal: I18nText,
    time_budget_s: z.number().int(),                                  // = the Investigate budget (UI-20)
    audio_id: z.string().nullable() }),
  investigate: z.object({ cards: z.array(EvidenceCard).min(3).max(7),
    max_open: z.number().int().nullable() }),                          // hard limit: the server scores only the first max_open ids (UI-20)
  decide: z.object({ steps: z.array(DecideStep).min(3).max(4) }),
  reenactment: z.object({ duration_ms: z.number().int(), trail: z.array(Pt),
    machine_track: z.array(Pt.extend({ speed_kmh: z.number(), pitch_deg: z.number() })),
    wind: z.array(z.object({ t_ms: z.number().int(), from_deg: z.number(), kmh: z.number() })),
    real_response_ms: z.number().int().nullable() }),                  // played in the debrief
});

export const ReplayDebriefResult = z.object({
  scores: ReplayScores,                                               // the same object as training.replay_completed
  process_trace: z.object({ opened: z.array(z.string()), ideal: z.array(z.string()),
    relevant: z.array(z.object({ card_id: z.string(), relevant: z.boolean(), why: I18nText })) }),
  review: z.array(z.object({ step: z.number().int(), chosen: z.array(z.string()), best: z.array(z.string()), why: I18nText })),
  rule: z.object({ card_id: z.string(), text: I18nText, audio_id: z.string().nullable() }),   // quoted from the fixed protocol card
  lesson_code: z.string().nullable(),
});

export type ReplayScenario = z.infer<typeof ReplayScenario>;
export type ReplayDebriefResult = z.infer<typeof ReplayDebriefResult>;
export type EvidenceCard = z.infer<typeof EvidenceCard>;
