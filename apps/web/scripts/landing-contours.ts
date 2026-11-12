/*
 * Landing v3 footer contour map (spec section 8.1 A5): traces the quarry's own terrainHeight() into an SVG,
 * with marching squares, so the footer wordmark is drawn from the same function that builds the 3D scene.
 *
 *   pnpm --filter web landing:contours          writes apps/web/public/landing/contours.svg
 *
 * Contract (spec section 8.3): <g id="map"> in map units, 1 unit = 1 m, origin at x -300, z -125 (a 600 x 250
 * window). No fill or stroke attribute on any path: every one reads custom properties of the <use> that draws it
 * (--cm --wm --cM --wM --cf --wf --tr --tw --rd --rg), because <use> clones cannot be reached by selectors.
 *
 * Lines:
 *   cM  every 8 m (one bench), cm  every 1.6 m, both offset 0.8 m so they sit on the bench toes;
 *   cf  fine "relief" lines. The interval halves wherever the ground is flat enough that the base lines
 *       would leave it empty, so each part of the map carries about the same line spacing. That is what
 *       keeps all seven letters of the wordmark filled (lead answer, spec section 16): the working floor
 *       and the bench floors are drawn at the fine scale of their own roughness, the faces at 1.6 m.
 */
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { roadPoint, terrainHeight } from "../src/components/landing/scene/terrain";
import { RING_R, TRAIL_XZ } from "../src/components/landing/scene/route";

const X0 = -300;
const X1 = 300;
const Z0 = -125;
const Z1 = 125;
const STEP = 0.6;
const BASE = 0.8; // contour levels sit at BASE + n * UNIT
const MINOR = 1.6;
const MAJOR = 8;
const KMAX = 8; // the finest tier halves the minor interval eight times: 0.00625 m
const UNIT = MINOR / 2 ** KMAX;
const TARGET_SPACING = 1.25; // metres between lines the tiers aim for
const TOLERANCE = 0.24; // Douglas-Peucker, metres (0.4 of a grid cell)
const COARSE = 1;
const MAX_GZIP = 75 * 1024;

const nx = Math.round((X1 - X0) / STEP) + 1;
const nz = Math.round((Z1 - Z0) / STEP) + 2;
const H = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = terrainHeight(X0 + i * STEP, Z0 + j * STEP);

/*
 * Fine lines trace a smoothed copy of the ground (about 3 m), not its raw metre-scale roughness. On the flat
 * floor the raw field is speckle; the smoothed one gives long flowing lines like the bench lines on the faces,
 * so every letter reads as the same kind of drawing. The interval is chosen from the smoothed slope.
 */
const G = new Float32Array(nx * nz);
const Hs = blur(blur(H, 3), 3);
for (let j = 1; j < nz - 1; j++) {
  for (let i = 1; i < nx - 1; i++) {
    const gx = (Hs[j * nx + i + 1] - Hs[j * nx + i - 1]) / (2 * STEP);
    const gz = (Hs[(j + 1) * nx + i] - Hs[(j - 1) * nx + i]) / (2 * STEP);
    G[j * nx + i] = Math.hypot(gx, gz);
  }
}
function blur(src: Float32Array, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let s = 0;
      let c = 0;
      for (let d = -r; d <= r; d++) {
        const ii = i + d;
        if (ii >= 0 && ii < nx) {
          s += src[j * nx + ii];
          c++;
        }
      }
      tmp[j * nx + i] = s / c;
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let s = 0;
      let c = 0;
      for (let d = -r; d <= r; d++) {
        const jj = j + d;
        if (jj >= 0 && jj < nz) {
          s += tmp[jj * nx + i];
          c++;
        }
      }
      out[j * nx + i] = s / c;
    }
  }
  return out;
}
const Gs = blur(blur(G, 4), 4);

