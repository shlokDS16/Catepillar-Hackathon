import * as THREE from "three";
import { heightFog } from "./fog";

/*
 * Procedural open-pit quarry, no downloaded assets. A flat working floor in the middle, three
 * 8 m benches with steep ochre faces and flat grey floors, a spiral haul road that ramps from the
 * top bench to the floor, and a jagged highwall on the south-west side. All heights come from one
 * pure function so the trail, the rings and the truck can sit on the ground.
 * Scenery colours are literal hex because three.js needs numbers; they mirror the landing
 * scenery tokens in tokens.css.
 */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number): number {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  for (let o = 0; o < 4; o++) {
    sum += amp * vnoise(x * f, z * f);
    f *= 2;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

/* Layout, in "pit metres": x is squashed by SX so the pit is a wide ellipse. */
const SX = 0.8;
export const FLOOR_R = 38;
const BENCH_H = 8;
const FACE_START = [38, 66, 92];
const FACE_W = 6;

/* Spiral haul road: top of bench 3 (east) to the floor (west), counter-clockwise through the south. */
const ROAD_HALF = 4.6;
const ROAD_BLEND = 11;
const TH_TOP = 0.08 * Math.PI;
const TH_BOT = Math.PI + 0.1505;
const R_TOP = 104;
const R_BOT = 36;
const Y_TOP = 24;
const FLOOR_ROAD_Z = -5.4;

function polar(x: number, z: number) {
  const xs = x * SX;
  return { r: Math.hypot(xs, z), th: Math.atan2(z, xs) };
}

function wobble(th: number, x: number, z: number): number {
  return 3.5 * Math.sin(2 * th + 0.7) + 2.5 * Math.sin(5 * th + 2) + 3 * (fbm(x * 0.02 + 7, z * 0.02 + 1) - 0.5);
}

type Road = { w: number; wh: number; off: number; y: number };

/** Haul road influence at (x, z): colour weight, height weight, lateral offset and road height. */
function roadAt(x: number, z: number, pr = polar(x, z)): Road {
  let t = pr.th;
  if (t < -0.55 * Math.PI) t += 2 * Math.PI;
  const k = (t - TH_TOP) / (TH_BOT - TH_TOP);
  let w = 0;
  let wh = 0;
  let off = 99;
  let y = 0;
  if (k > -0.04 && k < 1.03 && pr.r > 30) {
    const kc = clamp(k, 0, 1);
    const rr = lerp(R_TOP, R_BOT, kc);
    off = pr.r - rr;
    const a = Math.abs(off);
    const edge = smooth(-0.04, 0.02, k) * (1 - smooth(0.99, 1.03, k));
    wh = (1 - smooth(ROAD_HALF, ROAD_HALF + ROAD_BLEND, a)) * edge;
    w = (1 - smooth(ROAD_HALF - 0.6, ROAD_HALF + 2.2, a)) * edge;
    y = Y_TOP * (1 - clamp(kc / 0.94, 0, 1));
  }
  // The straight floor section runs to the ring centre.
  const fo = z - FLOOR_ROAD_Z;
  const fa = Math.abs(fo);
  const fe = smooth(-50, -44, x) * (1 - smooth(-6, -1, x));
  const fwh = (1 - smooth(ROAD_HALF, ROAD_HALF + 7, fa)) * fe;
  const fw = (1 - smooth(ROAD_HALF - 0.6, ROAD_HALF + 2.2, fa)) * fe;
  if (fwh > wh) {
    wh = fwh;
    y = 0;
    off = fo;
  }
  w = Math.max(w, fw);
  return { w, wh, off, y };
}

/** World position of the haul road centreline at u = 0 (top) .. 1 (floor entry). */
export function roadPoint(u: number, out = new THREE.Vector3()): THREE.Vector3 {
  const th = lerp(TH_TOP, TH_BOT, u);
  const r = lerp(R_TOP, R_BOT, u);
  const x = (r * Math.cos(th)) / SX;
  const z = r * Math.sin(th);
  return out.set(x, Y_TOP * (1 - clamp(u / 0.94, 0, 1)), z);
}

/** Terrain height in metres at (x, z). The floor is y ~ 0. */
export function terrainHeight(x: number, z: number): number {
  const pr = polar(x, z);
  const rr = pr.r + wobble(pr.th, x, z) * smooth(30, 60, pr.r);
  let y = BENCH_H * (smooth(38, 38 + FACE_W, rr) + smooth(66, 66 + FACE_W, rr) + smooth(92, 92 + FACE_W, rr));
  // Faces are not perfectly planar: ledges and slumps.
  y += (fbm(x * 0.09 + 11, z * 0.09 - 5) - 0.5) * 0.6 * smooth(36, 70, pr.r);
  // Bench floors dip slightly toward the toe so water would run off.
  y -= 0.45 * smooth(0, 1, 1 - clamp((rr - 44) / 22, 0, 1)) * smooth(40, 46, rr) * smooth(70, 60, rr);
  // The rim and the highwall (south-west is the tall side; the sun side stays low and open).
  const q = smooth(112, 205, rr);
  const aw = 0.5 + 0.5 * Math.cos(pr.th - 2.4);
  const ridge = 1 - Math.abs(2 * fbm(x * 0.017 + 3, z * 0.017 + 8) - 1);
  y += 70 * q * (0.28 + 0.95 * aw) * (0.55 + 0.7 * Math.pow(ridge, 1.4));
  y += smooth(190, 330, rr) * 60 * fbm(x * 0.01 - 2, z * 0.01 + 6);
  // Small-scale roughness: tiny on the working floor, rougher on the benches.
  const d = smooth(34, 60, pr.r);
  y += (fbm(x * 0.06, z * 0.06) - 0.5) * 0.5 * (0.25 + d);
  y += (fbm(x * 0.35 + 3, z * 0.35) - 0.5) * 0.28 * (0.2 + d);
  // Cut the haul road in.
  const rd = roadAt(x, z, pr);
  if (rd.wh > 0) y = lerp(y, rd.y + (fbm(x * 0.5, z * 0.5) - 0.5) * 0.06, rd.wh);
  return y;
}

/** How close (0..1) a point is to the foot of a bench face; used for scree. */
function toeness(x: number, z: number): number {
  const pr = polar(x, z);
  const rr = pr.r + wobble(pr.th, x, z) * smooth(30, 60, pr.r);
  let t = 0;
  for (const f of FACE_START) t = Math.max(t, Math.exp(-(((rr - (f - 1.5)) / 4.5) ** 2)));
  return t;
}

export function buildTerrain(seg = 340): THREE.Mesh {
  const size = 540;
  const half = size / 2;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // Warp the grid so cells are small near the middle (the machine) and large at the far edge.
  const warp = (v: number) => Math.sign(v) * Math.pow(Math.abs(v) / half, 1.55) * half;
  for (let i = 0; i < pos.count; i++) {
    const x = warp(pos.getX(i));
    const z = warp(pos.getZ(i));
    pos.setX(i, x);
    pos.setZ(i, z);
    pos.setY(i, terrainHeight(x, z));
  }
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const floorC = new THREE.Color("#a08f78");
  const benchC = new THREE.Color("#a49680");
  const faceA = new THREE.Color("#a98866");
  const faceB = new THREE.Color("#8d7459");
  const hill = new THREE.Color("#6a6370");
  const roadC = new THREE.Color("#756e63");
  const roadDust = new THREE.Color("#b1a590");
  const c = new THREE.Color();
  const c2 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const pr = polar(x, z);
    const d = smooth(FLOOR_R, 92, pr.r);
    c.copy(floorC).lerp(benchC, d);
    c.lerp(hill, smooth(110, 230, pr.r));
    // Steep faces: ochre rock with strata bands.
    const steep = smooth(0.1, 0.42, 1 - nrm.getY(i));
    const strata = 0.5 + 0.5 * Math.sin(y * 1.9 + fbm(x * 0.03, z * 0.03) * 4);
    c2.copy(faceA).lerp(faceB, strata);
    c.lerp(c2, steep * (1 - smooth(120, 230, pr.r) * 0.7));
    // Haul road: packed grey with two darker tyre lanes and dusty shoulders.
    const rd = roadAt(x, z, pr);
    if (rd.w > 0) {
      const a = Math.abs(rd.off);
      const lane = Math.exp(-(((a - 1.7) / 0.55) ** 2)) * 0.32;
      c2.copy(roadC).lerp(roadDust, smooth(2.2, ROAD_HALF + 1, a) * 0.8);
      c2.multiplyScalar(1 - lane);
      c.lerp(c2, rd.w);
    }
    const n = 0.9 + fbm(x * 0.12, z * 0.12) * 0.2 + (fbm(x * 1.1, z * 1.1) - 0.5) * 0.1;
    colors[i * 3] = c.r * n;
    colors[i * 3 + 1] = c.g * n;
    colors[i * 3 + 2] = c.b * n;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = heightFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/** About 400 boulders plus scree, in one instanced draw. */
export function buildRocks(boulders = 400, scree = 320): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pa = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const y = pa.getY(i);
    const z = pa.getZ(i);
    const n = 0.72 + vnoise(x * 2.3 + 5, y * 2.1 + z * 1.7) * 0.6;
    pa.setXYZ(i, x * n, y * n * 0.85, z * n);
  }
  geo.computeVertexNormals();
  const mat = heightFog(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true }));
  const total = boulders + scree;
  const inst = new THREE.InstancedMesh(geo, mat, total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  const palette = ["#8a7b69", "#756a5c", "#9a8566", "#6f675f", "#a08c70"];
  let seed = 1234;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return ((seed >>> 0) % 100000) / 100000;
  };
  let n = 0;
  const put = (x: number, z: number, size: number, flat: number) => {
    const y = terrainHeight(x, z);
    e.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5);
    q.setFromEuler(e);
    s.set(size * (0.8 + rnd() * 0.5), size * flat * (0.6 + rnd() * 0.5), size * (0.8 + rnd() * 0.5));
    p.set(x, y - size * flat * 0.1, z);
    m.compose(p, q, s);
    inst.setMatrixAt(n, m);
    col.set(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.8 + rnd() * 0.3);
    inst.setColorAt(n, col);
    n++;
  };
  // Boulders: mostly at bench toes and the pit edge, a few on the road shoulders.
  let tries = 0;
  while (n < boulders - 60 && tries++ < 40000) {
    const th = rnd() * Math.PI * 2;
    const r = 34 + rnd() * 80;
    const x = (r * Math.cos(th)) / SX;
    const z = r * Math.sin(th);
    if (rnd() > 0.04 + toeness(x, z) * 0.96) continue;
    const rd = roadAt(x, z);
    if (rd.w > 0.15) continue;
    put(x, z, 0.5 + Math.pow(rnd(), 2.2) * 2.3, 0.75);
  }
  for (let i = 0; i < 60; i++) {
    const u = 0.04 + rnd() * 0.9;
    const pt = roadPoint(u);
    const side = rnd() < 0.5 ? -1 : 1;
    const th = lerp(TH_TOP, TH_BOT, u);
    const off = side * (ROAD_HALF + 1 + rnd() * 2.5);
    const x = pt.x + (Math.cos(th) * off) / SX;
    const z = pt.z + Math.sin(th) * off;
    put(x, z, 0.4 + Math.pow(rnd(), 2) * 1.2, 0.8);
  }
  // Scree: small stones at the toes.
  tries = 0;
  while (n < total && tries++ < 40000) {
    const th = rnd() * Math.PI * 2;
    const r = 34 + rnd() * 70;
    const x = (r * Math.cos(th)) / SX;
    const z = r * Math.sin(th);
    if (rnd() > toeness(x, z)) continue;
    if (roadAt(x, z).w > 0.1) continue;
    put(x, z, 0.12 + rnd() * 0.3, 0.8);
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.receiveShadow = true;
  return inst;
}
