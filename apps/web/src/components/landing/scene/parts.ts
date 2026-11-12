import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/*
 * Small kit for building a machine from primitives: every part becomes a non-indexed geometry
 * with position and normal only, so all parts of one material merge into a single draw call.
 */

export type Vec3 = [number, number, number];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Strip to position + normal, non-indexed, and bake a transform. */
export function prep(geo: THREE.BufferGeometry, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], scl: Vec3 = [1, 1, 1]): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute("uv");
  g.deleteAttribute("uv1");
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  _m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), _q, new THREE.Vector3(scl[0], scl[1], scl[2]));
  g.applyMatrix4(_m);
  return g;
}

/** Apply a transform to an already prepared geometry. */
export function xform(g: THREE.BufferGeometry, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0]): THREE.BufferGeometry {
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  _m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

export const box = (w: number, h: number, d: number, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0]) =>
  prep(new THREE.BoxGeometry(w, h, d), pos, rot);

/** Cylinder along an axis ("x", "y" or "z"). */
export function cyl(r: number, len: number, axis: "x" | "y" | "z", pos: Vec3 = [0, 0, 0], seg = 14, r2 = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  const rot: Vec3 = axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return prep(g, pos, rot);
}

/** Extrude a closed 2D outline (x, y) along z from z0 to z1, with a small bevel. */
export function slab(points: Array<[number, number]>, z0: number, z1: number, bevel = 0.04, curveSeg = 4): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return extrudeShape(shape, z0, z1, bevel, curveSeg);
}

export function extrudeShape(shape: THREE.Shape, z0: number, z1: number, bevel = 0.04, curveSeg = 4): THREE.BufferGeometry {
  const depth = Math.max(0.001, z1 - z0 - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: curveSeg,
    steps: 1,
  });
  geo.translate(0, 0, z0 + bevel);
  return prep(geo);
}

/** Rounded rectangle outline helper (x0..x1, y0..y1, corner radius r). */
export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** Collects parts per material, then merges each material into one mesh. */
export class Kit {
  private map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, ...geos: THREE.BufferGeometry[]) {
    const list = this.map.get(mat) ?? [];
    list.push(...geos);
    this.map.set(mat, list);
  }
  /** Merge into the parent. `tint` may write a colour attribute from the vertex position. */
  flush(parent: THREE.Object3D, tint?: (x: number, y: number, z: number, out: THREE.Color) => void): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    const col = new THREE.Color();
    for (const [mat, list] of this.map) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const p = merged.attributes.position as THREE.BufferAttribute;
      const arr = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        col.setRGB(1, 1, 1);
        if (tint) tint(p.getX(i), p.getY(i), p.getZ(i), col);
        arr[i * 3] = col.r;
        arr[i * 3 + 1] = col.g;
        arr[i * 3 + 2] = col.b;
      }
      merged.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

export function triangleCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const per = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    n += per * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
  });
  return Math.round(n);
}

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Dusty lower body: darken and warm the vertices below `top` metres. */
export function dirtTint(top = 1.4, dirt: [number, number, number] = [0.58, 0.5, 0.41]) {
  return (_x: number, y: number, _z: number, out: THREE.Color) => {
    const k = sm(0, top, y);
    out.setRGB(dirt[0] + (1 - dirt[0]) * k, dirt[1] + (1 - dirt[1]) * k, dirt[2] + (1 - dirt[2]) * k);
  };
}
