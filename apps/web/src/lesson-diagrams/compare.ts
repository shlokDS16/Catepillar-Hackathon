import { clamp, seg, type Diagram } from "./core";
import { FINAL_DEG, GROUND_DEG, detachTime, figureAt, groundDeg, type Figure } from "./roll";

/**
 * Diagram (b), WHY card: the same rollover twice, side by side. Belt on: the operator stays in
 * the seat inside the cab frame. No belt: thrown out, lands in the machine's path.
 */
export type CompareFrame = {
  tilt: number;
  ground: number;
  belted: Figure;
  unbelted: Figure;
};

export const COMPARE_DURATION = 10;
const HOLD = 2; // seconds on the slope before it goes
const TIP = 3.4; // seconds from the first lean to lying on the side

export function compareTilt(t: number): number {
  const k = seg(t, HOLD, HOLD + TIP);
  return GROUND_DEG + (FINAL_DEG - GROUND_DEG) * k * k;
}

const TD = detachTime(compareTilt, COMPARE_DURATION);

export function compareAt(t: number): CompareFrame {
  const tt = clamp(t, 0, COMPARE_DURATION);
  const tilt = compareTilt(tt);
  return { tilt, ground: groundDeg(tilt), belted: figureAt(tilt, tt - TD, true), unbelted: figureAt(tilt, tt - TD, false) };
}

export const compare: Diagram<CompareFrame> = {
  id: "compare",
  duration: COMPARE_DURATION,
  cues: [
    { at: 0, key: "compare.c1" },
    { at: HOLD, key: "compare.c2" },
    { at: 5.2, key: "compare.c3" },
    { at: 7, key: "compare.c4" },
  ],
  stills: [1, 3.4, 9.5],
  at: compareAt,
};
