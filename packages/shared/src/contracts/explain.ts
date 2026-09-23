/**
 * Anomaly explanation and cost (api-contracts §12, spec M5). The explanation is rendered in SQL from these
 * fixed templates by named-slot substitution (`replace(text, '{slot}', value)` per slot; no LLM), stored on
 * `anomalies.explanation {en, hi}` and copied into the `anomaly.detected` payload.
 */
import type { AnomalyType } from "./enums";

export const FUEL_PRICE = { diesel_inr_per_l: 92, as_of: "2026-09-23", source: "team assumption" } as const;
// [A] approximate Indian retail diesel price; the UI shows it as "at ₹92/L (assumed)"

/** severity_score 0-100 → tier: info < 25 ≤ caution < 50 ≤ warning < 75 ≤ critical */
export const SEVERITY_BANDS = { caution: 25, warning: 50, critical: 75 } as const;

export const EXPLANATION_TEMPLATES = {
  idle_excess: {
    en: "{machine} idled {idle_pct}% of the last hour, {ratio}× its normal. About {fuel_l} L of diesel (≈ ₹{cost_inr}).",
    hi: "{machine} पिछले एक घंटे में {idle_pct}% समय खाली चली, सामान्य से {ratio} गुना। लगभग {fuel_l} लीटर डीज़ल (≈ ₹{cost_inr})।",
  },
  seatbelt_off_moving: {
    en: "{machine} moved at {speed_kmh} km/h with the seatbelt off on a {pitch_deg}° slope.",
    hi: "{machine} {pitch_deg}° ढलान पर बिना सीटबेल्ट {speed_kmh} किमी/घंटा चली।",
  },
  overspeed: {
    en: "{machine} ran at {speed_kmh} km/h in a {limit_kmh} km/h zone.",
    hi: "{machine} {limit_kmh} किमी/घंटा ज़ोन में {speed_kmh} किमी/घंटा चली।",
  },
  slope_exceeded: {
    en: "{machine} worked on a {pitch_deg}° slope; the limit is {limit_deg}°.",
    hi: "{machine} {pitch_deg}° ढलान पर चली; सीमा {limit_deg}° है।",
  },
  fault_continued_operation: {
    en: "{machine} kept working for {minutes} min with fault {code} active.",
    hi: "{machine} फ़ॉल्ट {code} के साथ {minutes} मिनट चलती रही।",
  },
  hydraulic_temp_drift: {
    en: "{machine} hydraulic oil is at {value}°C, rising above its normal {mean}°C.",
    hi: "{machine} का हाइड्रोलिक तेल {value}°C है, सामान्य {mean}°C से ऊपर।",
  },
  coolant_temp_drift: {
    en: "{machine} coolant is at {value}°C, above its normal {mean}°C.",
    hi: "{machine} का कूलेंट {value}°C है, सामान्य {mean}°C से ऊपर।",
  },
} as const satisfies Record<AnomalyType, { en: string; hi: string }>;   // Hindi: native review required (B23)

/** Slot names used by a template, e.g. ["machine", "idle_pct", …]. */
export function templateSlots(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];
}

/** The same substitution the SQL does, for tests and the offline evidence script. */
export function renderExplanation(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{([a-z_]+)\}/g, (whole, slot: string) => (slot in values ? String(values[slot]) : whole));
}
