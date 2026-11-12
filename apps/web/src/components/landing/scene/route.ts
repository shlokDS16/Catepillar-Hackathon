import * as THREE from "three";
import { S4 } from "../shift";
import { roadPoint, terrainHeight } from "./terrain";

/*
 * The haul truck's route and its stage 4 schedule as a pure module (no WebGL), so a unit test can
 * sample it against the beats in shift.ts (landing v3 spec §8.1 A3). The truck rolls down the spiral
 * haul road, runs straight along the floor beside the machine, stops at S4.closestM from the machine
 * centre, holds, and backs out. Ring 3 (12 m) is first entered at S4.warnAt; ring 4 (6 m) is never
 * entered. The schedule is expressed as "metres still to travel to the closest point" (e), a monotone
 * Hermite through the beats, so every threshold crossing lands exactly on its p.
 */

/** Ring radii in metres, outer to inner: aware, caution, warning, critical. */
export const RING_R = [26, 18, 12, 6] as const;

/** The state level for a distance to the machine: 0 outside every ring, 4 inside the critical ring. */
export function ringLevel(d: number): 0 | 1 | 2 | 3 | 4 {
  if (d <= RING_R[3]) return 4;
  if (d <= RING_R[2]) return 3;
  if (d <= RING_R[1]) return 2;
  if (d <= RING_R[0]) return 1;
  return 0;
}

/** The shift's trail, in world x and z: the excavator's path in stages 3 and 5, also drawn in the footer contour map. */
export const TRAIL_XZ: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [10, -3], [22, -12], [28, -2], [21, 12], [7, 20], [-11, 22], [-25, 12],
  [-25, -8], [-11, -15], [-3, -6], [0, 0],
];

/** The excavator's rest position in stages 4 and 5 (the end of the trail), in world x and z. */
export const MACHINE_XZ = [0, 0] as const;
/** The route runs along this z on the working floor (the straight part of the haul road). */
export const FLOOR_ROAD_Z = -5.4;

export type Route = {
  curve: THREE.CatmullRomCurve3;
  /** Total length in metres. */
  length: number;
  /** Metres from the end of the route (the closest point) at which the front is `d` metres from the machine. */
  eFor: (d: number) => number;
};

let cached: Route | null = null;

export function getRoute(): Route {
  if (cached) return cached;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const p = roadPoint(0.6 + (0.4 * i) / 12);
    pts.push(new THREE.Vector3(p.x, 0, p.z));
  }
  // The last point is where the front sits at the closest approach: S4.closestM from the machine centre.
  const endX = -Math.sqrt(S4.closestM * S4.closestM - FLOOR_ROAD_Z * FLOOR_ROAD_Z);
  for (const x of [-34, -22, -12, endX]) pts.push(new THREE.Vector3(x, 0, FLOOR_ROAD_Z));
  for (const p of pts) p.y = terrainHeight(p.x, p.z);
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  curve.arcLengthDivisions = 4000;
  const length = curve.getLength();
  const tmp = new THREE.Vector3();
  const distAt = (e: number) => {
    curve.getPointAt(Math.min(1, Math.max(0, 1 - e / length)), tmp);
    return Math.hypot(tmp.x - MACHINE_XZ[0], tmp.z - MACHINE_XZ[1]);
  };
  const eFor = (d: number) => {
    // d grows with e along the straight floor section, so a bisection finds the crossing.
    let lo = 0;
    let hi = 42;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (distAt(mid) < d) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  cached = { curve, length, eFor };
  return cached;
}

/** Monotone cubic Hermite (Fritsch-Carlson) through (xs, ys) with explicit end slopes. */
function pchip(xs: number[], ys: number[], x: number, d0: number, dn: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const h: number[] = [];
  const del: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    del.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = d0;
  m[n - 1] = dn;
  for (let i = 1; i < n - 1; i++) {
    if (del[i - 1] * del[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]);
    }
  }
  let k = 0;
  while (k < n - 2 && x >= xs[k + 1]) k++;
  const t = (x - xs[k]) / h[k];
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h[k] * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h[k] * m[k + 1];
}

/** How far the truck's front still has to go to its closest point, in metres, at stage 4 progress p. */
export function truckToGo(p: number): number {
  const r = getRoute();
  const e12 = r.eFor(RING_R[2]);
  const e18 = r.eFor(RING_R[1]);
  const e26 = r.eFor(RING_R[0]);
  const eFar = r.eFor(40);
  const [inStart, closeFrom] = S4.truckIn;
  // The retreat starts shortly before S4.caution so the front crosses the 12 m ring exactly there.
  const backFrom = S4.caution - 0.06;
  if (p <= closeFrom) {
    // Approach: down the haul road, slowing to a creep as it nears the machine.
    const xs = [inStart, 0.22, 0.3, S4.warnAt, closeFrom];
    const ys = [r.length, eFar, e18, e12, 0];
    return pchip(xs, ys, p, 0, 0);
  }
  if (p <= backFrom) return 0;
  // Retreat: 12 m at S4.caution, 18 m at S4.clear, beyond the outer ring by the end of the band.
  return pchip([backFrom, S4.caution, S4.clear, 1], [0, e12, e18, e26 + 3], p, 0, (e26 + 3 - e18) / (1 - S4.clear));
}

/** The route parameter (0..1 by arc length) of the truck's front at stage 4 progress p. */
export function truckF(p: number): number {
  const r = getRoute();
  return Math.min(1, Math.max(0, 1 - truckToGo(p) / r.length));
}

/** Distance in metres from the truck's front to the machine centre at stage 4 progress p. */
export function truckDistance(p: number): number {
  const r = getRoute();
  const v = r.curve.getPointAt(truckF(p));
  return Math.hypot(v.x - MACHINE_XZ[0], v.z - MACHINE_XZ[1]);
}
