import * as THREE from "three";
import { buildExcavator } from "./excavator";
import { TRAIL_ACCENT_HEX, wordmarkTrail } from "./wordmark-path";
import { roadPoint, terrainHeight } from "./terrain";

/*
 * The footer wordmark as a landform: "the wordmark is the quarry". SPOTTER is drawn in the page's display font
 * onto an offscreen canvas, blurred and stepped into a heightfield (three raised benches on every flank), mixed
 * with our own terrain function and displaced onto a plane. A shader draws the contour lines on the 3D surface
 * (fract(height / interval)), so it is still the contour drawing, now with relief and real shadows. Scroll
 * progress 0..1 drives the camera: straight down at 0 (it reads as the flat contour wordmark), a low dusk
 * oblique by 0.6, held to 1. No loop: it renders when the progress or the size changes. No dependency, no
 * typeface file. Phones, coarse pointers and reduced motion get nothing: the page shows a still.
 */

export type WordmarkOptions = { reducedMotion: boolean; compact: boolean };
export type WordmarkController = { setProgress(p: number): void; resize(): void; dispose(): void };

export const WORD = "SPOTTER";
/** The heightfield grid and the world window it covers (metres, 1 unit = 1 m). */
export const GRID = { w: 600, h: 250, width: 300, depth: 125 } as const;
/** Terrain function coordinates are the world's divided by this, so the pit's benches fall under the letters. */
const TERRAIN_K = 0.8;
export const RISE = [3.2, 5, 5] as const; // the three benches of a letter flank, metres

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ------------------------------ pure heightfield ------------------------------ */

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
  for (let o = 0; o < 3; o++) {
    sum += amp * vnoise(x * f, z * f);
    f *= 2;
    amp *= 0.5;
  }
  return sum / 0.875;
}

/** Separable box blur with clamped edges. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let j = 0; j < h; j++) {
    let s = 0;
    for (let d = -r; d <= r; d++) s += src[j * w + Math.min(w - 1, Math.max(0, d))];
    for (let i = 0; i < w; i++) {
      tmp[j * w + i] = s / n;
      s += src[j * w + Math.min(w - 1, i + r + 1)] - src[j * w + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < w; i++) {
    let s = 0;
    for (let d = -r; d <= r; d++) s += tmp[Math.min(h - 1, Math.max(0, d)) * w + i];
    for (let j = 0; j < h; j++) {
      out[j * w + i] = s / n;
      s += tmp[Math.min(h - 1, j + r + 1) * w + i] - tmp[Math.max(0, j - r) * w + i];
    }
  }
  return out;
}

export type Heightfield = { w: number; h: number; heights: Float32Array; letter: Float32Array; rise: Float32Array };

/**
 * Letter mask (1 inside a glyph) to landform. The wide blur of the mask is cut into three terraces, so each
 * glyph is a mesa with three benches on its flank; our terrain function and a rolling noise are mixed in, so
 * the tops are not flat and the contour lines have something to follow.
 */
export function buildHeightfield(mask: Float32Array, w: number, h: number): Heightfield {
  const b1 = boxBlur(mask, w, h, 1); // the glyph edge itself: only anti-aliased
  const b2 = boxBlur(boxBlur(mask, w, h, 5), w, h, 5);
  const heights = new Float32Array(w * h);
  const rise = new Float32Array(w * h);
  const total = RISE[0] + RISE[1] + RISE[2];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const wx = (i / (w - 1) - 0.5) * GRID.width;
      const wz = (j / (h - 1) - 0.5) * GRID.depth;
      const b = b2[k];
      // The two lower benches are cut from the wide blur, so they fan out beyond the glyph; the top bench follows the
      // glyph edge, so the letter outline stays crisp and condensed.
      const r = RISE[0] * smooth(0.1, 0.18, b) + RISE[1] * smooth(0.3, 0.38, b) + RISE[2] * smooth(0.35, 0.65, b1[k]);
      rise[k] = r;
      const ground = Math.max(-0.4, 0.55 * terrainHeight(wx * TERRAIN_K, wz * TERRAIN_K));
      const roll = 3.6 * (fbm(wx * 0.035 + 5, wz * 0.035 - 3) - 0.5) + 1.1 * (fbm(wx * 0.13, wz * 0.13 + 9) - 0.5);
      heights[k] = ground + r + roll * (0.3 + 0.7 * (r / total));
    }
  }
  return { w, h, heights, letter: b1, rise };
}

