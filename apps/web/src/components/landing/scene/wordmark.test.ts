import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_BOX, GRID, RISE, TILT_DONE, boxBlur, buildHeightfield, findPerch, mountWordmark, sampleHeight, wordmarkPose } from "./wordmark";
import { wordmarkTrail } from "./wordmark-path";

/* Pure parts of the 3D footer wordmark: no WebGL, no DOM. */

const { w, h } = GRID;
/** A solid bar across the middle of the grid, 60 cells wide and 100 tall. */
function bar(): Float32Array {
  const m = new Float32Array(w * h);
  for (let j = 75; j < 175; j++) for (let i = 270; i < 330; i++) m[j * w + i] = 1;
  return m;
}
/** A ring, like the O. */
function ring(): Float32Array {
  const m = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const d = Math.hypot(i - 300, (j - 125) * 0.9);
      if (d < 70 && d > 38) m[j * w + i] = 1;
    }
  }
  return m;
}

describe("heightfield (landing wordmark)", () => {
  const hf = buildHeightfield(bar(), w, h);

  it("has one height per grid cell and values in range", () => {
    expect(hf.heights.length).toBe(w * h);
    expect(hf.letter.length).toBe(w * h);
    expect(hf.letter.reduce((a, b) => Math.min(a, b), 1)).toBeGreaterThanOrEqual(0);
    expect(hf.letter.reduce((a, b) => Math.max(a, b), 0)).toBeLessThanOrEqual(1);
    expect(hf.heights.every(Number.isFinite)).toBe(true);
  });

  it("raises the glyph by the three benches over the ground", () => {
    const total = RISE[0] + RISE[1] + RISE[2];
    const inside = hf.rise[125 * w + 300];
    const outside = hf.rise[125 * w + 40];
    expect(outside).toBeCloseTo(0, 6);
    expect(inside).toBeCloseTo(total, 1);
    // Height itself follows: the bar top stands clearly above the ground beside it.
    expect(hf.heights[125 * w + 300] - hf.heights[125 * w + 150]).toBeGreaterThan(total - 6);
  });

  it("steps up in three terraces across a flank, never down", () => {
    const row = 125;
    const levels = new Set<number>();
    let prev = -1;
    for (let i = 200; i <= 300; i++) {
      const r = hf.rise[row * w + i];
      expect(r).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = r;
      levels.add(Math.round(r * 2) / 2);
    }
    // Plateaus near each cumulative bench height.
    for (const plateau of [0, RISE[0], RISE[0] + RISE[1], RISE[0] + RISE[1] + RISE[2]]) {
      expect([...levels].some((v) => Math.abs(v - plateau) <= 0.5)).toBe(true);
    }
  });

  it("is deterministic and bilinear lookups return the grid value at a node", () => {
    const again = buildHeightfield(bar(), w, h);
    expect(again.heights[12345]).toBe(hf.heights[12345]);
    const x = (300 / (w - 1) - 0.5) * GRID.width;
    const z = (125 / (h - 1) - 0.5) * GRID.depth;
    expect(sampleHeight(hf, x, z)).toBeCloseTo(hf.heights[125 * w + 300], 3);
  });

  it("finds the top of a stroke to park the machine on", () => {
    const p = findPerch(ring(), w, h, 300);
    expect(p).not.toBeNull();
    // The ring's top stroke lies above the centre row (z < 0), at the column asked for.
    expect((p as { x: number; z: number }).z).toBeLessThan(0);
    expect((p as { x: number }).x).toBeCloseTo((300 / (w - 1) - 0.5) * GRID.width, 6);
    expect(findPerch(new Float32Array(w * h), w, h, 300)).toBeNull();
  });

  it("box blur keeps the mass of a constant field", () => {
    const flat = new Float32Array(w * h).fill(0.7);
    expect(boxBlur(flat, w, h, 5)[1234]).toBeCloseTo(0.7, 5);
  });
});

