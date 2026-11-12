import { clamp, easeInOut, seg, solveTime, type Diagram } from "./core";
import { FINAL_DEG, GAUGE_MAX_DEG, GROUND_DEG, LIMIT_DEG, detachTime, figureAt, groundDeg, type Figure } from "./roll";

/**
 * Diagram (a), WHY card: a slope rollover with a pitch gauge. The ground steepens, the needle
 * climbs, crosses the limit, the machine tips and the unbelted operator is thrown into its path.
 */
export type RolloverFrame = {
  tilt: number; // degrees, machine
  ground: number; // degrees, slope drawn under it
  needle: number; // degrees on the gauge scale, clipped to the scale
  overLimit: boolean;
  figure: Figure;
};

export const ROLLOVER_DURATION = 11;

export function rolloverTilt(t: number): number {
  if (t < 5.1) return GROUND_DEG * easeInOut(seg(t, 0, 4.5)); // the slope steepens past the limit; hold 0.6 s
  const k = seg(t, 5.1, 8);
  return GROUND_DEG + (FINAL_DEG - GROUND_DEG) * k * k; // then the tip accelerates and it lies on its side
}

const TD = detachTime(rolloverTilt, ROLLOVER_DURATION);
/** When the needle crosses the limit mark (on the ground, before the tip). */
export const LIMIT_AT = solveTime(rolloverTilt, LIMIT_DEG + 0.01, 0, ROLLOVER_DURATION);

export function rolloverAt(t: number): RolloverFrame {
  const tt = clamp(t, 0, ROLLOVER_DURATION);
  const tilt = rolloverTilt(tt);
  return {
    tilt,
    ground: groundDeg(tilt),
    needle: clamp(tilt, 0, GAUGE_MAX_DEG),
    overLimit: tilt > LIMIT_DEG,
    figure: figureAt(tilt, tt - TD, false),
  };
}

export const rollover: Diagram<RolloverFrame> = {
  id: "rollover",
  duration: ROLLOVER_DURATION,
  cues: [
    { at: 0, key: "rollover.c1" },
    { at: 1.5, key: "rollover.c2" },
    { at: LIMIT_AT, key: "rollover.c3" },
    { at: TD, key: "rollover.c4" },
    { at: 8.4, key: "rollover.c5" },
  ],
  stills: [
    { t: 3, keys: ["rollover.c1", "rollover.c2"] },
    { t: 6.9, keys: ["rollover.c3", "rollover.c4"] },
    { t: 10.5, keys: ["rollover.c5"] },
  ],
  at: rolloverAt,
};