/** Height at a world x, z by bilinear lookup. */
export function sampleHeight(hf: Heightfield, x: number, z: number): number {
  const fx = clamp01(x / GRID.width + 0.5) * (hf.w - 1);
  const fz = clamp01(z / GRID.depth + 0.5) * (hf.h - 1);
  const i = Math.min(hf.w - 2, Math.floor(fx));
  const j = Math.min(hf.h - 2, Math.floor(fz));
  const u = fx - i;
  const v = fz - j;
  const a = hf.heights[j * hf.w + i];
  const b = hf.heights[j * hf.w + i + 1];
  const c = hf.heights[(j + 1) * hf.w + i];
  const d = hf.heights[(j + 1) * hf.w + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** The top of a glyph's stroke at image column `cx`: where the machine is parked (world x, z). */
export function findPerch(mask: Float32Array, w: number, h: number, cx: number): { x: number; z: number } | null {
  const col = Math.round(cx);
  let top = -1;
  let bottom = -1;
  for (let j = 0; j < h; j++) {
    if (mask[j * w + col] > 0.5) {
      if (top < 0) top = j;
      bottom = j;
    } else if (top >= 0) break;
  }
  if (top < 0) return null;
  const j = (top + bottom) / 2;
  return { x: (col / (w - 1) - 0.5) * GRID.width, z: (j / (h - 1) - 0.5) * GRID.depth };
}

/* ------------------------------ camera ------------------------------ */

export type WordmarkPose = { position: [number, number, number]; target: [number, number, number]; fov: number };
export const TILT_DONE = 0.6;
const FOV = 22;

/** The word's bounding box in world metres: half width, half depth and height of its tallest bench. */
export type WordBox = { x: number; z: number; h: number; zFront?: number };
export const DEFAULT_BOX: WordBox = { x: 142, z: 30, h: 18, zFront: 62 };
const MARGIN = 0.07; // of the half frame, on every side

/** Bounding box of the glyphs in a mask (world units), or the default when the mask is empty. */
export function maskBox(mask: Float32Array, w: number, h: number): WordBox {
  let x0 = w;
  let x1 = -1;
  let z0 = h;
  let z1 = -1;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (mask[j * w + i] > 0.5) {
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < z0) z0 = j;
        if (j > z1) z1 = j;
      }
    }
  }
  if (x1 < 0) return DEFAULT_BOX;
  const wx = (i: number) => Math.abs((i / (w - 1) - 0.5) * GRID.width);
  const wz = (j: number) => Math.abs((j / (h - 1) - 0.5) * GRID.depth);
  return { x: Math.max(wx(x0), wx(x1)) + 4, z: Math.max(wz(z0), wz(z1)) + 4, h: RISE[0] + RISE[1] + RISE[2] + 3 };
}

const fitCam = new THREE.PerspectiveCamera(FOV, 1, 1, 5000);
const fitV = new THREE.Vector3();

/**
 * Camera for progress p: straight down at 0, a low oblique by TILT_DONE, held to 1. The distance is the smallest
 * at which the word's box (all eight corners) lies inside the frame with a 7 % margin, at any canvas aspect and
 * at every progress, so no letter is ever cut off. Pure.
 */
