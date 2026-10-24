/**
 * Scenario frame payloads (data-model §2.3) — the contract between the generator (B6/B7) and the
 * scenario engine's `private.apply_frame` (B9, migration 004).
 *
 * A frame is **raw sensor input only**: never an event, never an alert, never a label. `machine_id` and
 * `operator_id` are columns on `scenario_frames`, so they are not repeated in the payload; what is here
 * is what a sensor would report. The engine ignores unknown keys, so adding one is backwards
 * compatible; removing one is not.
 *
 * `director.inject_frame` (api-contracts §6) accepts the same payloads for kinds
 * telemetry / operator_state / ppe / fault.
 */
import { z } from "zod";
import { FaultSeverity, FrameKind, PpeItem } from "./enums";

const Lat = z.number().min(-90).max(90);
const Lon = z.number().min(-180).max(180);

/** The 9 organiser fields (data-model §1) plus the assumed sensors, all optional: a sensor can drop out. */
export const TelemetryFrame = z.object({
  engine_hours: z.number().nullish(), fuel_used_l: z.number().nullish(), load_cycles: z.number().int().nullish(),
  idle_hours: z.number().nullish(), seatbelt_fastened: z.boolean().nullish(),
  organiser_safety_alert: z.string().nullish(),
  rpm: z.number().int().nullish(), engine_load_pct: z.number().nullish(), coolant_temp_c: z.number().nullish(),
  hydraulic_temp_c: z.number().nullish(), hydraulic_pressure_bar: z.number().nullish(),
  speed_kmh: z.number().nullish(), pitch_deg: z.number().nullish(), roll_deg: z.number().nullish(),
  parking_brake: z.boolean().nullish(), fuel_level_pct: z.number().nullish(), def_pct: z.number().nullish(),
  lat: Lat.nullish(), lon: Lon.nullish(),
});
export const GpsFrame = z.object({ lat: Lat, lon: Lon, speed_kmh: z.number().nullish(),
  accuracy_m: z.number().nullish() });
/** `on_foot = false` means the operator is in the cab of the frame's `machine_id`. */
export const OperatorStateFrame = z.object({ on_foot: z.boolean(), lat: Lat.nullish(), lon: Lon.nullish() });
export const PpeFrame = z.record(PpeItem, z.boolean());
export const WeatherFrame = z.object({
  temperature_c: z.number(), apparent_temperature_c: z.number().nullish(), humidity_pct: z.number().nullish(),
  wind_kmh: z.number(), wind_from_deg: z.number().nullish(), wind_gust_kmh: z.number().nullish(),
  precipitation_mm: z.number().nullish(), weather_code: z.number().int().nullish(),
  shortwave_wm2: z.number().nullish(), wbgt_c: z.number().nullish(), wind_chill_c: z.number().nullish(),
  forecast_peak_c: z.number().nullish(), forecast_peak_at: z.string().nullish(),
});
export const FaultFrame = z.object({
  code_type: z.enum(["j1939_spn_fmi", "cat_cid_fmi", "cat_eid"]).default("j1939_spn_fmi"),
  spn: z.number().int().nullish(), fmi: z.number().int().nullish(), cid: z.number().int().nullish(),
  mid: z.number().int().nullish(), eid: z.number().int().nullish(),
  severity: FaultSeverity, description_key: z.string(), active: z.boolean().default(true),
});

export const FRAME_PAYLOAD = {
  telemetry: TelemetryFrame, gps: GpsFrame, operator_state: OperatorStateFrame,
  ppe: PpeFrame, weather: WeatherFrame, fault: FaultFrame,
} satisfies Record<z.infer<typeof FrameKind>, z.ZodType>;

export const ScenarioFrame = z.object({
  scenario_id: z.string().uuid(), seq: z.number().int().positive(), sim_offset_ms: z.number().int().min(0),
  kind: FrameKind, machine_id: z.string().uuid().nullable(), operator_id: z.string().uuid().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

/** Tick telemetry the engine writes per tick (`private.tick_log`), read by B11 and demo-check. */
export const TickLogRow = z.object({ run_id: z.string().uuid(), started_at: z.string(),
  frames: z.number().int(), duration_ms: z.number().int(), errors: z.number().int(),
  lag_sim_ms: z.number().int().nullable(), catchups: z.number().int() });
