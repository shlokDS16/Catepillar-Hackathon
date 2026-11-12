import * as THREE from "three";
import { heightFog } from "./fog";
import { Kit, box, cyl, dirtTint, extrudeShape, roundRect, triangleCount } from "./parts";

/*
 * The second machine: a small rigid haul truck, built the same way as the excavator (cab, dump
 * body with canopy, chassis, six wheels). Forward is +x, the cab is on the left (-z).
 */

export type HaulTruck = {
  group: THREE.Group;
  /** Spin the wheels for a travelled distance `d` in metres. */
  spin: (d: number) => void;
  triangles: () => number;
};

const WHEEL_R = 0.82;

export function buildHaulTruck(): HaulTruck {
  const paint = heightFog(
    new THREE.MeshPhysicalMaterial({ color: "#E9E4D6", roughness: 0.55, metalness: 0.04, clearcoat: 0.3, clearcoatRoughness: 0.45, vertexColors: true }),
  );
  const graphite = heightFog(new THREE.MeshStandardMaterial({ color: "#2A2924", roughness: 0.75, metalness: 0.25, vertexColors: true }));
  const tyre = heightFog(new THREE.MeshStandardMaterial({ color: "#1b1b1a", roughness: 0.92, metalness: 0.05, vertexColors: true }));
  const hub = heightFog(new THREE.MeshStandardMaterial({ color: "#8b9094", roughness: 0.4, metalness: 0.7 }));
  const glass = heightFog(new THREE.MeshPhysicalMaterial({ color: "#0d131c", roughness: 0.1, metalness: 0.35, clearcoat: 1, envMapIntensity: 1.6 }));
  const lamp = new THREE.MeshBasicMaterial({ color: "#fff4d8", toneMapped: false });

  const group = new THREE.Group();
  const dirt = dirtTint(1.6);
  const k = new Kit();

  // Chassis rails and axles.
  k.add(graphite, box(6.4, 0.34, 0.5, [0, 1.05, -0.75]), box(6.4, 0.34, 0.5, [0, 1.05, 0.75]));
  k.add(graphite, box(0.5, 0.4, 2.4, [2.0, 1.0, 0]), cyl(0.12, 3.2, "z", [-1.2, WHEEL_R, 0], 10), cyl(0.12, 3.2, "z", [-2.5, WHEEL_R, 0], 10));
  // Dump body: tapered, with a canopy over the cab.
  k.add(
    paint,
    extrudeShape(
      (() => {
        const s = new THREE.Shape();
        s.moveTo(-3.35, 1.55);
        s.lineTo(-3.05, 1.25);
        s.lineTo(1.7, 1.25);
        s.lineTo(1.95, 1.5);
        s.lineTo(1.95, 3.1);
        s.lineTo(3.2, 2.98);
        s.lineTo(3.2, 2.82);
        s.lineTo(1.95, 2.8);
        s.lineTo(-3.35, 2.45);
        s.closePath();
        return s;
      })(),
      -1.5,
      1.5,
      0.07,
      3,
    ),
  );
  k.add(graphite, box(5.0, 0.09, 2.9, [-0.7, 1.2, 0]), box(0.2, 0.5, 2.9, [-3.38, 2.0, 0]));
  // Cab under the canopy, front left.
  k.add(paint, extrudeShape(roundRect(1.95, 1.05, 3.1, 2.7, 0.12), -1.55, -0.2, 0.04, 4));
  k.add(graphite, box(0.3, 0.3, 2.0, [3.3, 1.25, 0]), box(0.2, 0.4, 0.2, [-2.8, 2.9, 1.2]));
  // Wheels: tyre, hub and a ring of lug nuts.
  const wheelPos: Array<[number, number]> = [
    [2.0, -1.4],
    [2.0, 1.4],
    [-1.2, -1.4],
    [-1.2, 1.4],
    [-2.5, -1.4],
    [-2.5, 1.4],
  ];
  const wk = new Kit();
  wk.add(tyre, cyl(WHEEL_R, 0.62, "z", [0, 0, 0], 28));
  wk.add(hub, cyl(0.38, 0.68, "z", [0, 0, 0], 16));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    wk.add(graphite, box(0.14, 0.34, 0.05, [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.32], [0, 0, a + Math.PI / 2]));
    wk.add(graphite, box(0.14, 0.34, 0.05, [Math.cos(a) * 0.62, Math.sin(a) * 0.62, -0.32], [0, 0, a + Math.PI / 2]));
  }
  // One instanced mesh per wheel material (tyre, hub, nuts): 3 draws for all six wheels.
  const wheelProto = new THREE.Group();
  wk.flush(wheelProto);
  const wheelMeshes: THREE.InstancedMesh[] = [];
  for (const child of [...wheelProto.children] as THREE.Mesh[]) {
    const im = new THREE.InstancedMesh(child.geometry, child.material as THREE.Material, wheelPos.length);
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
    wheelMeshes.push(im);
  }
  const wm = new THREE.Matrix4();
  const wq = new THREE.Quaternion();
  const wp = new THREE.Vector3();
  const ws = new THREE.Vector3(1, 1, 1);
  const wz = new THREE.Vector3(0, 0, 1);
  const setWheels = (angle: number) => {
    wq.setFromAxisAngle(wz, angle);
    wheelPos.forEach(([x, z], i) => {
      wp.set(x, WHEEL_R, z);
      wm.compose(wp, wq, ws);
      for (const im of wheelMeshes) im.setMatrixAt(i, wm);
    });
    for (const im of wheelMeshes) im.instanceMatrix.needsUpdate = true;
  };
  setWheels(0);
  k.flush(group, (x, y, z, o) => dirt(x, y, z, o));

  const g = new Kit();
  g.add(glass, box(0.03, 1.0, 1.1, [3.07, 1.9, -0.88]), box(1.1, 0.95, 0.03, [2.55, 1.9, -1.5]), box(1.1, 0.95, 0.03, [2.55, 1.9, -0.25]));
  g.add(lamp, box(0.08, 0.14, 0.3, [3.4, 1.3, -0.7]), box(0.08, 0.14, 0.3, [3.4, 1.3, 0.7]));
  g.flush(group);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const spin = (d: number) => {
    setWheels(-d / WHEEL_R);
  };
  return { group, spin, triangles: () => triangleCount(group) };
}
