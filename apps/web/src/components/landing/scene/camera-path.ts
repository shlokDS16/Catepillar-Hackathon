/*
 * Where the camera is along its waypoint path, as a pure function of the five stage progresses
 * (landing v3 spec §8.1 A1). Waypoint k sits at t = k / 5: W0 hero, W1 wide, W2 close orbit (stage 2),
 * W3 high oblique (stage 3), W4 rings (stage 4), W5 overhead (stage 5).
 *
 *   stage 1  hold the hero to p .35, then pull back to W1 by p 1
 *   stage 2  arrive at W2 over p 0-.2, hold p .2-.8
 *   stage s  (3-5) arrive over p 0-.2, hold p .2-.8, leave in p .8-1
 *
 * A move between two shots is one eased move spread over the last 20 % of the old band and the first
 * 20 % of the new one, so it is continuous across the band boundary and every shot holds for the middle
 * 60 % of its band, where the copy is read.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const win = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const inout = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const HERO_HOLD = 0.35;
export const ARRIVE = 0.2;
export const LEAVE = 0.8;
/** Orbit angle in radians that a shot builds while it holds, by waypoint index. */
export const ORBIT_RAD: readonly number[] = [0, 0, 0.5, 0.25, 0, 0];

export type CameraState = { t: number; orbit: number };

export function cameraState(ps: readonly number[]): CameraState {
  let s = 0;
  for (let i = 0; i < 5; i++) if ((ps[i] ?? 0) > 0) s = i;
  const p = ps[s] ?? 0;
  if (s === 0) return { t: inout(win(p, HERO_HOLD, 1)) / 5, orbit: 0 };

  // Position on the move into this stage's shot (waypoint s+1), if it is still arriving.
  let t = (s + 1) / 5;
  let prevOrbit = 0;
  if (p < ARRIVE) {
    // Stage 2 arrives in its own band only; later stages share the move with the end of the previous band.
    const a = s === 1 ? p / ARRIVE : (ARRIVE + p) / (2 * ARRIVE);
    const e = inout(clamp01(a));
    t = (s + e) / 5;
    prevOrbit = ORBIT_RAD[s] * (1 - e);
  } else if (p > LEAVE && s < 4) {
    t = (s + 1 + inout((p - LEAVE) / (2 * (1 - LEAVE)))) / 5;
  }
  // The orbit builds while the shot holds and unwinds with the move out of it.
  const leaveE = p > LEAVE && s < 4 ? inout((p - LEAVE) / (2 * (1 - LEAVE))) : 0;
  const orbit = prevOrbit + ORBIT_RAD[s + 1] * smoothstep(win(p, 0.1, 1)) * (1 - leaveE);
  return { t, orbit };
}