/** Tier k halves the minor interval k times; the finest tier whose lines stay at least TARGET_SPACING apart. */
function tierOf(i: number, j: number): number {
  const g = (Gs[j * nx + i] + Gs[j * nx + i + 1] + Gs[(j + 1) * nx + i] + Gs[(j + 1) * nx + i + 1]) / 4;
  const k = Math.floor(Math.log2(MINOR / Math.max(1e-6, TARGET_SPACING * g)));
  // Negative tiers drop every other (or every fourth) minor line on very steep ground; the 8 m lines always stay.
  return Math.min(KMAX, Math.max(-COARSE, k));
}

/* ------------------------------ marching squares ------------------------------ */

const KEY = 1048576; // edge ids are below 2^20
const segA: number[] = [];
const segB: number[] = [];
const adj = new Map<number, number[]>();

function link(key: number, s: number) {
  const a = adj.get(key);
  if (a) a.push(s);
  else adj.set(key, [s]);
}
function addSeg(n: number, ea: number, eb: number, smooth: number) {
  const s = segA.length;
  const ka = (n * 2 + smooth) * KEY + ea;
  const kb = (n * 2 + smooth) * KEY + eb;
  segA.push(ka);
  segB.push(kb);
  link(ka, s);
  link(kb, s);
}

for (let j = 0; j < nz - 1; j++) {
  for (let i = 0; i < nx - 1; i++) {
    const n0 = j * nx + i;
    const tier = tierOf(i, j);
    const sm = tier >= 1 ? 1 : 0; // fine tiers trace the smoothed ground
    const F = sm ? Hs : H;
    const v0 = F[n0];
    const v1 = F[n0 + 1];
    const v2 = F[n0 + nx + 1];
    const v3 = F[n0 + nx];
    const lo = Math.min(v0, v1, v2, v3);
    const hi = Math.max(v0, v1, v2, v3);
    const stepN = 2 ** (KMAX - Math.max(0, tier));
    const thin = tier < 0 ? 2 ** -tier : 1; // keep every thin-th minor line
    let n = Math.ceil((lo - BASE) / UNIT / stepN) * stepN;
    if (BASE + n * UNIT <= lo) n += stepN;
    // Edge ids: horizontal edge from node a = 2a, vertical edge from node a = 2a + 1.
    const e0 = 2 * n0;
    const e1 = 2 * (n0 + 1) + 1;
    const e2 = 2 * (n0 + nx);
    const e3 = 2 * n0 + 1;
    for (; BASE + n * UNIT <= hi; n += stepN) {
      if (thin > 1 && (n / stepN) % thin !== 0 && n % (MAJOR / UNIT) !== 0) continue;
      const L = BASE + n * UNIT;
      const c = (v0 >= L ? 1 : 0) | (v1 >= L ? 2 : 0) | (v2 >= L ? 4 : 0) | (v3 >= L ? 8 : 0);
      switch (c) {
        case 1: case 14: addSeg(n, e3, e0, sm); break;
        case 2: case 13: addSeg(n, e0, e1, sm); break;
        case 3: case 12: addSeg(n, e3, e1, sm); break;
        case 4: case 11: addSeg(n, e1, e2, sm); break;
        case 6: case 9: addSeg(n, e0, e2, sm); break;
        case 7: case 8: addSeg(n, e3, e2, sm); break;
        case 5: {
          if ((v0 + v1 + v2 + v3) / 4 >= L) { addSeg(n, e0, e1, sm); addSeg(n, e2, e3, sm); } else { addSeg(n, e3, e0, sm); addSeg(n, e1, e2, sm); }
          break;
        }
        case 10: {
          if ((v0 + v1 + v2 + v3) / 4 >= L) { addSeg(n, e3, e0, sm); addSeg(n, e1, e2, sm); } else { addSeg(n, e0, e1, sm); addSeg(n, e2, e3, sm); }
          break;
        }
        default: break;
      }
    }
  }
}

function point(key: number): [number, number] {
  const nk = Math.floor(key / KEY);
  const n = Math.floor(nk / 2);
  const F = nk - n * 2 === 1 ? Hs : H;
  const edge = key - nk * KEY;
  const node = edge >> 1;
  const i = node % nx;
  const j = (node - i) / nx;
  const L = BASE + n * UNIT;
  const va = F[node];
  const vertical = (edge & 1) === 1;
  const vb = vertical ? F[node + nx] : F[node + 1];
  const t = (L - va) / (vb - va);
  const x = X0 + (i + (vertical ? 0 : t)) * STEP;
  const z = Z0 + (j + (vertical ? t : 0)) * STEP;
  return [x - X0, z - Z0];
}

