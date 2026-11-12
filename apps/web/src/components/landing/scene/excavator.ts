import * as THREE from "three";

/*
 * A generic tracked excavator from primitives and extruded profiles. No brand features: bone
 * house, graphite tracks, steel-blue arm. Forward is +x. Well under 15k triangles.
 */

export type Excavator = {
  group: THREE.Group;
  house: THREE.Group;
  boom: THREE.Group;
  stick: THREE.Group;
  bucket: THREE.Group;
  /** The boom ram: the part that "faults" in the Guardian stage. It owns a cloned material. */
  ram: THREE.Mesh;
  ramMat: THREE.MeshStandardMaterial;
  /** Re-aims the ram between its two anchors after the boom moves. */
  updateRam: () => void;
};

function profile(points: Array<[number, number]>, depth: number, bevel = 0.05): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

export function buildExcavator(): Excavator {
  const bone = new THREE.MeshStandardMaterial({ color: "#d9d4c7", roughness: 0.5, metalness: 0.08 });
  const graphite = new THREE.MeshStandardMaterial({ color: "#23222b", roughness: 0.75, metalness: 0.2 });
  const pad = new THREE.MeshStandardMaterial({ color: "#34333d", roughness: 0.8, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: "#46586d", roughness: 0.42, metalness: 0.45 });
  const rawSteel = new THREE.MeshStandardMaterial({ color: "#8d949b", roughness: 0.38, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: "#2a3d63", roughness: 0.12, metalness: 0.55 });
  const ramMat = new THREE.MeshStandardMaterial({
    color: "#c4c7cb",
    roughness: 0.28,
    metalness: 0.85,
    emissive: new THREE.Color("#000000"),
    emissiveIntensity: 0,
  });

  const group = new THREE.Group();

  // Undercarriage: two tracks with rounded ends, grousers on the shoes, sprockets, a frame.
  const grouser = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.1, 1.12), pad, 4 * 22);
  const m4 = new THREE.Matrix4();
  let gi = 0;
  for (const side of [-1, 1]) {
    const z = side * 1.75;
    group.add(box(5.2, 0.95, 1.0, graphite, 0, 0.55, z));
    for (const end of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 16), graphite);
      w.rotation.x = Math.PI / 2;
      w.position.set(end * 2.6, 0.55, z);
      w.castShadow = true;
      group.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.08, 12), rawSteel);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(end * 2.6, 0.55, z);
      group.add(hub);
    }
    for (const yy of [0.04, 1.06]) {
      for (let i = 0; i < 22; i++) {
        m4.makeTranslation(-2.5 + i * (5.0 / 21), yy, z);
        grouser.setMatrixAt(gi++, m4);
      }
    }
  }
  grouser.castShadow = true;
  group.add(grouser);
  group.add(box(3.4, 0.55, 3.2, graphite, 0, 0.95, 0));

  // Swing house: a profiled body, counterweight at the back, cab on the camera side.
  const house = new THREE.Group();
  house.position.y = 1.3;
  house.add(
    mesh(
      profile(
        [
          [-2.75, 0],
          [2.2, 0],
          [2.2, 1.0],
          [1.8, 1.15],
          [-0.6, 1.15],
          [-1.2, 1.55],
          [-2.3, 1.55],
          [-2.75, 1.2],
        ],
        3.3,
        0.1,
      ),
      bone,
    ),
  );
  house.add(box(1.0, 0.2, 1.8, graphite, -1.65, 1.68, 0)); // engine louvre
  house.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 8), graphite, -2.0, 2.0, -1.0)); // exhaust
  const cab = mesh(
    profile(
      [
        [0, 0],
        [1.9, 0],
        [1.9, 1.1],
        [1.5, 1.75],
        [0.15, 1.75],
        [0, 1.5],
      ],
      1.3,
      0.06,
    ),
    bone,
    -0.4,
    1.15,
    1.0,
  );
  house.add(cab);
  house.add(box(1.05, 0.8, 0.05, glass, 0.55, 2.2, 1.69)); // side window
  const wind = box(0.05, 0.8, 1.05, glass, 1.33, 2.58, 1.0); // windscreen, on the front slope
  wind.rotation.z = 0.55;
  house.add(wind);
  group.add(house);

  // Boom: a banana profile pivoting at the front of the house.
  const boom = new THREE.Group();
  boom.position.set(1.7, 0.85, 0);
  boom.add(
    mesh(
      profile(
        [
          [-0.3, -0.55],
          [2.7, 0.3],
          [6.3, -0.25],
          [6.3, 0.4],
          [2.7, 1.2],
          [-0.3, 0.55],
        ],
        0.75,
      ),
      steel,
    ),
  );
  boom.add(box(0.3, 0.4, 0.3, steel, 2.3, 1.2, 0)); // ram bracket
  house.add(boom);

  const stick = new THREE.Group();
  stick.position.set(6.1, 0.05, 0);
  stick.add(
    mesh(
      profile(
        [
          [-0.35, -0.32],
          [3.5, -0.2],
          [3.5, 0.18],
          [-0.35, 0.4],
        ],
        0.55,
      ),
      steel,
    ),
  );
  boom.add(stick);

  const bucket = new THREE.Group();
  bucket.position.set(3.4, 0, 0);
  bucket.add(
    mesh(
      profile(
        [
          [-0.1, 0.2],
          [0.15, -0.95],
          [1.45, -0.95],
          [1.2, 0.1],
          [0.5, 0.38],
        ],
        1.35,
        0.04,
      ),
      rawSteel,
    ),
  );
  stick.add(bucket);

  // The boom ram sits on top of the boom: house deck to the bracket. Its own cloned material.
  const ram = mesh(new THREE.CylinderGeometry(0.17, 0.17, 1, 12), ramMat);
  house.add(ram);
  house.add(box(0.35, 0.3, 0.35, steel, 0.55, 1.3, 0));
  const from = new THREE.Vector3(0.55, 1.3, 0);
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const updateRam = () => {
    boom.updateMatrix();
    to.set(2.3, 1.4, 0).applyMatrix4(boom.matrix);
    dir.subVectors(to, from);
    const len = dir.length();
    ram.position.copy(from).addScaledVector(dir, 0.5);
    ram.scale.set(1, len, 1);
    ram.quaternion.setFromUnitVectors(up, dir.normalize());
  };
  updateRam();

  return { group, house, boom, stick, bucket, ram, ramMat, updateRam };
}