export function wordmarkPose(p: number, aspect: number, box: WordBox = DEFAULT_BOX): WordmarkPose {
  const t = smooth(0, TILT_DONE, clamp01(p));
  const e = t * t * (3 - 2 * t);
  const elev = THREE.MathUtils.degToRad(lerp(89, 52, e));
  const yaw = THREE.MathUtils.degToRad(lerp(0, 7, e)); // a slight turn for depth
  const front = box.zFront ?? box.z;
  const target: [number, number, number] = [0, box.h * 0.35, (front - box.z) / 2];
  const at = (R: number): [number, number, number] => [
    target[0] + Math.sin(yaw) * Math.cos(elev) * R,
    target[1] + Math.sin(elev) * R,
    target[2] + Math.cos(yaw) * Math.cos(elev) * R,
  ];
  fitCam.aspect = Math.max(0.3, aspect);
  fitCam.fov = FOV;
  fitCam.updateProjectionMatrix();
  const inside = (R: number) => {
    fitCam.position.set(...at(R));
    fitCam.up.set(0, 1, 0);
    fitCam.lookAt(target[0], target[1], target[2]);
    fitCam.updateMatrixWorld(true);
    for (const sx of [-1, 1]) {
      for (const sz of [-box.z, front]) {
        for (const y of [-0.5, box.h]) {
          fitV.set(sx * box.x, y, sz).project(fitCam);
          if (Math.abs(fitV.x) > 1 - MARGIN || Math.abs(fitV.y) > 1 - MARGIN) return false;
        }
      }
    }
    return true;
  };
  let lo = 40;
  let hi = 3000;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) hi = mid;
    else lo = mid;
  }
  return { position: at(hi), target, fov: FOV };
}

/* ------------------------------ DOM: glyph mask ------------------------------ */

type Mask = { mask: Float32Array; letters: Array<{ ch: string; cx: number }> };

async function drawMask(canvas: HTMLCanvasElement): Promise<Mask> {
  // The exact face of the landing heading (.l-h1): its computed family and weight. Until the page has one, the
  // display-font variable, then Barlow Condensed 800.
  const ref = document.querySelector<HTMLElement>(".l-h1");
  const css = ref ? getComputedStyle(ref) : null;
  const fam = css?.fontFamily || getComputedStyle(canvas).getPropertyValue("--font-barlow-condensed").trim() || '"Barlow Condensed"';
  const weight = css?.fontWeight || "800";
  try {
    await document.fonts.load(`${weight} 200px ${fam}`, WORD);
    await document.fonts.ready;
  } catch {
    // The fallback face still draws the word.
  }
  const { w, h } = GRID;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const g = off.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("no 2d context");
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff";
  g.textBaseline = "alphabetic";
  const probe = 200;
  g.font = `${weight} ${probe}px ${fam}`;
  const gap = 0.22; // of the em: a ground channel between every pair of letters, wider than a flank bench
  const widths = [...WORD].map((c) => g.measureText(c).width);
  const em = (widths.reduce((a, b) => a + b, 0) + gap * probe * (WORD.length - 1)) / probe;
  const size = (w * 0.93) / em;
  g.font = `${weight} ${size}px ${fam}`;
  const capH = g.measureText("H").actualBoundingBoxAscent || size * 0.7;
  const baseline = h / 2 + capH / 2;
  let x = (w - em * size) / 2;
  const letters: Mask["letters"] = [];
  [...WORD].forEach((ch, i) => {
    const cw = (widths[i] / probe) * size;
    g.fillText(ch, x, baseline);
    letters.push({ ch, cx: x + cw / 2 });
    x += cw + gap * size;
  });
  const data = g.getImageData(0, 0, w, h).data;
  const mask = new Float32Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4] / 255;
  return { mask, letters };
}

/* ------------------------------ scene ------------------------------ */

const INK = new THREE.Color("#16150F");
const GROUND = new THREE.Color("#24221A");
const TOP = new THREE.Color("#A79B80");

function noopController(): WordmarkController {
  return { setProgress() {}, resize() {}, dispose() {} };
}