function chains(): Array<{ n: number; smooth: boolean; pts: Array<[number, number]> }> {
  const seen = new Uint8Array(segA.length);
  const out: Array<{ n: number; smooth: boolean; pts: Array<[number, number]> }> = [];
  const other = (key: number, s: number) => {
    const list = adj.get(key);
    if (!list) return -1;
    for (const t of list) if (t !== s && !seen[t]) return t;
    return -1;
  };
  for (let s0 = 0; s0 < segA.length; s0++) {
    if (seen[s0]) continue;
    seen[s0] = 1;
    const keys: number[] = [segA[s0], segB[s0]];
    // Walk forward from the tail, then backward from the head.
    for (let dir = 0; dir < 2; dir++) {
      for (;;) {
        const end = dir === 0 ? keys[keys.length - 1] : keys[0];
        const list = adj.get(end);
        let next = -1;
        if (list) for (const t of list) if (!seen[t]) { next = t; break; }
        if (next < 0) break;
        seen[next] = 1;
        const nk = segA[next] === end ? segB[next] : segA[next];
        if (dir === 0) keys.push(nk);
        else keys.unshift(nk);
      }
    }
    void other;
    const nk = Math.floor(keys[0] / KEY);
    out.push({ n: Math.floor(nk / 2), smooth: nk - Math.floor(nk / 2) * 2 === 1, pts: keys.map(point) });
  }
  return out;
}

