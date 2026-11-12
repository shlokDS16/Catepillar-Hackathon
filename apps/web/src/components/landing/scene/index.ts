import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildExcavator, type Pose } from "./excavator";
import { buildHaulTruck } from "./truck";
import { buildRocks, buildTerrain, roadPoint, terrainHeight } from "./terrain";

/*
 * One three.js renderer for stages 1-5 (dossier §4, landing v2 spec "Scene"). Loaded by dynamic
 * import, so three.js is not in the initial bundle. Everything is procedural. Budget rules: DPR
 * capped at 1.5, antialias only below 1.5, a governor that steps the pixel ratio down after 30 slow
 * frames, one rAF that the engine starts and stops with an IntersectionObserver, no post pass.
 */

export type SceneOptions = {
  /** Reduced motion: no pulse, no dust drift, no parallax (the engine normally never creates the scene then). */
  reducedMotion?: boolean;
  /** Snap the camera instead of smoothing (posters and tests). */
  snap?: boolean;
  onRing?: (level: number) => void;
  onReady?: () => void;
};

/** A screen-space point in CSS pixels relative to the canvas. */
export type SceneAnchor = { x: number; y: number; visible: boolean };

export type SceneController = {
  setProgress: (ps: number[]) => void;
  setRunning: (on: boolean) => void;
  resize: () => void;
  renderOnce: () => void;
  /** The cab, the boom cylinder and the bucket, in that order. Returns the last rendered frame's points. */
  getAnchors: () => SceneAnchor[];
  dispose: () => void;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const quint = (t: number) => 1 - Math.pow(1 - t, 5);
const inout = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const win = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** Critically damped follow (the SmoothDamp form): no overshoot, no fixed per-frame lerp. */
class Damped {
  v = 0;
  constructor(public x = 0) {}
  to(target: number, smoothTime: number, dt: number) {
    if (dt <= 0) {
      this.x = target;
      this.v = 0;
      return this.x;
    }
    const omega = 2 / smoothTime;
    const k = omega * dt;
    const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = this.x - target;
    const temp = (this.v + omega * change) * dt;
    this.v = (this.v - omega * temp) * e;
    this.x = target + (change + temp) * e;
    return this.x;
  }
}

/* Ring boundaries in metres, state tokens as numbers (visual-language §1.1). */
const RINGS = [
  { r: 26, color: 0x0b6b37 },
  { r: 18, color: 0xffc700 },
  { r: 12, color: 0xff6a00 },
  { r: 6, color: 0xb3102a },
];

function ringLevel(d: number): number {
  if (d <= 6) return 4;
  if (d <= 12) return 3;
  if (d <= 18) return 2;
  if (d <= 26) return 1;
  return 0;
}

/* Dig cycle keys: [time, boom, stick, bucket, yaw]. Solved so the teeth touch the floor in front. */
const CYCLE: Array<[number, number, number, number, number]> = [
  [0.0, 0.34, -1.7, 0.16, 0],
  [0.2, 0.32, -2.04, 0.24, 0],
  [0.36, 0.46, -2.04, -0.36, 0],
  [0.5, 0.78, -1.92, -1.32, 0.85],
  [0.66, 0.7, -1.6, 0.55, 0.85],
  [0.82, 0.45, -1.75, 0.3, 0.3],
  [1.0, 0.34, -1.7, 0.16, 0],
];
const TRAVEL_POSE: Pose = { boom: 0.8, stick: -2.6, bucket: 0.16 };

function cyclePose(phase: number, out: Pose): number {
  const t = phase - Math.floor(phase);
  let i = 0;
  while (i < CYCLE.length - 2 && t >= CYCLE[i + 1][0]) i++;
  const a = CYCLE[i];
  const b = CYCLE[i + 1];
  const u = smoothstep(clamp01((t - a[0]) / (b[0] - a[0])));
  out.boom = lerp(a[1], b[1], u);
  out.stick = lerp(a[2], b[2], u);
  out.bucket = lerp(a[3], b[3], u);
  return lerp(a[4], b[4], u);
}

/** A flat annulus that hugs the terrain. `v` runs 0 (inner edge) to 1 (outer edge, the boundary). */
function annulus(r: number, width: number, segs: number, rad: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let j = 0; j <= rad; j++) {
      const rr = r - width + (width * j) / rad;
      const x = c * rr;
      const z = s * rr;
      pos.push(x, terrainHeight(x, z) + 0.16, z);
      uv.push(i / segs, j / rad);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j;
      const b = a + rad + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions = {}): SceneController {
  const compact = window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: dpr < 1.5,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  // three r187 removed PCFSoftShadowMap; PCFShadowMap is the soft-edged filter now.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 1600);

  /* Reflections: PMREM of the three.js RoomEnvironment, kept at low intensity. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRT = pmrem.fromScene(roomEnv, 0.04);
  scene.environment = envRT.texture;
  roomEnv.dispose();
  pmrem.dispose();

  /* Sky dome: blue hour to first light with a soft sun disc, horizon matches the fog. */
  const skyU = {
    uDawn: { value: 0 },
    uSun: { value: new THREE.Vector3(0.87, 0.14, -0.47).normalize() },
    uFog: { value: new THREE.Color(0.6, 0.5, 0.46) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1100, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        varying vec3 vD; uniform float uDawn; uniform vec3 uSun; uniform vec3 uFog;
        void main(){
          vec3 d = normalize(vD);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 top = mix(vec3(0.03,0.045,0.12), vec3(0.16,0.27,0.58), uDawn);
          vec3 c = mix(uFog, top, pow(h, 0.45));
          float s = max(dot(d, normalize(uSun)), 0.0);
          c += vec3(1.0,0.56,0.30) * pow(s, 5.0) * 0.55 * uDawn;
          c += vec3(1.0,0.74,0.46) * pow(s, 60.0) * 0.9 * uDawn;
          c += vec3(1.0,0.92,0.75) * smoothstep(0.9995, 0.99985, s) * 3.2 * uDawn;
          c = mix(c, uFog * 0.85, step(d.y, 0.0));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const fog = new THREE.FogExp2(0x9a8176, 0.0048);
  scene.fog = fog;

  const terrain = buildTerrain(compact ? 240 : 340);
  scene.add(terrain);
  const rocks = buildRocks(compact ? 260 : 400, compact ? 200 : 320);
  scene.add(rocks);

  /* Light: a low warm dawn sun with soft shadows, a cool hemisphere fill. */
  const hemi = new THREE.HemisphereLight(0x9fb4e6, 0x6c5a49, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb37a, 0.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(compact ? 1024 : 2048, compact ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -44;
  sc.right = 44;
  sc.top = 44;
  sc.bottom = -44;
  sc.near = 20;
  sc.far = 300;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  /* Machines. */
  const exc = buildExcavator();
  scene.add(exc.group);
  const truck = buildHaulTruck();
  truck.group.visible = false;
  truck.group.scale.setScalar(0.8);
  scene.add(truck.group);

  /* Trail: a 0.35 m tube drawn with drawRange, a glowing head, 14 cycle ticks. */
  const pts: THREE.Vector3[] = (
    [
      [0, 0], [10, -3], [22, -12], [28, -2], [21, 12], [7, 20], [-11, 22], [-25, 12],
      [-25, -8], [-11, -15], [-3, -6], [0, 0],
    ] as Array<[number, number]>
  ).map(([x, z]) => new THREE.Vector3(x, terrainHeight(x, z) + 0.2, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const curveLen = curve.getLength();
  const TUBE_SEG = 640;
  const RADIAL = 6;
  const trailGeo = new THREE.TubeGeometry(curve, TUBE_SEG, 0.175, RADIAL, false);
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xf2f0ea, transparent: true, opacity: 0.95, toneMapped: false });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  const glow = glowTexture();
  const headCore = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff6e4, toneMapped: false }));
  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, toneMapped: false }));
  headGlow.scale.setScalar(5);
  const head = new THREE.Group();
  head.add(headCore, headGlow);
  scene.add(head);
  const TICKS = 14;
  const tickGeo = new THREE.BoxGeometry(0.2, 0.08, 1.7);
  const ticks = new THREE.InstancedMesh(tickGeo, new THREE.MeshBasicMaterial({ color: 0xf2f0ea, toneMapped: false }), TICKS);
  ticks.frustumCulled = false;
  const tickPos: THREE.Vector3[] = [];
  const tickRot: number[] = [];
  for (let i = 0; i < TICKS; i++) {
    const t = (i + 0.5) / TICKS;
    const p = curve.getPointAt(t);
    const tg = curve.getTangentAt(t);
    tickPos.push(p.clone().setY(p.y + 0.02));
    tickRot.push(Math.atan2(-tg.z, tg.x));
  }
  scene.add(ticks);

  /* Guardian rings: terrain-hugging annuli with an inner glow, and the haul truck driving in. */
  const ringU = RINGS.map((rg) => ({
    uScale: { value: 1 },
    uColor: { value: new THREE.Color(rg.color) },
    uOpacity: { value: 1 },
    uGlow: { value: 0.22 },
    uLine: { value: 0.5 },
    uPulse: { value: 0 },
  }));
  const ringGroup = new THREE.Group();
  RINGS.forEach((rg, i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: ringU[i],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: "uniform float uScale; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.xz *= uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity, uGlow, uLine, uPulse; varying vec2 vUv;
        void main(){
          float v = vUv.y;
          float line = smoothstep(0.88, 0.96, v) * (1.0 - smoothstep(0.985, 1.0, v));
          float glow = pow(v, 2.4);
          float a = uOpacity * (line * uLine + glow * uGlow) * (1.0 + uPulse * 1.6);
          vec3 col = mix(uColor, vec3(1.0), line * 0.3 + uPulse * 0.4);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(annulus(rg.r, Math.min(6, rg.r), 168, 6), mat);
    m.frustumCulled = false;
    m.renderOrder = 2 + i;
    ringGroup.add(m);
  });
  ringGroup.visible = false;
  scene.add(ringGroup);

  // The truck's route: down the spiral haul road, then straight along the floor beside the machine.
  const route: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const p = roadPoint(0.6 + (0.4 * i) / 12);
    route.push(new THREE.Vector3(p.x, 0, p.z));
  }
  for (const x of [-34, -22, -12, -1.5]) route.push(new THREE.Vector3(x, 0, -5.4));
  for (const p of route) p.y = terrainHeight(p.x, p.z);
  const routeCurve = new THREE.CatmullRomCurve3(route, false, "centripetal");
  const routeLen = routeCurve.getLength();
  const truckBack = new THREE.Vector3();
  const truckFront = new THREE.Vector3();

  /* Dust motes catching the low sun. One draw call. */
  const DUST = compact ? 160 : 300;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 130;
    dustPos[i * 3 + 1] = 0.6 + Math.random() * 22;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 130;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: glow,
    color: 0xffd9a8,
    size: 0.45,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  /* Camera path: one Catmull-Rom through all waypoints, driven by global scroll progress. */
  const h0 = Math.atan2(-curve.getTangentAt(0).z, curve.getTangentAt(0).x);
  const ch = Math.cos(h0);
  const sh = Math.sin(h0);
  /** A point in the machine's frame (forward, up, left-negative z) in world space. */
  const M = (lx: number, ly: number, lz: number): [number, number, number] => [lx * ch + lz * sh, ly, -lx * sh + lz * ch];
  type Key = { pos: [number, number, number]; tgt: [number, number, number]; fov: number; sx: number; sy: number; m?: { sx: number; sy: number } };
  const W: Key[] = [
    { pos: M(20, 3.0, -14), tgt: M(1.2, 2.0, 0.2), fov: 30, sx: 0.13, sy: 0, m: { sx: -0.13, sy: -0.16 } },
    { pos: [46, 18, -36], tgt: [-18, 5, 14], fov: 38, sx: 0.06, sy: 0 },
    { pos: M(8, 4.6, -29), tgt: M(3.0, 3.0, 0.2), fov: 28, sx: 0.08, sy: -0.04 },
    { pos: [-8, 36, 70], tgt: [0, 0, 2], fov: 38, sx: 0, sy: 0 },
    { pos: [26, 38, 40], tgt: [-6, 0, -1], fov: 34, sx: 0.08, sy: 0 },
    { pos: [34, 74, 78], tgt: [0, 0, 0], fov: 40, sx: 0, sy: 0 },
  ];
  const TRAVEL = [0.85, 0.45, 0.45, 0.4, 0.55];
  const ORBIT = [0, 0.5, 0.25, 0, 0];
  const posCurve = new THREE.CatmullRomCurve3(W.map((k) => new THREE.Vector3(...k.pos)), false, "centripetal");
  const tgtCurve = new THREE.CatmullRomCurve3(W.map((k) => new THREE.Vector3(...k.tgt)), false, "centripetal");
  const auxCurve = (portrait: boolean) =>
    new THREE.CatmullRomCurve3(
      W.map((k) => new THREE.Vector3(k.fov, k.sx + (portrait ? k.m?.sx ?? 0 : 0), k.sy + (portrait ? k.m?.sy ?? 0 : 0))),
      false,
      "centripetal",
    );
  const auxLand = auxCurve(false);
  const auxPort = auxCurve(true);

  /* State. */
  let ps = [0, 0, 0, 0, 0];
  let running = false;
  let raf = 0;
  let last = 0;
  let time = 0;
  let slow = 0;
  let governorStep = 0;
  let lastRing = -1;
  let ready = false;
  let cycPhase = 0;
  const stow = new Damped(0);
  const halt = new Damped(0);
  const cx = [new Damped(), new Damped(), new Damped()];
  const tx = [new Damped(), new Damped(), new Damped()];
  const cfov = new Damped(30);
  const csx = new Damped(0);
  const csy = new Damped(0);
  const parX = new Damped(0);
  const parY = new Damped(0);
  let pointerX = 0;
  let pointerY = 0;
  let vw = 1;
  let vh = 1;
  let aspect = 1;
  const wantPos = new THREE.Vector3();
  const wantTgt = new THREE.Vector3();
  const wantAux = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const rt = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const startTan = curve.getTangentAt(0, new THREE.Vector3());
  const sunWarm = new THREE.Color(0xffb37a);
  const sunCool = new THREE.Color(0x8fa4e8);
  const faultAmber = new THREE.Color(0xffc700);
  const faultRed = new THREE.Color(0xb3102a);
  const fogPre = new THREE.Color(0.14, 0.17, 0.3);
  const fogDawn = new THREE.Color(0.62, 0.5, 0.46);
  const pose: Pose = { boom: 0, stick: 0, bucket: 0 };
  const pulses = [0, 0, 0, 0];
  const anchorOut: SceneAnchor[] = [
    { x: 0, y: 0, visible: false },
    { x: 0, y: 0, visible: false },
    { x: 0, y: 0, visible: false },
  ];
  let wantAnchors = false;
  const H = new THREE.Vector2(0.878, -0.479);
  const sunDir = new THREE.Vector3();
  const pointerOk = !opts.reducedMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const onPointer = (e: PointerEvent) => {
    pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (pointerOk) window.addEventListener("pointermove", onPointer, { passive: true });

  function dawnValue(): number {
    return lerp(0.55, 1, inout(win(ps[0], 0, 0.85)));
  }

  /** Where the trail head is, 0..1: forward while stage 3 runs, rewinding in stage 5. */
  function trailT(): number {
    if (ps[4] > 0) return 1 - smoothstep(win(ps[4], 0.05, 0.9));
    return inout(win(ps[2], 0, 0.85));
  }

  function computeCamera() {
    let s = 0;
    for (let i = 0; i < 5; i++) if (ps[i] > 0) s = i;
    const p = ps[s];
    const e = quint(win(p, 0, TRAVEL[s]));
    const t = (s + e) / 5;
    posCurve.getPoint(t, wantPos);
    tgtCurve.getPoint(t, wantTgt);
    (aspect < 0.9 ? auxPort : auxLand).getPoint(t, wantAux);
    const orbit = (Math.max(0, p - TRAVEL[s]) * ORBIT[s]) / (1 - TRAVEL[s] + 1e-6);
    if (orbit !== 0) {
      tmp.subVectors(wantPos, wantTgt);
      const c = Math.cos(orbit);
      const sn = Math.sin(orbit);
      wantPos.set(wantTgt.x + tmp.x * c - tmp.z * sn, wantPos.y, wantTgt.z + tmp.x * sn + tmp.z * c);
    }
  }

  function updateWorld(dt: number) {
    const dawn = dawnValue();
    skyU.uDawn.value = dawn;

    // The sun stays low (8 to 12 degrees) and warms as the dawn comes up.
    const el = lerp(0.17, 0.21, dawn);
    sunDir.set(H.x * Math.cos(el), Math.sin(el), H.y * Math.cos(el));
    skyU.uSun.value.copy(sunDir);
    sun.intensity = lerp(0.35, 3.3, dawn);
    sun.color.copy(sunCool).lerp(sunWarm, dawn);
    hemi.intensity = lerp(0.5, 1.0, dawn);
    scene.environmentIntensity = lerp(0.22, 0.5, dawn);
    renderer.toneMappingExposure = lerp(0.95, 1.15, dawn);
    const fogIn = win(ps[3], 0, 0.2) * (1 - win(ps[4], 0, 0.3));
    fog.density = lerp(0.0032, 0.0056, fogIn);
    fog.color.copy(fogPre).lerp(fogDawn, dawn);
    skyU.uFog.value.copy(fog.color);

    dustMat.opacity = 0.7 * dawn * (1 - win(ps[1] + ps[2], 0.5, 1.3));
    if (!opts.reducedMotion) {
      const arr = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < DUST; i++) {
        arr.setX(i, arr.getX(i) - dt * 0.55);
        arr.setY(i, arr.getY(i) + Math.sin(time * 0.4 + i) * dt * 0.1);
        arr.setZ(i, arr.getZ(i) + dt * 0.2);
        if (arr.getX(i) < -65) arr.setX(i, 65);
        if (arr.getZ(i) > 65) arr.setZ(i, -65);
      }
      arr.needsUpdate = true;
    }

    // Drive along the trail.
    const t = trailT();
    const tc = Math.min(0.9999, Math.max(0, t));
    const pt = curve.getPointAt(tc);
    curve.getTangentAt(tc, tan);
    let heading = Math.atan2(-tan.z, tan.x);
    const h0v = Math.atan2(-startTan.z, startTan.x);
    const pre = t < 0.02 ? 1 : 0;
    const post = win(t, 0.9, 1);
    heading = lerp(heading, h0v, Math.max(pre, post));
    exc.group.position.set(pt.x, 0, pt.z);
    exc.group.rotation.y = heading;
    exc.setTrack(t * curveLen);
    const moving = t > 0.004 && t < 0.996;

    // Dig cycle: the arm keeps a slow loop, the house slews; it stows for travel and halts at the red ring.
    stow.to(moving ? 1 : 0, 0.35, dt || 0);
    if (dt === 0) stow.x = moving ? 1 : 0;
    const level0 = lastRing < 0 ? 0 : lastRing;
    halt.to(level0 >= 3 ? 1 : 0, 0.5, dt || 0);
    if (dt === 0) halt.x = level0 >= 3 ? 1 : 0;
    if (!opts.reducedMotion) cycPhase += dt * 0.09 * (1 - halt.x);
    const phase = cycPhase + ps[0] * 0.18 + ps[1] * 0.4 + 0.02;
    const yaw = cyclePose(phase, pose);
    const k = stow.x;
    exc.house.rotation.y = lerp(yaw, 0, k);
    exc.setPose({
      boom: lerp(pose.boom, TRAVEL_POSE.boom, k),
      stick: lerp(pose.stick, TRAVEL_POSE.stick, k),
      bucket: lerp(pose.bucket, TRAVEL_POSE.bucket, k),
    });

    // Trail draw. In stage 5 the trail rewinds with the machine.
    const fade = win(ps[3], 0, 0.2) * (1 - win(ps[4], 0, 0.2));
    trailMat.opacity = lerp(0.95, 0.3, fade);
    const count = Math.floor(t * TUBE_SEG) * RADIAL * 6;
    trailGeo.setDrawRange(0, count);
    trail.visible = count > 0;
    const headOn = (ps[2] > 0 || ps[4] > 0) && t > 0.003 && t < 0.997;
    head.visible = headOn;
    head.position.copy(pt);
    head.position.y += 0.45;
    head.scale.setScalar(1 + (opts.reducedMotion ? 0 : Math.sin(time * 4) * 0.12));
    for (let i = 0; i < TICKS; i++) {
      const on = smoothstep(win(t - (i + 0.5) / TICKS, 0, 0.025));
      _s.set(on, on, on);
      _q.setFromAxisAngle(_up, tickRot[i]);
      _m.compose(tickPos[i], _q, _s);
      ticks.setMatrixAt(i, _m);
    }
    ticks.instanceMatrix.needsUpdate = true;
    ticks.visible = t > 0.02;
    (ticks.material as THREE.MeshBasicMaterial).opacity = 1;

    // Guardian rings and the haul truck.
    const ringsOn = ps[3] > 0 && ps[4] < 0.6;
    ringGroup.visible = ringsOn;
    truck.group.visible = ringsOn;
    let level = 0;
    if (ringsOn) {
      const grow = quint(win(ps[3], 0, 0.3));
      const out = 1 - win(ps[4], 0, 0.5);
      const scale = Math.max(0.001, grow * (0.4 + 0.6 * out));
      // The truck rolls down the haul road, creeps in beside the machine, holds, then backs out.
      const inn = inout(win(ps[3], 0.12, 0.62));
      const away = inout(win(ps[3], 0.8, 1));
      const f = clamp01(inn * (1 - 0.6 * away));
      routeCurve.getPointAt(f, truckFront);
      routeCurve.getTangentAt(Math.min(0.999, f), tan);
      truck.group.position.copy(truckFront);
      truck.group.rotation.y = Math.atan2(-tan.z, tan.x);
      // Pitch to the ground.
      routeCurve.getPointAt(clamp01(f - 0.03), truckBack);
      const slope = Math.atan2(truckFront.y - truckBack.y, Math.max(0.5, Math.hypot(truckFront.x - truckBack.x, truckFront.z - truckBack.z)));
      truck.group.rotation.z = slope;
      truck.spin((f * routeLen) / 0.8);
      level = ringLevel(Math.hypot(truckFront.x, truckFront.z));
      for (let i = 0; i < RINGS.length; i++) {
        const active = level >= 1 && level - 1 === i;
        const u = ringU[i];
        u.uScale.value = scale;
        u.uOpacity.value = out;
        u.uGlow.value = active ? 0.9 : 0.2;
        u.uLine.value = active ? 1 : 0.5;
        if (dt > 0) pulses[i] = Math.max(0, pulses[i] - dt / 0.9);
        u.uPulse.value = opts.reducedMotion ? 0 : pulses[i];
      }
    }
    if (level !== lastRing) {
      // The ring the truck just crossed pulses once.
      if (dt > 0 && level > Math.max(0, lastRing) && level >= 1) pulses[level - 1] = 1;
      lastRing = level;
      opts.onRing?.(level);
    }

    // Fault glow on the boom ram and the cab beacon: ring colour, amber to red as the ring steps up.
    const fault = ringsOn ? clamp01((level - 1) / 3) : 0;
    exc.ramMat.emissive.copy(faultAmber).lerp(faultRed, fault);
    exc.ramMat.emissiveIntensity = ringsOn && level > 0 ? (opts.reducedMotion ? 1.1 : 0.9 + Math.sin(time * 5) * 0.6) * (0.5 + fault * 0.8) : 0;
    const bc = ringsOn && level > 0 ? RINGS[level - 1].color : RINGS[0].color;
    exc.beaconMat.color.setHex(bc);
    exc.beaconMat.emissive.setHex(bc);
    exc.beaconMat.emissiveIntensity = opts.reducedMotion ? 1.2 : 1.0 + Math.sin(time * 3) * 0.5;

    // The shadow box follows the machine, snapped so shadows do not swim.
    const sx = Math.round(exc.group.position.x / 3) * 3;
    const sz = Math.round(exc.group.position.z / 3) * 3;
    sun.target.position.set(sx, 0, sz);
    sun.position.set(sx + sunDir.x * 140, sunDir.y * 140, sz + sunDir.z * 140);
  }

  function updateCamera(dt: number, snap: boolean) {
    computeCamera();
    const d = snap ? 0 : dt;
    const st = 0.42;
    camera.position.set(cx[0].to(wantPos.x, st, d), cx[1].to(wantPos.y, st, d), cx[2].to(wantPos.z, st, d));
    const target = tmp.set(tx[0].to(wantTgt.x, st, d), tx[1].to(wantTgt.y, st, d), tx[2].to(wantTgt.z, st, d));
    const fovNow = cfov.to(wantAux.x, st, d);
    const sxNow = csx.to(wantAux.y, st, d);
    const syNow = csy.to(wantAux.z, st, d);
    // Pointer parallax of +-1.5 degrees, desktop only.
    if (pointerOk && !snap) {
      const ax = parX.to(pointerX, 0.7, d) * THREE.MathUtils.degToRad(1.5);
      const ay = parY.to(pointerY, 0.7, d) * THREE.MathUtils.degToRad(1.0);
      const off = camera.position.clone().sub(target);
      off.applyAxisAngle(_up, -ax);
      rt.set(off.z, 0, -off.x).normalize();
      off.applyQuaternion(quat.setFromAxisAngle(rt, ay));
      camera.position.copy(target).add(off);
    }
    camera.lookAt(target);
    const boost = Math.max(1, 1.25 / aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fovNow) / 2) * boost));
    const sx = aspect > 1.1 || aspect < 0.9 ? sxNow : 0;
    camera.setViewOffset(vw, vh, -sx * vw, -syNow * vh, vw, vh);
    camera.updateProjectionMatrix();
  }

  function computeAnchors() {
    camera.updateMatrixWorld();
    exc.group.updateMatrixWorld(true);
    const objs = [exc.anchors.cab, exc.anchors.cylinder, exc.anchors.bucket];
    objs.forEach((o, i) => {
      o.getWorldPosition(tmp);
      tmp.project(camera);
      const a = anchorOut[i];
      a.x = (tmp.x * 0.5 + 0.5) * vw;
      a.y = (-tmp.y * 0.5 + 0.5) * vh;
      a.visible = tmp.z < 1 && Math.abs(tmp.x) <= 1.02 && Math.abs(tmp.y) <= 1.02;
    });
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    vw = w;
    vh = h;
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  function renderOnce(snap = true) {
    updateWorld(0);
    updateCamera(0, snap);
    renderer.render(scene, camera);
    if (wantAnchors) computeAnchors();
    if (!ready) {
      ready = true;
      opts.onReady?.();
    }
  }

  function tick(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    time += dt;
    updateWorld(dt);
    updateCamera(dt, false);
    renderer.render(scene, camera);
    if (wantAnchors) computeAnchors();
    if (!ready) {
      ready = true;
      opts.onReady?.();
    }
    // Governor: 30 slow frames drop the pixel ratio to 1.0; another 60 drop it to 0.75.
    if (dt * 1000 > 22 && renderer.getPixelRatio() > 0.75) {
      slow += 1;
      const need = governorStep === 0 ? 30 : 60;
      if (slow >= need) {
        slow = 0;
        renderer.setPixelRatio(governorStep === 0 ? 1 : 0.75);
        governorStep += 1;
        resize();
      }
    }
  }

  resize();
  updateCamera(0, true);

  return {
    setProgress(next) {
      ps = next;
    },
    setRunning(on) {
      if (on === running) return;
      running = on;
      if (on) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    resize,
    renderOnce: () => renderOnce(opts.snap ?? true),
    getAnchors() {
      if (!wantAnchors) {
        wantAnchors = true;
        computeAnchors();
      }
      return anchorOut.map((a) => ({ ...a }));
    },
    dispose() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      glow.dispose();
      envRT.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
