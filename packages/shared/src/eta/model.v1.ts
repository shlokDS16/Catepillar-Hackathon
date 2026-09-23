/**
 * ETA model v1 coefficients (api-contracts §8). Written by scripts/eta-fit.ts (B16) from the `train` and
 * `calib` splits; until then these are handbook-style placeholders (fitted_at = null). Kept as a TS module
 * rather than a .json import so web (Turbopack), vitest and tsx/Node all load it the same way.
 */
export const MODEL_V1_DATA = {
  "version": "eta-v1.0-placeholder",
  "fitted_at": null,
  "baseline_min": {
    "excavation": 48,
    "trenching": 55,
    "material_loading": 40,
    "grading": 60,
    "demolition": 75
  },
  "log_multipliers": {
    "weather:clear": 0,
    "weather:hot": 0.105,
    "weather:rain": 0.223,
    "weather:windy": 0.086,
    "weather:cold": 0.095,
    "weather:fog": 0.148,
    "weather:dust": 0.113,
    "skill:novice": 0.14,
    "skill:intermediate": 0,
    "skill:expert": -0.08,
    "age:lt5": 0,
    "age:5to10": 0.03,
    "age:10to20": 0.07,
    "age:20plus": 0.12,
    "heat:normal": 0,
    "heat:warm": 0.03,
    "heat:high": 0.09,
    "heat:extreme": 0.16,
    "heat:cold": 0.05,
    "wind:calm": 0,
    "wind:fresh": 0.03,
    "wind:strong": 0.08,
    "circadian:normal": 0,
    "circadian:post_lunch_dip": 0.04,
    "circadian:night_trough": 0.07
  },
  "q90_log": 0.18,
  "n_train": null,
  "n_calib": null
} as const;
