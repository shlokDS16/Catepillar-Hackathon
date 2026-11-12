import { clamp, easeInOut, lerp, seg, type Diagram } from "./core";

/**
 * Diagram (c), HOW/EXAMPLE card: a plan view of an excavator. The dashed swing radius, the blind
 * cones (rear and the side away from the cab), the machine swinging, and a person walking in:
 * inside the ring and a cone, the operator cannot see them.
 */
export const C = { x: 180, y: 112 }; // machine centre
export const RING_R = 110; // swing radius: at least the arm and bucket reach (about 102)
export const CONE_R = 140; // how far a blind cone reaches
export const CONE_HALF = 32; // half-angle of a cone, degrees
export const SWING_END = 70; // degrees, clockwise
/** Where the tracks stand (x, y, w, h), for the person to keep off. */
export const TRACKS = [
  { x: C.x - 48, y: C.y - 46, w: 20, h: 92 },
  { x: C.x + 28, y: C.y - 46, w: 20, h: 92 },
] as const;
/** Distance from the centre to the bucket tip (boom 100 up, bucket 18 wide). */
export const BOOM_REACH = Math.hypot(18, 100);

/** Cone axes in the upper structure's frame, degrees clockwise from screen-right: rear (down) and the side away from the cab (right). */
export const CONE_AXES = [90, 0] as const;

export type Pt = { x: number; y: number };
export type BlindFrame = {
  ring: number; // 0..1 how much of the swing ring is drawn
  cones: number; // 0..1 cone opacity/reveal
  swing: number; // degrees
  walk: number; // 0..1 how far the person has walked
  worker: Pt;
  inRing: boolean;
  inCone: boolean;
};

export const BLIND_DURATION = 11;
export const WORKER_FROM: Pt = { x: 288, y: 216 };
export const WORKER_TO: Pt = { x: 250, y: 185 };

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
  return { ring: seg(tt, 1.2, 3), cones: seg(tt, 3.4, 4.6), swing, walk: k, worker, inRing: inSwingRing(worker), inCone: inBlindCone(worker, swing) };
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
  stills: [
    { t: 2.6, keys: ["blindspot.c1", "blindspot.c2"] },
    { t: 4.2, keys: ["blindspot.c3"] },
    { t: 10.5, keys: ["blindspot.c4", "blindspot.c5"] },
  ],
  at: blindAt,
};
