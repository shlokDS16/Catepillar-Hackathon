import * as THREE from "three";
import { heightFog } from "./fog";
import { Kit, box, cyl, dirtTint, extrudeShape, roundRect, slab, triangleCount, xform, type Vec3 } from "./parts";

/*
 * A generic 20-tonne tracked excavator, built procedurally at hero quality. No brand features:
 * warm off-white body, graphite undercarriage and joints, one state-coloured beacon on the cab
 * roof. Forward is +x, up is +y, the cab is on the left (-z). One merged mesh per material and
 * frame, instanced track shoes, and hydraulic cylinders whose ends are re-aimed every frame.
 * Under 40k triangles.
 */

export type Pose = { boom: number; stick: number; bucket: number };

export type Excavator = {
  group: THREE.Group;
  house: THREE.Group;
  boom: THREE.Group;
  stick: THREE.Group;
  bucket: THREE.Group;
  /** The boom ram rod: the part that "faults" in the Guardian stage. It owns its own material. */
  ram: THREE.Mesh;
  ramMat: THREE.MeshStandardMaterial;
  /** The cab-roof beacon, the only saturated colour on the machine. */
  beaconMat: THREE.MeshStandardMaterial;
  /** Set the three arm angles (radians, relative to the parent) and re-aim every cylinder. */
  setPose: (p: Pose) => void;
  /** Re-aims the cylinders after a pose change. */
  updateCylinders: () => void;
  /** Scroll the track shoes: `d` is the distance travelled forward in metres. */
  setTrack: (d: number) => void;
  /** Anchor objects for the stage-2 callouts. */
  anchors: { cab: THREE.Object3D; cylinder: THREE.Object3D; bucket: THREE.Object3D; beacon: THREE.Object3D };
  triangles: () => number;
};

/* Dimensions in metres (group frame: floor y = 0). */
const HOUSE_Y = 1.28;
const BOOM_FOOT: Vec3 = [1.55, 0.82, 0.35];
const BOOM_ELBOW: [number, number] = [5.9, 0.2];
const STICK_LEN = 2.9;
const TRACK_Z = 1.62;
const WHEEL_X = 2.3;
const WHEEL_R = 0.5;
const BELT_R = 0.55;
const BELT_CY = 0.62;
const SHOES = 44;

const TRACK_L = WHEEL_X * 2;
const TRACK_P = 2 * TRACK_L + 2 * Math.PI * BELT_R;

function mats() {
  const paint = heightFog(
    new THREE.MeshPhysicalMaterial({ color: "#E9E4D6", roughness: 0.52, metalness: 0.04, clearcoat: 0.35, clearcoatRoughness: 0.4, vertexColors: true }),
  );
  const graphite = heightFog(new THREE.MeshStandardMaterial({ color: "#2A2924", roughness: 0.72, metalness: 0.25, vertexColors: true }));
  const steel = heightFog(new THREE.MeshStandardMaterial({ color: "#6a6c6d", roughness: 0.5, metalness: 0.6, vertexColors: true }));
  const tooth = heightFog(new THREE.MeshStandardMaterial({ color: "#3a3a3b", roughness: 0.45, metalness: 0.65, vertexColors: true }));
  const chrome = heightFog(new THREE.MeshStandardMaterial({ color: "#d3d6d9", roughness: 0.2, metalness: 0.95 }));
  const glass = heightFog(
    new THREE.MeshPhysicalMaterial({ color: "#1a2638", roughness: 0.1, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 }),
  );
  const lamp = new THREE.MeshBasicMaterial({ color: "#fff4d8", toneMapped: false });
  const pad = heightFog(new THREE.MeshStandardMaterial({ color: "#3b3a35", roughness: 0.85, metalness: 0.3 }));
  const ramMat = heightFog(
    new THREE.MeshStandardMaterial({ color: "#c4c7cb", roughness: 0.26, metalness: 0.9, emissive: new THREE.Color("#000000"), emissiveIntensity: 0 }),
  );
  const beaconMat = new THREE.MeshStandardMaterial({
    color: "#0b6b37",
    emissive: new THREE.Color("#0b6b37"),
    emissiveIntensity: 1.2,
    roughness: 0.4,
    metalness: 0,
  });
  return { paint, graphite, steel, tooth, chrome, glass, lamp, pad, ramMat, beaconMat };
}

