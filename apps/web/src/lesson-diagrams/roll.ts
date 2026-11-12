import { clamp, solveTime } from "./core";

/**
 * Shared rollover physics for the seatbelt diagrams. Front view of a generic machine on a side
 * slope. Local machine coordinates have the origin at the downhill track's ground corner P, uphill
 * is negative x, up is negative y; a clockwise rotation about P lifts the uphill track and lays the
 * machine down the slope. Units are SVG user units.
 */
export const GROUND_DEG = 34; // the slope the machine stands on: steeper than the limit, so the needle crosses it on the ground
export const LIMIT_DEG = 30; // the tilt gauge limit mark
export const FINAL_DEG = 90 + GROUND_DEG; // the machine ends lying on its side along the slope
export const DETACH_DEG = 45; // an unbelted operator leaves the seat past this tilt
export const GAUGE_MAX_DEG = 60;

export const P = { x: 185, y: 135 };
export const SEAT = { x: -40, y: -48 };
const G = 260; // fall acceleration in units/s^2
const THROW = { vx: 90, vy: -40 };

const rad = (d: number) => (d * Math.PI) / 180;

/** World position of a machine-local point at tilt (degrees, clockwise about P). */
export function toWorld(local: { x: number; y: number }, tilt: number) {
  const c = Math.cos(rad(tilt));
  const s = Math.sin(rad(tilt));
  return { x: P.x + local.x * c - local.y * s, y: P.y + local.x * s + local.y * c };
}

/** Height of the slope surface at world x. */
export const groundY = (x: number) => P.y + Math.tan(rad(GROUND_DEG)) * (x - P.x);

type Throw = { from: { x: number; y: number }; landTau: number; land: { x: number; y: number } };

/** Where an unbelted operator leaves the seat, and when and where they land (constants). */
export const THROWN: Throw = (() => {
  const from = toWorld(SEAT, DETACH_DEG);
  const pos = (tau: number) => ({ x: from.x + THROW.vx * tau, y: from.y + THROW.vy * tau + 0.5 * G * tau * tau });
  let tau = 0;
  while (pos(tau).y < groundY(pos(tau).x) - 7 && tau < 5) tau += 0.005;
  return { from, landTau: tau, land: pos(tau) };
})();

export type Figure = { x: number; y: number; rot: number; thrown: boolean; landed: boolean };

/**
 * The operator at a machine tilt. Belted: rides in the seat. Unbelted: leaves the seat when the
 * tilt passes DETACH_DEG, then flies and tumbles; `sinceDetach` is seconds since that moment.
 */
export function figureAt(tilt: number, sinceDetach: number, belted: boolean): Figure {
  if (belted || sinceDetach <= 0) {
    const p = toWorld(SEAT, tilt);
    return { x: p.x, y: p.y, rot: tilt, thrown: false, landed: false };
  }
  const tau = Math.min(sinceDetach, THROWN.landTau);
  const x = THROWN.from.x + THROW.vx * tau;
  const y = THROWN.from.y + THROW.vy * tau + 0.5 * G * tau * tau;
  return { x, y, rot: DETACH_DEG + 220 * (tau / THROWN.landTau), thrown: true, landed: sinceDetach >= THROWN.landTau };
}

/** Time at which a tilt function first reaches the detach angle. */
export const detachTime = (tiltAt: (t: number) => number, hi: number) => solveTime(tiltAt, DETACH_DEG, 0, hi);

/** Ground angle drawn under the machine: it follows the tilt up to the slope, then holds. */
export const groundDeg = (tilt: number) => clamp(tilt, 0, GROUND_DEG);
