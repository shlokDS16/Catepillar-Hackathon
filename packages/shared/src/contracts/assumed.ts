/**
 * Field provenance (api-contracts §11, spec §3 honesty rules). The UI labels every value by where it
 * comes from: assumed_sensor → "assumed" chip; synthetic → "simulated" chip; real_open_data → source line;
 * organiser → no chip. Columns not listed are internal.
 */
import { z } from "zod";

export const Provenance = z.enum(["organiser", "assumed_sensor", "real_open_data", "synthetic", "derived"]);
export type Provenance = z.infer<typeof Provenance>;

export const FIELD_PROVENANCE = {
  telemetry_readings: {
    organiser: ["ts", "machine_id", "operator_id", "engine_hours", "fuel_used_l", "load_cycles",
                "idle_hours", "seatbelt_fastened", "organiser_safety_alert"],            // the 9 organiser fields
    assumed_sensor: ["rpm", "engine_load_pct", "coolant_temp_c", "hydraulic_temp_c", "hydraulic_pressure_bar",
                     "speed_kmh", "pitch_deg", "roll_deg", "parking_brake", "fuel_level_pct", "def_pct", "location"],
  },
  task_history: {
    organiser: ["external_ref", "task_type", "weather", "operator_skill", "machine_age_years",
                "organiser_estimate_min", "actual_min"],                                  // the 7 organiser fields
    real_open_data: ["temperature_c", "wind_kmh", "humidity_pct"],                        // Open-Meteo archive (CC BY 4.0)
    synthetic: ["operator_id", "machine_id", "site_id", "started_at", "material", "shift_hour"],
  },
  operator_state: { assumed_sensor: ["location", "on_foot", "in_cab_machine_id", "ppe"], derived: ["motion_locked", "call_allowed", "nearest"] },
  machine_state:  { assumed_sensor: ["speed_kmh", "pitch_deg", "roll_deg", "location", "hydraulic_temp_c", "coolant_temp_c", "parking_brake"],
                    organiser: ["seatbelt_fastened", "load_cycles"], derived: ["moving", "health"] },
  weather_snapshots: { real_open_data: ["temperature_c", "apparent_temperature_c", "humidity_pct", "wind_kmh",
                       "wind_from_deg", "wind_gust_kmh", "precipitation_mm", "weather_code", "shortwave_wm2"],
                       derived: ["wbgt_c", "wind_chill_c", "forecast_peak_c", "forecast_peak_at"] },
  tasks: { synthetic: ["planned_cycles", "planned_start"], derived: ["progress_pct", "eta_p50_min", "eta_p90_min", "eta_factors"] },
  anomalies: { derived: ["severity_score", "explanation", "fuel_l", "cost_inr"] },
} as const satisfies Record<string, Partial<Record<Provenance, readonly string[]>>>;

/** The organiser's exact column headers (D8): these two lists are the schema subset the CSV export reproduces. */
export const ORGANISER_HEADERS = {
  telemetry: FIELD_PROVENANCE.telemetry_readings.organiser,
  task_history: FIELD_PROVENANCE.task_history.organiser,
} as const;
