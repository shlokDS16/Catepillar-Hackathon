import { clamp, easeInOut, lerp, seg, type Diagram } from "./core";
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
  if (t < 4) return GROUND_DEG * easeInOut(seg(t, 0, 4)); // the slope steepens to 24 degrees
  if (t < 5.5) return lerp(GROUND_DEG, LIMIT_DEG + 1, seg(t, 4, 5.5)); // the needle creeps over the limit
  const k = seg(t, 5.5, 8.5);
  return LIMIT_DEG + 1 + (FINAL_DEG - LIMIT_DEG - 1) * k * k; // the tip accelerates, then it lies on its side
}

const TD = detachTime(rolloverTilt, ROLLOVER_DURATION);

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
    { at: 3, key: "rollover.c2" },
    { at: 5.2, key: "rollover.c3" },
    { at: TD, key: "rollover.c4" },
    { at: 9, key: "rollover.c5" },
  ],
  stills: [3.8, 5.8, 10.5],
  at: rolloverAt,
};