describe("camera pose by progress", () => {
  it("looks straight down at 0, tilts to a low oblique by TILT_DONE and holds to 1", () => {
    const a = wordmarkPose(0, 2.5);
    const b = wordmarkPose(TILT_DONE, 2.5);
    const c = wordmarkPose(1, 2.5);
    expect(a.position[1] - a.target[1]).toBeGreaterThan(Math.hypot(a.position[0] - a.target[0], a.position[2] - a.target[2]) * 20); // near vertical
    const lift = (b.position[1] - b.target[1]) / Math.hypot(b.position[0] - b.target[0], b.position[2] - b.target[2]);
    expect(lift).toBeGreaterThan(1); // steeper than 45 degrees: tops read as letters
    expect(lift).toBeLessThan(1.6); // but still oblique: sides read as relief
    expect(c.position).toEqual(b.position);
    expect(c.target).toEqual(b.target);
  });

  it("only ever tilts further as progress grows", () => {
    let prev = Infinity;
    for (let p = 0; p <= 1; p += 0.02) {
      const pose = wordmarkPose(p, 2.5);
      const ratio = pose.position[1] / Math.max(1e-6, pose.position[2] - pose.target[2]);
      expect(ratio).toBeLessThanOrEqual(prev + 1e-9);
      prev = ratio;
    }
  });

  it("stands further back on a narrower frame so the whole word fits", () => {
    expect(wordmarkPose(0, 1.3).position[1]).toBeGreaterThan(wordmarkPose(0, 2.6).position[1]);
  });
});

describe("trail path", () => {
  it("runs across the whole word, first letter to last, inside the window", () => {
    const t = wordmarkTrail();
    expect(t[0][0]).toBeLessThan(-125);
    expect(t[t.length - 1][0]).toBeGreaterThan(125);
    for (const [x, z] of t) {
      expect(Math.abs(x)).toBeLessThanOrEqual(GRID.width / 2);
      expect(Math.abs(z)).toBeLessThanOrEqual(GRID.depth / 2);
    }
  });
});

describe("mountWordmark API", () => {
  const canvas = {} as HTMLCanvasElement;

  it("renders nothing, and does not touch the DOM, for phones and reduced motion", async () => {
    for (const opts of [
      { reducedMotion: true, compact: false },
      { reducedMotion: false, compact: true },
    ]) {
      const ctl = await mountWordmark(canvas, opts);
      expect(Object.keys(ctl).sort()).toEqual(["dispose", "resize", "setProgress"]);
      ctl.setProgress(0.4);
      ctl.resize();
      ctl.dispose();
      ctl.dispose(); // idempotent
    }
  });
});

describe("camera framing (review: R cut off at the right edge)", () => {
  it("keeps every corner of the word box inside the frame with at least 6 % margin, at any aspect and progress", () => {
    const cam = new THREE.PerspectiveCamera();
    const v = new THREE.Vector3();
    for (const [cw, ch] of [[1440, 600], [1024, 480], [750, 330], [1920, 600]]) {
      for (let p = 0; p <= 1.0001; p += 0.1) {
        const pose = wordmarkPose(p, cw / ch);
        cam.fov = pose.fov;
        cam.aspect = cw / ch;
        cam.position.set(...pose.position);
        cam.lookAt(...pose.target);
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);
        for (const sx of [-1, 1]) for (const sz of [-DEFAULT_BOX.z, DEFAULT_BOX.zFront as number]) for (const y of [0, DEFAULT_BOX.h]) {
          v.set(sx * DEFAULT_BOX.x, y, sz).project(cam);
          expect(Math.abs(v.x)).toBeLessThanOrEqual(0.94);
          expect(Math.abs(v.y)).toBeLessThanOrEqual(0.94);
        }
      }
    }
  });

  it("keeps the top bench edge crisp: it follows the glyph edge, not the blur", () => {
    const hf2 = buildHeightfield(bar(), w, h);
    // The bar's left edge is at column 270: the top bench is fully up one cell inside it and fully down one cell outside.
    const row = 125;
    expect(hf2.rise[row * w + 272]).toBeGreaterThan(RISE[0] + RISE[1] + RISE[2] - 0.5);
    expect(RISE[0] + RISE[1] + RISE[2] - hf2.rise[row * w + 267]).toBeGreaterThan(RISE[2] - 0.5);
  });
});

describe("channels between letters", () => {
  it("leaves bare ground midway between two glyphs, so flank benches never fuse", () => {
    const m = new Float32Array(w * h);
    // Two bars 30 cells (15 m) apart, like neighbouring letters at 0.22 em tracking.
    for (let j = 75; j < 175; j++) {
      for (let i = 200; i < 240; i++) m[j * w + i] = 1;
      for (let i = 270; i < 310; i++) m[j * w + i] = 1;
    }
    const hf3 = buildHeightfield(m, w, h);
    expect(hf3.rise[125 * w + 255]).toBeLessThan(0.05); // the midpoint of the gap
    expect(hf3.rise[125 * w + 255 - 6]).toBeLessThan(1); // and 3 m either side is still below the first bench
  });
});