export async function mountWordmark(canvas: HTMLCanvasElement, opts: WordmarkOptions): Promise<WordmarkController> {
  if (opts.reducedMotion || opts.compact) return noopController();
  const { mask, letters } = await drawMask(canvas);
  const hf = buildHeightfield(mask, GRID.w, GRID.h);
  const box0 = maskBox(mask, GRID.w, GRID.h);
  const MX = (letters[WORD.indexOf("O")].cx / (GRID.w - 1) - 0.5) * GRID.width + 36;
  const MZ = 44;

  const box: WordBox = { x: Math.max(box0.x, MX + 19), z: box0.z, h: Math.max(box0.h, 15), zFront: Math.min(GRID.depth / 2, MZ + 19) };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    return noopController();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(INK, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 2.5, 5, 2000);

  /* The landform. */
  const geo = new THREE.PlaneGeometry(GRID.width, GRID.depth, GRID.w - 1, GRID.h - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, hf.heights[i]);
    c.copy(GROUND).lerp(TOP, hf.letter[i]);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aLetter", new THREE.BufferAttribute(hf.letter, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uni = {
    uPaper: { value: new THREE.Vector3(0.949, 0.941, 0.918) },
    uInk: { value: new THREE.Vector3(0.086, 0.082, 0.059) },
    uOutline: { value: 1 },
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPaper = uni.uPaper;
    shader.uniforms.uInk = uni.uInk;
    shader.uniforms.uOutline = uni.uOutline;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aLetter;\nvarying float vLetter;\nvarying float vH;\nvarying vec2 vXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLetter = aLetter; vH = position.y; vXZ = position.xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vLetter; varying float vH; varying vec2 vXZ;
        uniform vec3 uPaper; uniform vec3 uInk; uniform float uOutline;
        // One contour family: a line every I metres of height, antialiased in pixels, and faded out where the
        // lines would crowd below 4 px, so steep flanks keep the coarse lines and flat tops the fine ones.
        float contour(float h, float I, float hw) {
          float x = h / I;
          float fw = max(fwidth(x), 1e-5);
          float d = abs(fract(x - 0.5) - 0.5) / fw;
          float line = 1.0 - smoothstep(hw - 0.6, hw + 0.6, d);
          return line * (1.0 - smoothstep(0.16, 0.32, fw));
        }`,
      )
      .replace(
        "#include <dithering_fragment>",
        `float lf = clamp(vLetter, 0.0, 1.0);
        float lines = max(max(contour(vH, 8.0, 1.5) * 1.0, contour(vH, 1.6, 0.8) * 0.75), max(contour(vH, 0.4, 0.55) * 0.42, contour(vH, 0.1, 0.5) * 0.24));
        float amt = lines * mix(0.2, 1.0, lf);
        // The glyph outline: strongest in the top-down view, where it is the flat wordmark edge.
        float ow = fwidth(vLetter);
        amt = max(amt, (1.0 - smoothstep(0.7, 1.9, abs(vLetter - 0.5) / max(ow, 1e-5))) * 0.55 * uOutline);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uPaper, amt);
        // The window's edge dissolves into the page's ink.
        float edge = min(smoothstep(0.0, 14.0, ${(GRID.width / 2).toFixed(1)} - abs(vXZ.x)), smoothstep(0.0, 26.0, ${(GRID.depth / 2).toFixed(1)} - abs(vXZ.y)));
        gl_FragColor.rgb = mix(uInk, gl_FragColor.rgb, edge);
        #include <dithering_fragment>`,
      );
  };
  const land = new THREE.Mesh(geo, mat);
  land.castShadow = true;
  land.receiveShadow = true;
  scene.add(land);

  /* Light: a long dusk sun from the west, a cool fill. */
  const hemi = new THREE.HemisphereLight(0x8d96b8, 0x2a281f, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xf1b995, 0);
  const sunDir = new THREE.Vector3(-0.8, 0.26, 0.55).normalize();
  sun.castShadow = true;
  const big = renderer.capabilities.maxTextureSize >= 4096 ? 4096 : 2048;
  sun.shadow.mapSize.set(big, big);
  const sc = sun.shadow.camera;
  sc.left = -185;
  sc.right = 185;
  sc.top = 120;
  sc.bottom = -120;
  sc.near = 10;
  sc.far = 600;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);
  sun.position.copy(sunDir).multiplyScalar(300);

  /* The machine, parked on the O. */
  const exc = buildExcavator();
  exc.group.scale.setScalar(3.6);
  const oi = WORD.indexOf("O");
  // Parked on the ground in front of the word, just right of the O, on the haul road: it never covers a top face.
  exc.group.position.set(MX, sampleHeight(hf, MX, MZ), MZ);
  exc.group.rotation.y = -0.7; // three-quarter to the oblique camera
  exc.setPose({ boom: 0.55, stick: -1.85, bucket: -0.3 });
  exc.house.rotation.y = 0.35;
  exc.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  scene.add(exc.group);

  /* The day's trail across the letters, and the haul road as a dashed line. */
  const trailPts = wordmarkTrail().map(([x, z]) => new THREE.Vector3(x, sampleHeight(hf, x, z) + 0.8, z));
  const trailCurve = new THREE.CatmullRomCurve3(trailPts, false, "centripetal");
  const TUBE = 900;
  const trailGeo = new THREE.TubeGeometry(trailCurve, TUBE, 0.42, 5, false);
  const trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(TRAIL_ACCENT_HEX), toneMapped: false });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);

  const roadPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 160; i++) {
    const r = roadPoint(i / 160);
    const x = r.x / TERRAIN_K;
    const z = r.z / TERRAIN_K;
    if (Math.abs(x) < GRID.width / 2 - 6 && Math.abs(z) < GRID.depth / 2 - 6) roadPts.push(new THREE.Vector3(x, sampleHeight(hf, x, z) + 0.6, z));
  }
  const roadGeo = new THREE.BufferGeometry().setFromPoints(roadPts);
  const roadMat = new THREE.LineDashedMaterial({ color: 0xb9b5aa, dashSize: 3.2, gapSize: 2.6, transparent: true, opacity: 0.75 });
  const road = new THREE.Line(roadGeo, roadMat);
  road.computeLineDistances();
  scene.add(road);

  /* State. */
  let progress = 0;
  let raf = 0;
  let disposed = false;
  const look = new THREE.Vector3();

  function draw() {
    raf = 0;
    if (disposed) return;
    const w = canvas.clientWidth || 1440;
    const h = canvas.clientHeight || 600;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    const aspect = w / h;
    camera.aspect = aspect;
    const pose = wordmarkPose(progress, aspect, box);
    camera.position.set(...pose.position);
    look.set(...pose.target);
    camera.lookAt(look);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    // The sun comes up with the tilt: the top-down view reads as the flat drawing, the oblique as the landform.
    const light = smooth(0.1, TILT_DONE, progress);
    uni.uOutline.value = lerp(1, 0.25, light);
    sun.intensity = lerp(0.0, 3.3, light);
    hemi.intensity = lerp(1.7, 0.55, light);
    // The trail is traced across the letters while the camera settles.
    const drawn = smooth(0.25, 0.95, progress);
    trailGeo.setDrawRange(0, Math.floor(drawn * TUBE) * 5 * 6);
    trail.visible = drawn > 0.002;
    renderer.render(scene, camera);
  }
  const schedule = () => {
    if (!raf && !disposed) raf = requestAnimationFrame(draw);
  };

  schedule();
  return {
    setProgress(p) {
      const next = clamp01(Number.isFinite(p) ? p : 0);
      if (next === progress) return;
      progress = next;
      schedule();
    },
    resize() {
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mt = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
        else mt?.dispose?.();
      });
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