/** A hydraulic cylinder: a fixed-length barrel plus a chrome rod, re-aimed between two points. */
class Ram {
  readonly group = new THREE.Group();
  private barrel: THREE.Mesh;
  readonly rod: THREE.Mesh;
  private up = new THREE.Vector3(0, 1, 0);
  private dir = new THREE.Vector3();
  constructor(
    barrelMat: THREE.Material,
    rodMat: THREE.Material,
    private barrelLen: number,
    barrelR: number,
    rodR: number,
  ) {
    const bg = new THREE.CylinderGeometry(barrelR, barrelR, 1, 14, 1);
    bg.translate(0, 0.5, 0);
    const rg = new THREE.CylinderGeometry(rodR, rodR, 1, 10, 1);
    rg.translate(0, 0.5, 0);
    this.barrel = new THREE.Mesh(bg, barrelMat);
    this.rod = new THREE.Mesh(rg, rodMat);
    this.barrel.castShadow = this.rod.castShadow = true;
    // A collar where the rod leaves the barrel.
    this.group.add(this.barrel, this.rod);
  }
  aim(a: THREE.Vector3, b: THREE.Vector3) {
    this.dir.subVectors(b, a);
    const d = Math.max(0.01, this.dir.length());
    this.dir.divideScalar(d);
    const bl = Math.min(this.barrelLen, d * 0.92);
    this.group.position.copy(a);
    this.group.quaternion.setFromUnitVectors(this.up, this.dir);
    this.barrel.scale.set(1, bl, 1);
    this.rod.position.set(0, bl * 0.55, 0);
    this.rod.scale.set(1, Math.max(0.01, d - bl * 0.55), 1);
  }
}

