import * as THREE from "three";
import { buildExcavator } from "./excavator";
import { buildTerrain, terrainHeight } from "./terrain";

/*
 * One three.js renderer for stages 1-5 (dossier §4). Loaded by dynamic import, so three.js is not
 * in the initial bundle. Everything is procedural. Budget rules from the dossier: DPR capped at
 * 1.5, antialias only below 1.5, a governor that drops to DPR 1 after 30 slow frames, one rAF that
 * the engine starts and stops with an IntersectionObserver, no post-processing.
 */

export type SceneOptions = {
  /** Reduced motion: no pulse, no dust drift (the engine normally never creates the scene then). */
  reducedMotion?: boolean;
  /** Snap the camera instead of smoothing (posters and tests). */
  snap?: boolean;
  onRing?: (level: number) => void;
  onReady?: () => void;
};

export type SceneController = {
  setProgress: (ps: number[]) => void;
  setRunning: (on: boolean) => void;
  resize: () => void;
  renderOnce: () => void;
  dispose: () => void;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const quint = (t: number) => 1 - Math.pow(1 - t, 5);
const inout = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const win = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** `sx`/`sy`: frame the subject off-centre (fraction of the viewport) to leave room for copy. */
type Key = { pos: [number, number, number]; tgt: [number, number, number]; fov: number; sx: number; sy: number };

/* Camera waypoints W0..W5: stage i flies W[i] to W[i+1] (dossier: FOV 35 wide, 26 hero framing). */
const W: Key[] = [
  { pos: [-30, 3.5, 30], tgt: [14, 9, -38], fov: 35, sx: 0, sy: 0 },
  { pos: [-16, 22, 48], tgt: [2, 3, 0], fov: 35, sx: 0, sy: 0 },
  { pos: [26, 7.5, 30], tgt: [3.5, 3.2, 0], fov: 26, sx: 0, sy: -0.1 },
  { pos: [0, 72, 46], tgt: [0, 0, 0], fov: 35, sx: 0, sy: 0 },
  { pos: [30, 40, 48], tgt: [0, 1.5, 0], fov: 32, sx: 0.1, sy: 0 },
  { pos: [0, 100, 1], tgt: [0, 0, 0], fov: 35, sx: 0, sy: 0 },
];
const TRAVEL = [0.85, 0.45, 0.45, 0.4, 0.55];
const ORBIT = [0, 0.7, 0.25, 0, 0];

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

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions = {}): SceneController {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: dpr < 1.5,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 1400);

  /* Studio environment, no HDR file: a gradient sphere plus three softbox planes through PMREM. */
  const envScene = new THREE.Scene();
  envScene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(100, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          "varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 lo = vec3(0.18,0.17,0.21); vec3 mid = vec3(1.0,0.78,0.6); vec3 hi = vec3(0.45,0.55,0.8); vec3 c = h < 0.0 ? mix(mid*0.25, lo, clamp(-h*2.0,0.0,1.0)) : mix(mid, hi, clamp(h*1.6,0.0,1.0)); gl_FragColor = vec4(c,1.0); }",
      }),
    ),
  );
  const softbox = (w: number, h: number, color: THREE.Color, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  softbox(46, 28, new THREE.Color(1.0, 0.82, 0.62).multiplyScalar(9), 40, 24, 46); // key, warm
  softbox(40, 24, new THREE.Color(0.7, 0.82, 1.0).multiplyScalar(3.5), -50, 14, 12); // fill, cool
  softbox(70, 10, new THREE.Color(1, 1, 1).multiplyScalar(7), 0, 52, -34); // rim strip
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  /* Sky dome: blue hour to first light, driven by one uniform. */
  const skyU = {
    uDawn: { value: 0 },
    uSun: { value: new THREE.Vector3(0.5, 0.1, -0.85).normalize() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        varying vec3 vD; uniform float uDawn; uniform vec3 uSun;
        void main(){
          float h = clamp(vD.y, 0.0, 1.0);
          vec3 topA = vec3(0.035,0.05,0.12), horA = vec3(0.10,0.14,0.30);
          vec3 topB = vec3(0.18,0.27,0.52), horB = vec3(0.95,0.68,0.50);
          vec3 top = mix(topA, topB, uDawn), hor = mix(horA, horB, uDawn);
          vec3 c = mix(hor, top, pow(h, 0.55));
          float s = max(dot(normalize(vD), normalize(uSun)), 0.0);
          c += vec3(1.0,0.78,0.55) * (pow(s, 14.0) * 0.55 + pow(s, 220.0) * 1.4) * uDawn;
          c = mix(c, hor * 0.55, step(vD.y, 0.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0x8a87a6, 160, 900);

  const terrain = buildTerrain();
  scene.add(terrain);

  /* Light: a low warm sun that rises with the dawn. Only the machine and walker cast shadows. */
  const sun = new THREE.DirectionalLight(0xffd2a6, 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -34;
  sc.right = 34;
  sc.top = 34;
  sc.bottom = -34;
  sc.near = 10;
  sc.far = 220;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ opacity: 0.42 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = 0.04;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  /* Machine. */
  const exc = buildExcavator();
  scene.add(exc.group);

  /* Trail: a tube drawn with drawRange, a glowing head, all on the floor. */
  const pts: THREE.Vector3[] = (
    [
      [0, 0], [10, -3], [22, -12], [28, -2], [21, 12], [7, 20], [-11, 22], [-25, 12],
      [-25, -8], [-11, -15], [-3, -6], [0, 0],
    ] as Array<[number, number]>
  ).map(([x, z]) => new THREE.Vector3(x, terrainHeight(x, z) + 0.2, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const TUBE_SEG = 520;
  const RADIAL = 5;
  const trailGeo = new THREE.TubeGeometry(curve, TUBE_SEG, 0.24, RADIAL, false);
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xfff6e4, toneMapped: false });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff6e4, toneMapped: false }));
  scene.add(head);

  /* Guardian rings and the walker. */
  const ringGroup = new THREE.Group();
  const ringMats: THREE.MeshBasicMaterial[] = [];
  const discMats: THREE.MeshBasicMaterial[] = [];
  RINGS.forEach((rg) => {
    const m = new THREE.MeshBasicMaterial({ color: rg.color, transparent: true, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(rg.r - 0.55, rg.r, 128), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    const dm = new THREE.MeshBasicMaterial({ color: rg.color, transparent: true, depthWrite: false, toneMapped: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(rg.r, 64), dm);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    ringGroup.add(disc, ring);
    ringMats.push(m);
    discMats.push(dm);
  });
  ringGroup.visible = false;
  scene.add(ringGroup);

  const walker = new THREE.Group();
  const vest = new THREE.MeshStandardMaterial({ color: "#2f6fcf", roughness: 0.6 });
  const wBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.15, 10), vest);
  wBody.position.y = 1.0;
  const wLegs = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.7, 8), new THREE.MeshStandardMaterial({ color: "#2a2a36", roughness: 0.8 }));
  wLegs.position.y = 0.35;
  const wHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), new THREE.MeshStandardMaterial({ color: "#d9d4c7", roughness: 0.5 }));
  wHead.position.y = 1.78;
  [wBody, wLegs, wHead].forEach((m) => (m.castShadow = true));
  walker.add(wBody, wLegs, wHead);
  walker.visible = false;
  scene.add(walker);

  /* Dust motes catching the low sun. One draw call. */
  const DUST = 260;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 120;
    dustPos[i * 3 + 1] = 1 + Math.random() * 26;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xffe2bd, size: 0.35, transparent: true, opacity: 0.0, depthWrite: false, sizeAttenuation: true });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  /* State. */
  let ps = [0, 0, 0, 0, 0];
  let running = false;
  let raf = 0;
  let last = 0;
  let time = 0;
  let slow = 0;
  let lastRing = -1;
  let ready = false;
  const camPos = new THREE.Vector3(...W[0].pos);
  const camTgt = new THREE.Vector3(...W[0].tgt);
  let camFov = W[0].fov;
  const wantPos = new THREE.Vector3();
  const wantTgt = new THREE.Vector3();
  let wantFov = 35;
  let wantSx = 0;
  let wantSy = 0;
  let camSx = 0;
  let camSy = 0;
  let vw = 1;
  let vh = 1;
  let aspect = 1;
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const faultAmber = new THREE.Color(0xffc700);
  const faultRed = new THREE.Color(0xb3102a);

  function dawnValue(): number {
    return inout(win(ps[0], 0, 0.85));
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
    const a = W[s];
    const b = W[s + 1];
    const e = quint(win(p, 0, TRAVEL[s]));
    wantPos.set(lerp(a.pos[0], b.pos[0], e), lerp(a.pos[1], b.pos[1], e), lerp(a.pos[2], b.pos[2], e));
    wantTgt.set(lerp(a.tgt[0], b.tgt[0], e), lerp(a.tgt[1], b.tgt[1], e), lerp(a.tgt[2], b.tgt[2], e));
    wantFov = lerp(a.fov, b.fov, e);
    wantSx = lerp(a.sx, b.sx, e);
    wantSy = lerp(a.sy, b.sy, e);
    const orbit = (Math.max(0, p - TRAVEL[s]) * ORBIT[s]) / (1 - TRAVEL[s] + 1e-6);
    if (orbit !== 0) {
      tmp.subVectors(wantPos, wantTgt);
      const c = Math.cos(orbit);
      const sn = Math.sin(orbit);
      const x = tmp.x * c - tmp.z * sn;
      const z = tmp.x * sn + tmp.z * c;
      wantPos.set(wantTgt.x + x, wantPos.y, wantTgt.z + z);
    }
  }

  function updateWorld(dt: number) {
    const dawn = dawnValue();
    skyU.uDawn.value = dawn;
    sun.intensity = lerp(0.12, 2.0, dawn);
    sun.color.setHex(0xffd2a6).lerp(new THREE.Color(0x8fa4e8), 1 - dawn);
    const elev = lerp(0.04, 0.3, dawn);
    skyU.uSun.value.set(0.5, elev, -0.85).normalize();
    sun.position.set(skyU.uSun.value.x * 90, Math.max(18, skyU.uSun.value.y * 140), skyU.uSun.value.z * 90);
    // The sun shines from the horizon but the light comes from a slightly higher key so faces read.
    sun.position.set(40, 38, 34);
    scene.environmentIntensity = lerp(0.3, 0.75, dawn);
    renderer.toneMappingExposure = lerp(0.85, 1.05, dawn);
    (scene.fog as THREE.Fog).color.setRGB(lerp(0.1, 0.62, dawn), lerp(0.13, 0.52, dawn), lerp(0.28, 0.6, dawn));
    dustMat.opacity = 0.55 * dawn * (1 - win(ps[1] + ps[2], 0.3, 1));
    if (!opts.reducedMotion) {
      const arr = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < DUST; i++) {
        arr.setX(i, arr.getX(i) + dt * 0.35);
        arr.setY(i, arr.getY(i) + Math.sin(time * 0.4 + i) * dt * 0.08);
        if (arr.getX(i) > 60) arr.setX(i, -60);
      }
      arr.needsUpdate = true;
    }

    // Machine pose.
    const p2 = ps[1];
    const turn = quint(win(p2, 0, 0.4));
    exc.house.rotation.y = lerp(-0.95, 0, turn) * (ps[2] > 0 ? 0 : 1);
    const cyc = win(p2, 0.3, 0.9);
    const dig = Math.sin(cyc * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5; // 0 raised .. 1 dug
    const active = ps[1] > 0 && ps[2] === 0;
    const k = active ? win(p2, 0.3, 0.45) : 0;
    exc.boom.rotation.z = lerp(0.5, lerp(0.45, 0.2, dig), k);
    exc.stick.rotation.z = lerp(-1.15, lerp(-0.95, -1.7, dig), k);
    exc.bucket.rotation.z = lerp(-0.85, lerp(-0.7, -1.5, dig), k);
    exc.updateRam();

    // Drive along the trail.
    const t = trailT();
    const pt = curve.getPointAt(Math.min(0.9999, Math.max(0, t)));
    curve.getTangentAt(Math.min(0.9999, Math.max(0, t)), tan);
    let heading = Math.atan2(-tan.z, tan.x);
    const start = curve.getTangentAt(0, new THREE.Vector3());
    const h0 = Math.atan2(-start.z, start.x);
    const pre = t < 0.02 ? 1 : 0;
    const post = win(t, 0.9, 1);
    heading = lerp(heading, h0, Math.max(pre, post));
    exc.group.position.set(pt.x, 0, pt.z);
    exc.group.rotation.y = heading;
    head.position.copy(pt);
    head.position.y += 0.4;
    // Trail draw. In stage 5 the trail rewinds with the machine.
    const drawT = ps[4] > 0 ? t : t;
    const count = Math.floor(drawT * TUBE_SEG) * RADIAL * 6;
    trailGeo.setDrawRange(0, count);
    trail.visible = count > 0;
    head.visible = ps[2] > 0 || ps[4] > 0;
    head.scale.setScalar(1 + (opts.reducedMotion ? 0 : Math.sin(time * 4) * 0.12));

    // Guardian rings.
    const ringsOn = ps[3] > 0 && ps[4] < 0.6;
    ringGroup.visible = ringsOn;
    walker.visible = ringsOn;
    let level = 0;
    if (ringsOn) {
      const grow = quint(win(ps[3], 0, 0.3));
      const out = 1 - win(ps[4], 0, 0.5);
      ringGroup.scale.setScalar(Math.max(0.001, grow * (0.4 + 0.6 * out)));
      // The walker comes in from the east, holds, and walks back out.
      const inn = inout(win(ps[3], 0.25, 0.6));
      const away = inout(win(ps[3], 0.78, 1));
      const dist = lerp(40, 4.5, inn) + (away * 30 - 0);
      const x = Math.min(44, dist);
      walker.position.set(x, 0, -3.2);
      walker.rotation.y = away > 0.02 ? 0 : Math.PI;
      level = ringLevel(Math.hypot(x, 3.2));
      const pulse = opts.reducedMotion ? 0.8 : 0.78 + Math.sin(time * 4.2) * 0.22;
      ringMats.forEach((m, i) => {
        const active = level >= 1 && level - 1 === i;
        const reached = level - 1 >= i;
        m.opacity = (active ? pulse : reached ? 0.55 : 0.32) * out;
      });
      discMats.forEach((m, i) => {
        m.opacity = (level >= 1 && level - 1 === i ? 0.2 * (opts.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(time * 4.2)) : 0.03) * out;
      });
    }
    if (level !== lastRing) {
      lastRing = level;
      opts.onRing?.(level);
    }

    // Fault glow on the ram: amber, then red as the ring steps up. Static tint under reduced motion.
    const fault = ringsOn ? clamp01((level - 1) / 3) : 0;
    exc.ramMat.emissive.copy(faultAmber).lerp(faultRed, fault);
    exc.ramMat.emissiveIntensity = ringsOn && level > 0 ? (opts.reducedMotion ? 1.1 : 0.9 + Math.sin(time * 5) * 0.6) * (0.5 + fault * 0.8) : 0;
  }

  function updateCamera(dt: number, snap: boolean) {
    computeCamera();
    const f = snap ? 1 : 1 - Math.pow(1 - 0.12, dt * 60);
    camPos.lerp(wantPos, f);
    camTgt.lerp(wantTgt, f);
    camFov = lerp(camFov, wantFov, f);
    camera.position.copy(camPos);
    camera.lookAt(camTgt);
    const boost = Math.max(1, 1.25 / aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camFov) / 2) * boost));
    camSx += (wantSx - camSx) * f;
    camSy += (wantSy - camSy) * f;
    const sx = aspect > 1.1 ? camSx : 0;
    camera.setViewOffset(vw, vh, -sx * vw, -camSy * vh, vw, vh);
    camera.updateProjectionMatrix();
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
    const t0 = performance.now();
    updateWorld(dt);
    updateCamera(dt, false);
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      opts.onReady?.();
    }
    // Governor: 30 frames over 22 ms drops the pixel ratio to 1.0, once.
    if (renderer.getPixelRatio() > 1 && dt * 1000 > 22) {
      slow += 1;
      if (slow >= 30) {
        renderer.setPixelRatio(1);
        resize();
      }
    }
    void t0;
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
    dispose() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      envTex.dispose();
      renderer.dispose();
    },
  };
}
