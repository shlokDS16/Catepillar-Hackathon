import { clamp, easeInOut, lerp, seg, type Diagram } from "./core";

/**
 * Diagram (c), HOW/EXAMPLE card: a plan view of an excavator. The dashed swing radius, the blind
 * cones (rear and the side away from the cab), the machine swinging, and a person walking in:
 * inside the ring and a cone, the operator cannot see them.
 */
export const C = { x: 180, y: 112 }; // machine centre
export const RING_R = 58; // swing radius
export const CONE_R = 104; // how far a blind cone reaches
export const CONE_HALF = 32; // half-angle of a cone, degrees
export const SWING_END = 70; // degrees, clockwise
/** Cone axes in the upper structure's frame, degrees clockwise from screen-right: rear (down) and the side away from the cab (right). */
export const CONE_AXES = [90, 0] as const;

export type Pt = { x: number; y: number };
export type BlindFrame = {
  ring: number; // 0..1 how much of the swing ring is drawn
  cones: number; // 0..1 cone opacity/reveal
  swing: number; // degrees
  worker: Pt;
  inRing: boolean;
  inCone: boolean;
};

export const BLIND_DURATION = 11;
export const WORKER_FROM: Pt = { x: 300, y: 196 };
export const WORKER_TO: Pt = { x: 211, y: 150 };

const deg = (r: number) => (r * 180) / Math.PI;
const wrap = (d: number) => ((d % 360) + 540) % 360 - 180;

/** True when point p lies in a blind cone of the upper structure swung by `swing` degrees. */
export function inBlindCone(p: Pt, swing: number): boolean {
  const dx = p.x - C.x;
  const dy = p.y - C.y;
  if (Math.hypot(dx, dy) > CONE_R) return false;
  const a = deg(Math.atan2(dy, dx));
  return CONE_AXES.some((axis) => Math.abs(wrap(a - (axis + swing))) <= CONE_HALF);
}

export const inSwingRing = (p: Pt) => Math.hypot(p.x - C.x, p.y - C.y) <= RING_R;

export function blindAt(t: number): BlindFrame {
  const tt = clamp(t, 0, BLIND_DURATION);
  const swing = SWING_END * easeInOut(seg(tt, 5, 8.5));
  const k = seg(tt, 4.2, 7.8);
  const worker = { x: lerp(WORKER_FROM.x, WORKER_TO.x, k), y: lerp(WORKER_FROM.y, WORKER_TO.y, k) };
  return { ring: seg(tt, 1.2, 3), cones: seg(tt, 3.4, 4.6), swing, worker, inRing: inSwingRing(worker), inCone: inBlindCone(worker, swing) };
}

export const blindspot: Diagram<BlindFrame> = {
  id: "blindspot",
  duration: BLIND_DURATION,
  cues: [
    { at: 0, key: "blindspot.c1" },
    { at: 1.2, key: "blindspot.c2" },
    { at: 3.4, key: "blindspot.c3" },
    { at: 5, key: "blindspot.c4" },
    { at: 8.5, key: "blindspot.c5" },
  ],
  stills: [2.6, 5.6, 10.5],
  at: blindAt,
};