export function buildExcavator(): Excavator {
  const M = mats();
  const group = new THREE.Group();
  const lowerDirt = dirtTint(1.5);

  /* ---------- Undercarriage ---------- */
  {
    const k = new Kit();
    k.add(M.graphite, box(3.2, 0.62, 2.5, [0, 0.93, 0]), box(2.2, 0.2, 3.1, [0, 0.62, 0]));
    k.add(M.steel, cyl(1.38, 0.1, "y", [0, 1.22, 0], 28));
    for (const side of [-1, 1]) {
      const z = side * TRACK_Z;
      k.add(M.graphite, box(TRACK_L, 0.5, 0.46, [0, 0.66, z]));
      k.add(M.graphite, box(3.6, 0.09, 0.78, [0, 1.2, z])); // track guard
      for (const wx of [-WHEEL_X, WHEEL_X]) {
        k.add(M.graphite, cyl(WHEEL_R, 0.56, "z", [wx, BELT_CY, z], 22));
        k.add(M.steel, cyl(0.24, 0.66, "z", [wx, BELT_CY, z], 14));
        k.add(M.graphite, cyl(0.1, 0.72, "z", [wx, BELT_CY, z], 8));
      }
      // Sprocket teeth read as a ring of nubs.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        k.add(M.steel, box(0.1, 0.09, 0.2, [-WHEEL_X + Math.cos(a) * 0.5, BELT_CY + Math.sin(a) * 0.5, z + side * 0.0], [0, 0, a]));
      }
      for (let i = 0; i < 5; i++) k.add(M.steel, cyl(0.15, 0.66, "z", [-1.6 + i * 0.8, 0.27, z], 12));
      for (const cx of [-0.7, 0.7]) k.add(M.steel, cyl(0.11, 0.6, "z", [cx, 1.01, z], 10));
      // Side plates and a guide on the outboard face.
      k.add(M.graphite, box(4.3, 0.12, 0.06, [0, 0.42, z + side * 0.27]));
    }
    k.flush(group, lowerDirt);
  }

  // Track shoes: instanced, one per link, with a grouser rib on the ground side.
  const shoeGeo = (() => {
    const plate = box(TRACK_P / SHOES - 0.012, 0.05, 0.74);
    const rib = box(0.05, 0.1, 0.74, [0, 0.07, 0]);
    const merged = new THREE.BufferGeometry();
    const pa = plate.attributes.position as THREE.BufferAttribute;
    const ra = rib.attributes.position as THREE.BufferAttribute;
    const pos = new Float32Array((pa.count + ra.count) * 3);
    const nor = new Float32Array((pa.count + ra.count) * 3);
    pos.set(pa.array as Float32Array, 0);
    pos.set(ra.array as Float32Array, pa.count * 3);
    nor.set(plate.attributes.normal.array as Float32Array, 0);
    nor.set(rib.attributes.normal.array as Float32Array, pa.count * 3);
    merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    plate.dispose();
    rib.dispose();
    return merged;
  })();
  const shoes = new THREE.InstancedMesh(shoeGeo, M.pad, SHOES * 2);
  shoes.castShadow = true;
  shoes.receiveShadow = true;
  shoes.frustumCulled = false;
  group.add(shoes);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _z = new THREE.Vector3(0, 0, 1);
  /** Position and angle of the belt at arc length s, going bottom-front to the rear, up, and forward over the top. */
  const belt = (s: number): [number, number, number] => {
    s = ((s % TRACK_P) + TRACK_P) % TRACK_P;
    const arc = Math.PI * BELT_R;
    if (s < TRACK_L) return [WHEEL_X - s, BELT_CY - BELT_R, Math.PI];
    s -= TRACK_L;
    if (s < arc) {
      const th = -Math.PI / 2 - s / BELT_R;
      return [-WHEEL_X + Math.cos(th) * BELT_R, BELT_CY + Math.sin(th) * BELT_R, Math.atan2(-Math.cos(th), Math.sin(th))];
    }
    s -= arc;
    if (s < TRACK_L) return [-WHEEL_X + s, BELT_CY + BELT_R, 0];
    s -= TRACK_L;
    const th = Math.PI / 2 - s / BELT_R;
    return [WHEEL_X + Math.cos(th) * BELT_R, BELT_CY + Math.sin(th) * BELT_R, Math.atan2(-Math.cos(th), Math.sin(th))];
  };
  const setTrack = (d: number) => {
    for (let side = 0; side < 2; side++) {
      const z = (side === 0 ? -1 : 1) * TRACK_Z;
      for (let i = 0; i < SHOES; i++) {
        // Ground-side stays put, so the belt moves backwards under the machine as it drives forward.
        const [x, y, a] = belt((i * TRACK_P) / SHOES + d);
        _q.setFromAxisAngle(_z, a);
        _p.set(x, y, z);
        _m.compose(_p, _q, _s);
        shoes.setMatrixAt(side * SHOES + i, _m);
      }
    }
    shoes.instanceMatrix.needsUpdate = true;
  };
  setTrack(0);

  /* ---------- Slewing house ---------- */
  const house = new THREE.Group();
  house.position.y = HOUSE_Y;
  group.add(house);
  const beaconPos: Vec3 = [0.95, 1.98, -0.92];
  {
    const k = new Kit();
    // Deck and body.
    k.add(M.graphite, box(5.1, 0.2, 3.0, [-0.5, 0.1, 0]));
    k.add(
      M.paint,
      slab(
        [
          [-2.5, 0.2],
          [0.1, 0.2],
          [0.1, 0.98],
          [-0.25, 1.02],
          [-0.7, 1.38],
          [-2.1, 1.38],
          [-2.5, 1.1],
        ],
        -1.45,
        1.45,
        0.07,
      ),
    );
    // Rounded counterweight.
    const cw = new THREE.Shape();
    cw.moveTo(-2.4, 0.12);
    cw.lineTo(-3.0, 0.12);
    cw.quadraticCurveTo(-3.14, 0.12, -3.14, 0.32);
    cw.lineTo(-3.14, 0.95);
    cw.quadraticCurveTo(-3.14, 1.42, -2.68, 1.42);
    cw.lineTo(-2.4, 1.42);
    cw.closePath();
    k.add(M.paint, extrudeShape(cw, -1.47, 1.47, 0.09, 8));
    k.add(M.graphite, box(0.06, 0.1, 2.9, [-3.17, 0.55, 0])); // counterweight lifting band
    // Engine hood louvres.
    for (let i = 0; i < 7; i++) k.add(M.graphite, box(0.07, 0.035, 1.7, [-2.05 + i * 0.19, 1.42, 0]));
    for (let i = 0; i < 5; i++) k.add(M.graphite, box(0.035, 0.07, 1.5, [-2.55, 0.8 + i * 0.12, 0.0]));
    // Exhaust.
    k.add(M.graphite, cyl(0.09, 0.9, "y", [-1.75, 1.82, 1.05]), cyl(0.13, 0.05, "y", [-1.75, 2.3, 1.05], 12));
    // Fuel and hydraulic tank, right side.
    k.add(M.paint, extrudeShape(roundRect(0.1, 0.2, 1.95, 0.98, 0.14), 1.0, 1.45, 0.04, 4));
    // Boom foot casting between the cab and the tank.
    k.add(M.paint, extrudeShape(roundRect(1.15, 0.2, 2.1, 1.28, 0.16), -0.1, 0.82, 0.04, 4));
    k.add(M.graphite, cyl(0.17, 1.05, "z", [BOOM_FOOT[0], BOOM_FOOT[1], BOOM_FOOT[2]], 14));
    // Boom cylinder foot pin.
    k.add(M.graphite, cyl(0.07, 1.5, "z", [0.85, 0.34, BOOM_FOOT[2]], 10), box(0.3, 0.2, 0.12, [0.85, 0.26, BOOM_FOOT[2] - 0.5]), box(0.3, 0.2, 0.12, [0.85, 0.26, BOOM_FOOT[2] + 0.5]));
    // Handrails.
    const post = (x: number, z: number, y0: number, y1: number) => k.add(M.graphite, cyl(0.025, y1 - y0, "y", [x, (y0 + y1) / 2, z], 6));
    post(0.4, 1.4, 0.98, 1.5);
    post(1.85, 1.4, 0.98, 1.5);
    k.add(M.graphite, cyl(0.025, 1.45, "x", [1.12, 1.5, 1.4], 6));
    post(-0.9, 1.4, 1.38, 1.85);
    post(-2.05, 1.4, 1.38, 1.85);
    k.add(M.graphite, cyl(0.025, 1.15, "x", [-1.47, 1.85, 1.4], 6));
    // Cab: lower body, roof, pillars, mirrors.
    k.add(M.paint, extrudeShape(roundRect(0.12, 0.2, 1.9, 0.62, 0.08), -1.52, -0.36, 0.04, 4));
    k.add(M.paint, extrudeShape(roundRect(0.04, 1.74, 2.0, 1.9, 0.07), -1.6, -0.3, 0.05, 4));
    for (const px of [0.14, 1.88]) for (const pz of [-1.5, -0.38]) k.add(M.paint, box(0.08, 1.16, 0.08, [px, 1.18, pz]));
    k.add(M.paint, box(0.07, 1.1, 0.07, [1.0, 1.15, -1.5]));
    k.add(M.graphite, box(0.06, 0.3, 0.05, [1.95, 1.3, -1.62]), box(0.1, 0.2, 0.08, [1.95, 1.3, -1.66]));
    k.add(M.graphite, cyl(0.12, 0.05, "y", [beaconPos[0], 1.9, beaconPos[2]], 10));
    k.flush(house, (x, y, z, o) => lowerDirt(x, y + HOUSE_Y, z, o));

    const g = new Kit();
    // Cab glass: windscreen, side, rear. Inset a hair so the pillars frame them.
    g.add(M.glass, box(0.03, 1.1, 1.06, [1.86, 1.2, -0.94]));
    g.add(M.glass, box(1.7, 1.1, 0.03, [1.0, 1.2, -1.48]));
    g.add(M.glass, box(1.7, 1.1, 0.03, [1.0, 1.2, -0.4]));
    g.add(M.glass, box(0.03, 1.1, 1.06, [0.16, 1.2, -0.94]));
    g.add(M.lamp, box(0.16, 0.09, 0.26, [1.98, 1.84, -0.62]), box(0.16, 0.09, 0.26, [1.98, 1.84, -1.28]));
    g.flush(house);
  }
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.15, 12), M.beaconMat);
  beacon.position.set(beaconPos[0], beaconPos[1], beaconPos[2]);
  house.add(beacon);

  /* ---------- Boom: a bezier-extruded box section, two-part with a graphite joint ring ---------- */
  const boom = new THREE.Group();
  boom.position.set(BOOM_FOOT[0], BOOM_FOOT[1], BOOM_FOOT[2]);
  house.add(boom);
  const bez = new THREE.CubicBezierCurve(new THREE.Vector2(0, 0), new THREE.Vector2(1.6, 2.3), new THREE.Vector2(4.0, 1.7), new THREE.Vector2(BOOM_ELBOW[0], BOOM_ELBOW[1]));
  const thick = (t: number) => THREE.MathUtils.lerp(0.64, 0.5, t) + 0.36 * Math.sin(Math.PI * t);
  const surf = (t: number, side: 1 | -1, extra = 0): THREE.Vector2 => {
    const p = bez.getPoint(t);
    const tg = bez.getTangent(t);
    return new THREE.Vector2(p.x - tg.y * side * (thick(t) / 2 + extra), p.y + tg.x * side * (thick(t) / 2 + extra));
  };
  const BOOM_W = 0.62;
  const sampleStrip = (t0: number, t1: number, grow = 0, n = 14) => {
    const top: THREE.Vector2[] = [];
    const bot: THREE.Vector2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      top.push(surf(t, 1, grow));
      bot.push(surf(t, -1, grow));
    }
    const s = new THREE.Shape();
    top.forEach((p, i) => (i === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
    for (let i = bot.length - 1; i >= 0; i--) s.lineTo(bot[i].x, bot[i].y);
    s.closePath();
    return s;
  };
  const boomBracketB = surf(0.3, 1, 0.22);
  const stickBracketA = surf(0.72, 1, 0.66);
  {
    const k = new Kit();
    k.add(M.paint, extrudeShape(sampleStrip(0, 0.5), -BOOM_W / 2, BOOM_W / 2, 0.04, 6), extrudeShape(sampleStrip(0.5, 1), -BOOM_W / 2, BOOM_W / 2, 0.04, 6));
    // Graphite joint ring where the two parts meet, and lugs at both pins.
    k.add(M.graphite, extrudeShape(sampleStrip(0.485, 0.515, 0.04, 2), -BOOM_W / 2 - 0.03, BOOM_W / 2 + 0.03, 0.01, 2));
    k.add(M.graphite, cyl(0.27, 0.7, "z", [0, 0, 0], 16), cyl(0.25, 0.72, "z", [BOOM_ELBOW[0], BOOM_ELBOW[1], 0], 16));
    // Cylinder brackets: boom cylinder rod end (both sides) and stick cylinder foot (centre).
    for (const zz of [-0.5, 0.5]) k.add(M.graphite, box(0.26, 0.2, 0.1, [boomBracketB.x, boomBracketB.y, zz * 0.78]));
    k.add(M.graphite, cyl(0.07, 1.3, "z", [boomBracketB.x, boomBracketB.y, 0], 10));
    k.add(M.graphite, box(0.28, 0.5, 0.12, [stickBracketA.x, stickBracketA.y - 0.22, 0]), cyl(0.08, 0.3, "z", [stickBracketA.x, stickBracketA.y, 0], 10));
    k.flush(boom);
  }

  /* ---------- Stick ---------- */
  const stick = new THREE.Group();
  stick.position.set(BOOM_ELBOW[0], BOOM_ELBOW[1], 0);
  boom.add(stick);
  const STICK_BR_A: [number, number] = [0.28, 0.88]; // stick-cylinder rod end, on the stick root
  const BUCKET_CYL_A: [number, number] = [1.05, 0.7]; // bucket-cylinder barrel end, on the stick top
  {
    const k = new Kit();
    k.add(
      M.paint,
      slab(
        [
          [-0.32, 0.42],
          [0.3, 0.68],
          [1.2, 0.5],
          [2.3, 0.3],
          [STICK_LEN, 0.22],
          [STICK_LEN, -0.22],
          [2.3, -0.28],
          [1.2, -0.26],
          [0.2, -0.34],
          [-0.32, -0.42],
        ],
        -0.25,
        0.25,
        0.04,
      ),
    );
    k.add(M.graphite, cyl(0.24, 0.62, "z", [0, 0, 0], 16), cyl(0.2, 0.62, "z", [STICK_LEN, 0, 0], 14));
    k.add(M.graphite, box(0.26, 0.5, 0.12, [STICK_BR_A[0], STICK_BR_A[1] - 0.24, 0]), cyl(0.08, 0.3, "z", [STICK_BR_A[0], STICK_BR_A[1], 0], 10));
    k.add(M.graphite, box(0.26, 0.22, 0.12, [BUCKET_CYL_A[0], BUCKET_CYL_A[1] - 0.1, 0]), cyl(0.07, 0.3, "z", [BUCKET_CYL_A[0], BUCKET_CYL_A[1], 0], 10));
    k.flush(stick);
  }

  /* ---------- Bucket with five teeth ---------- */
  const bucket = new THREE.Group();
  bucket.position.set(STICK_LEN, 0, 0);
  stick.add(bucket);
  const BUCKET_EAR: [number, number] = [0.28, 0.7];
  {
    const arc = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(-0.15, 0.1, 0), new THREE.Vector3(0.3, 0.5, 0), new THREE.Vector3(0.95, 0.55, 0), new THREE.Vector3(1.4, 0.1, 0), new THREE.Vector3(1.2, -0.95, 0)],
      false,
      "centripetal",
    );
    const outer: THREE.Vector2[] = [];
    const inner: THREE.Vector2[] = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = arc.getPoint(t);
      const tg = arc.getTangent(t);
      outer.push(new THREE.Vector2(p.x, p.y));
      inner.push(new THREE.Vector2(p.x + tg.y * 0.09, p.y - tg.x * 0.09));
    }
    const shell = new THREE.Shape();
    outer.forEach((p, i) => (i === 0 ? shell.moveTo(p.x, p.y) : shell.lineTo(p.x, p.y)));
    for (let i = inner.length - 1; i >= 0; i--) shell.lineTo(inner[i].x, inner[i].y);
    shell.closePath();
    const side = new THREE.Shape();
    outer.forEach((p, i) => (i === 0 ? side.moveTo(p.x, p.y) : side.lineTo(p.x, p.y)));
    side.closePath();
    const W = 0.62;
    const k = new Kit();
    k.add(M.steel, extrudeShape(shell, -W, W, 0.03, 3), extrudeShape(side, W - 0.02, W + 0.06, 0.015, 3), extrudeShape(side, -W - 0.06, -W + 0.02, 0.015, 3));
    // Cutting edge and five teeth along the lip.
    const E = new THREE.Vector2(1.2, -0.95);
    const dir = new THREE.Vector2(1.35, -1.05).normalize();
    const ang = Math.atan2(dir.y, dir.x);
    k.add(M.tooth, box(0.14, 0.07, W * 2 + 0.02, [E.x, E.y, 0], [0, 0, ang]));
    for (let i = 0; i < 5; i++) {
      const z = -0.52 + i * 0.26;
      const cx = E.x + dir.x * 0.12;
      const cy = E.y + dir.y * 0.12;
      k.add(M.tooth, box(0.2, 0.11, 0.15, [cx, cy, z], [0, 0, ang]));
      k.add(
        M.tooth,
        xform(
          slab(
            [
              [0, -0.065],
              [0.36, 0],
              [0, 0.065],
            ],
            -0.065,
            0.065,
            0.012,
            2,
          ),
          [E.x + dir.x * 0.2, E.y + dir.y * 0.2, z],
          [0, 0, ang],
        ),
      );
    }
    k.add(M.graphite, cyl(0.2, 0.7, "z", [0, 0, 0], 14));
    k.add(M.graphite, box(0.2, 0.3, 0.12, [BUCKET_EAR[0], BUCKET_EAR[1] - 0.12, 0]), cyl(0.07, 0.3, "z", [BUCKET_EAR[0], BUCKET_EAR[1], 0], 10));
    k.flush(bucket, (x, y, z, o) => dirtTint(1.05, [0.52, 0.45, 0.37])(x, y + 0.95, z, o));
  }

  /* ---------- Hydraulic cylinders (three groups; the boom has a pair) ---------- */
  const ramMat = M.ramMat;
  const boomRams = [new Ram(M.graphite, ramMat, 1.7, 0.15, 0.1), new Ram(M.graphite, ramMat, 1.7, 0.15, 0.1)];
  house.add(boomRams[0].group, boomRams[1].group);
  const stickRam = new Ram(M.graphite, M.chrome, 1.6, 0.15, 0.09);
  boom.add(stickRam.group);
  const bucketRam = new Ram(M.graphite, M.chrome, 1.4, 0.12, 0.075);
  stick.add(bucketRam.group);
  const ram = boomRams[0].rod;

  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const updateCylinders = () => {
    boom.updateMatrix();
    stick.updateMatrix();
    bucket.updateMatrix();
    for (const [i, zz] of ([-0.5, 0.5] as const).entries()) {
      A.set(0.85, 0.34, BOOM_FOOT[2] + zz);
      B.set(boomBracketB.x, boomBracketB.y, zz * 0.78).applyMatrix4(boom.matrix);
      boomRams[i].aim(A, B);
    }
    A.set(stickBracketA.x, stickBracketA.y, 0);
    B.set(STICK_BR_A[0], STICK_BR_A[1], 0).applyMatrix4(stick.matrix);
    stickRam.aim(A, B);
    A.set(BUCKET_CYL_A[0], BUCKET_CYL_A[1], 0);
    B.set(BUCKET_EAR[0], BUCKET_EAR[1], 0).applyMatrix4(bucket.matrix);
    bucketRam.aim(A, B);
  };
  const setPose = (p: Pose) => {
    boom.rotation.z = p.boom;
    stick.rotation.z = p.stick;
    bucket.rotation.z = p.bucket;
    updateCylinders();
  };
  setPose({ boom: 0.8, stick: -2.6, bucket: 0.16 });

  /* ---------- Anchors for callouts ---------- */
  const cabA = new THREE.Object3D();
  // Mid-cab (behind the side glass), about 1 m below the roof beacon so the two leaders separate.
  cabA.position.set(1.0, 1.0, -0.94);
  house.add(cabA);
  const cylA = new THREE.Object3D();
  boom.add(cylA);
  cylA.position.set(boomBracketB.x - 0.4, boomBracketB.y - 0.3, 0.5);
  const bucketA = new THREE.Object3D();
  bucket.add(bucketA);
  bucketA.position.set(1.4, 0.1, 0);

  const beaconA = new THREE.Object3D();
  beaconA.position.set(beaconPos[0], beaconPos[1] + 0.1, beaconPos[2]);
  house.add(beaconA);

  const out: Excavator = {
    group,
    house,
    boom,
    stick,
    bucket,
    ram,
    ramMat,
    beaconMat: M.beaconMat,
    setPose,
    updateCylinders,
    setTrack,
    anchors: { cab: cabA, cylinder: cylA, bucket: bucketA, beacon: beaconA },
    triangles: () => triangleCount(group),
  };
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return out;
}
