import * as THREE from "three";

/* The day's trail across the footer wordmark: a pure path (world x, z in metres), so it can be tested without WebGL. */

/** The one non-state accent (--first-light, #F1B995). */
export const TRAIL_ACCENT_HEX = "#F1B995";

const CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-136, 16], [-104, -14], [-70, 14], [-36, -12], [-2, 17], [32, -13], [66, 13], [100, -15], [136, 12],
];

/** About 1 m apart, from the first letter to the last, along a smooth snaking line. */
export function wordmarkTrail(): Array<[number, number]> {
  const curve = new THREE.CatmullRomCurve3(
    CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  return curve.getSpacedPoints(300).map((v) => [v.x, v.z] as [number, number]);
}
