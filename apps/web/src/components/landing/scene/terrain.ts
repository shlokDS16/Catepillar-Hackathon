import * as THREE from "three";

/*
 * Procedural quarry terrain (no downloaded assets). A flat working floor in the middle, seven
 * benches stepping up to the rim, then rough hills beyond. Scenery colours are literal hex here
 * because three.js needs numbers; they mirror the landing scenery tokens in tokens.css.
 */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
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

export const FLOOR_RADIUS = 36;
const RIM = 112;
const BENCHES = 7;
const BENCH_H = 3.7;

/** Terrain height in metres at (x, z). The floor is y = 0. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x * 0.85, z);
  const d = clamp((r - FLOOR_RADIUS) / (RIM - FLOOR_RADIUS), 0, 1);
  const t = d * BENCHES;
  const k = Math.floor(t);
  const f = t - k;
  const terr = k + smooth(0.3, 0.97, f);
  let y = terr * BENCH_H;
  const far = clamp((r - RIM) / 170, 0, 1);
  y += far * far * 70 * (0.45 + fbm(x * 0.012 + 9, z * 0.012 - 4));
  y += (fbm(x * 0.06, z * 0.06) - 0.5) * 1.2 * d;
  y += (fbm(x * 0.3 + 3, z * 0.3) - 0.5) * 0.35 * (0.15 + d);
  return y;
}

export function buildTerrain(): THREE.Mesh {
  const size = 470;
  const seg = 260;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const floor = new THREE.Color("#7a6e62");
  const bench = new THREE.Color("#8c7f6b");
  const wall = new THREE.Color("#34303a");
  const hill = new THREE.Color("#4c4a64");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x * 0.85, z);
    const d = clamp((r - FLOOR_RADIUS) / (RIM - FLOOR_RADIUS), 0, 1);
    c.copy(floor).lerp(bench, smooth(0, 0.5, d));
    c.lerp(hill, smooth(RIM - 6, RIM + 90, r));
    const steep = clamp((1 - nrm.getY(i) - 0.06) * 3.2, 0, 1);
    c.lerp(wall, steep);
    const n = 0.88 + fbm(x * 0.15, z * 0.15) * 0.24 + (fbm(x * 1.2, z * 1.2) - 0.5) * 0.12;
    colors[i * 3] = c.r * n;
    colors[i * 3 + 1] = c.g * n;
    colors[i * 3 + 2] = c.b * n;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