/** Douglas-Peucker on a polyline (iterative, so long loops do not overflow the stack). */
function simplify(pts: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let dmax = 0;
    let idx = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = len === 0 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (idx >= 0 && dmax > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const r1 = (v: number) => Math.round(v * 10);
/** SVG path data, absolute start then relative steps in tenths of a metre written as decimals. */
function pathData(lines: Array<Array<[number, number]>>): string {
  const parts: string[] = [];
  const f = (v: number) => {
    const s = (v / 10).toFixed(1).replace(/\.0$/, "").replace(/^(-?)0\./, "$1.");
    return s === "-0" || s === "" ? "0" : s;
  };
  for (const pts of lines) {
    let px = r1(pts[0][0]);
    let py = r1(pts[0][1]);
    let d = `M${f(px)},${f(py)}l`;
    const seg: string[] = [];
    for (let i = 1; i < pts.length; i++) {
      const x = r1(pts[i][0]);
      const y = r1(pts[i][1]);
      if (x === px && y === py) continue;
      seg.push(`${f(x - px)},${f(y - py)}`);
      px = x;
      py = y;
    }
    if (seg.length === 0) continue;
    d += seg.join(" ");
    parts.push(d);
  }
  return parts.join("");
}

/* ------------------------------ build the map ------------------------------ */

const classify = (n: number): "cM" | "cm" | "cf" => {
  const m = ((n % (MINOR / UNIT)) + MINOR / UNIT) % (MINOR / UNIT);
  if (m !== 0) return "cf";
  const M = ((n % (MAJOR / UNIT)) + MAJOR / UNIT) % (MAJOR / UNIT);
  return M === 0 ? "cM" : "cm";
};

const bucket: Record<"cM" | "cm" | "cf", Array<Array<[number, number]>>> = { cM: [], cm: [], cf: [] };
let totalLen = 0;
const letters: Array<{ name: string; x0: number; x1: number; len: number }> = [];
for (const [name, a, b] of [
  ["S", 40, 205],
  ["P", 235, 400],
  ["O", 430, 600],
  ["T", 625, 805],
  ["T2", 830, 1005],
  ["E", 1035, 1190],
  ["R", 1220, 1395],
] as Array<[string, number, number]>) letters.push({ name, x0: a / 2.4, x1: b / 2.4, len: 0 });
// The wordmark's rows in map units (footer mockup: glyphs from plate y 158 to 438, map shifted -20 px at scale 2.4).
const LZ0 = (158 + 20) / 2.4;
const LZ1 = (438 + 20) / 2.4;

for (const ch of chains()) {
  // Smoothed fine lines are drawn in the bench-line class, so flat and steep ground carry the same kind of line.
  const cls = ch.smooth ? "cm" : classify(ch.n);
  const pts = simplify(ch.pts, TOLERANCE);
  if (pts.length < (cls === "cf" ? 6 : 4)) continue;
  bucket[cls].push(pts);
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    totalLen += len;
    const mx = (pts[i][0] + pts[i - 1][0]) / 2;
    const mz = (pts[i][1] + pts[i - 1][1]) / 2;
    if (mz >= LZ0 && mz <= LZ1) for (const l of letters) if (mx >= l.x0 && mx <= l.x1) l.len += len;
  }
}

/* Trail, road and rings. */
const trailCurve = new THREE.CatmullRomCurve3(
  TRAIL_XZ.map(([x, z]) => new THREE.Vector3(x, terrainHeight(x, z) + 0.2, z)),
  false,
  "centripetal",
);
const trail = trailCurve.getPoints(240).map((v) => [v.x - X0, v.z - Z0] as [number, number]);
const road: Array<[number, number]> = [];
for (let i = 0; i <= 60; i++) {
  const p = roadPoint(i / 60);
  road.push([p.x - X0, p.z - Z0]);
}
for (const x of [-44, -30, -14, -2]) road.push([x - X0, -5.4 - Z0]);

const sty = (c: string, w: string, extra = "") => `fill:none;stroke:var(--${c},none);stroke-width:var(--${w},0)${extra}`;
const svg: string[] = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${X1 - X0} ${Z1 - Z0}" preserveAspectRatio="xMidYMid slice">`);
svg.push(`<g id="map">`);
svg.push(`<path class="cf" style="${sty("cf", "wf")}" d="${pathData(bucket.cf)}"/>`);
svg.push(`<path class="cm" style="${sty("cm", "wm")}" d="${pathData(bucket.cm)}"/>`);
svg.push(`<path class="cM" style="${sty("cM", "wM")}" d="${pathData(bucket.cM)}"/>`);
svg.push(`<path class="road" style="${sty("rd", "rdw", ";stroke-dasharray:2 1.6")}" d="${pathData([road])}"/>`);
for (const r of RING_R) svg.push(`<circle class="ring" style="fill:none;stroke:var(--rg,none);stroke-width:0.3" cx="${-X0}" cy="${-Z0}" r="${r}"/>`);
svg.push(`<path class="trail" style="${sty("tr", "tw", ";stroke-linecap:round;stroke-linejoin:round")}" d="${pathData([trail])}"/>`);
svg.push(`</g>`);
svg.push(`</svg>`);
// The road's width has no contract variable of its own: it reads --rd for colour and a fixed 0.5.
const text = svg.join("\n").replace("stroke-width:var(--rdw,0)", "stroke-width:0.5");

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../public/landing/contours.svg");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
const gz = gzipSync(text, { level: 9 }).length;
const dens = letters.map((l) => ({ name: l.name, perM2: l.len / ((l.x1 - l.x0) * (LZ1 - LZ0)) }));
const hi = Math.max(...dens.map((d) => d.perM2));
const lo = Math.min(...dens.map((d) => d.perM2));
console.log(`contours.svg  ${(text.length / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzip (limit ${MAX_GZIP / 1024} KB)`);
console.log(`lines  cM ${bucket.cM.length}  cm ${bucket.cm.length}  cf ${bucket.cf.length}   total length ${(totalLen / 1000).toFixed(1)} km`);
console.log(`line length per letter box (m per m2): ${dens.map((d) => `${d.name} ${d.perM2.toFixed(3)}`).join("  ")}   ratio max/min ${(hi / lo).toFixed(2)}`);
console.log(`sha1 ${createHash("sha1").update(text).digest("hex").slice(0, 10)}`);
if (gz > MAX_GZIP) {
  console.error("over the gzip budget");
  process.exitCode = 1;
}
