import * as THREE from "three";
import type { TourKind } from "./tour-agent";

const SIZE: Record<TourKind, { width: number; depth: number }> = {
  table: { width: 1.8, depth: 0.9 },
  chair: { width: 0.5, depth: 0.5 },
  sofa: { width: 2.1, depth: 0.9 },
  counter: { width: 2.4, depth: 0.7 },
  wall: { width: 1.4, depth: 0.12 },
};

/** A solid piece of furniture standing on y = 0, centered on its footprint. */
export function makeFurniture(kind: TourKind, width = SIZE[kind].width, depth = SIZE[kind].depth, label = "") {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8d6844, roughness: 0.62 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0xc4b29a, roughness: 0.84 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x6d5b4c, roughness: 0.88 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc5c0b6, roughness: 0.28, metalness: 0.72 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x5f6d4e, roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.42 });
  const name = `${label} ${kind}`.toLowerCase();

  if (/kitchen|island|range|cabinet|oven/.test(name)) buildKitchen(group, width, depth, white, stone, metal);
  else if (/stool/.test(name)) buildStool(group, width, depth, wood, cushion, metal);
  else if (/booth|banquette/.test(name)) buildBooth(group, width, depth, fabric, wood);
  else if (/plant|tree|fern/.test(name)) buildPlant(group, width, depth, stone);
  else if (kind === "chair" || /chair|seat/.test(name)) buildChair(group, width, depth, wood, cushion);
  else if (kind === "table" || /table|desk/.test(name)) buildTable(group, width, depth, wood);
  else if (kind === "sofa") buildSofa(group, width, depth, fabric);
  else if (kind === "counter") buildCounter(group, width, depth, stone, metal);
  else buildPanel(group, width, depth, stone);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(width, depth) * 0.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x1b1a17, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);
  return group;
}

function box(group: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  group.add(mesh);
}

function buildChair(group: THREE.Group, width: number, depth: number, wood: THREE.Material, cushion: THREE.Material) {
  const leg = 0.045;
  const seat = 0.46;
  const insetX = width / 2 - leg;
  const insetZ = depth / 2 - leg;
  for (const x of [-insetX, insetX]) {
    for (const z of [-insetZ, insetZ]) box(group, x, seat / 2, z, leg, seat, leg, wood);
  }
  box(group, 0, seat + 0.03, 0.02, width * 0.92, 0.06, depth * 0.9, cushion);
  box(group, -insetX, 0.66, -insetZ, leg, 0.86, leg, wood);
  box(group, insetX, 0.66, -insetZ, leg, 0.86, leg, wood);
  box(group, 0, 0.82, -insetZ, width * 0.84, 0.32, 0.035, wood);
}

function buildTable(group: THREE.Group, width: number, depth: number, wood: THREE.Material) {
  const top = 0.75;
  const leg = 0.07;
  box(group, 0, top - 0.025, 0, width, 0.05, depth, wood);
  const insetX = width / 2 - 0.12;
  const insetZ = depth / 2 - 0.12;
  for (const x of [-insetX, insetX]) {
    for (const z of [-insetZ, insetZ]) box(group, x, (top - 0.05) / 2, z, leg, top - 0.05, leg, wood);
  }
}

function buildSofa(group: THREE.Group, width: number, depth: number, fabric: THREE.Material) {
  box(group, 0, 0.22, 0.04, width, 0.4, depth * 0.82, fabric);
  box(group, 0, 0.58, -depth / 2 + 0.08, width, 0.42, 0.14, fabric);
  box(group, -width / 2 + 0.07, 0.48, 0.02, 0.12, 0.28, depth * 0.78, fabric);
  box(group, width / 2 - 0.07, 0.48, 0.02, 0.12, 0.28, depth * 0.78, fabric);
}

function buildKitchen(group: THREE.Group, width: number, depth: number, cabinet: THREE.Material, body: THREE.Material, metal: THREE.Material) {
  const run = Math.max(width, 1.4);
  const deep = Math.max(depth, 0.62);
  box(group, 0, 0.43, 0.04, run * 0.96, 0.84, deep * 0.78, cabinet);
  box(group, 0, 0.9, 0.02, run, 0.05, deep, body);
  box(group, 0, 1.55, -deep / 2 + 0.16, run * 0.92, 0.62, 0.32, cabinet);
  const bays = Math.max(2, Math.round(run / 0.7));
  for (let index = 0; index < bays; index += 1) {
    const x = -run / 2 + (index + 0.5) * (run / bays);
    box(group, x, 0.46, deep * 0.42, 0.02, 0.7, 0.02, metal);
    if (index === 1) {
      box(group, x, 0.93, 0.08, 0.42, 0.02, 0.42, metal);
      box(group, x, 0.96, 0.08, 0.16, 0.04, 0.16, metal);
    }
  }
}

function buildStool(group: THREE.Group, width: number, depth: number, wood: THREE.Material, cushion: THREE.Material, metal: THREE.Material) {
  const radius = Math.min(width, depth) * 0.38;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.06, 20), cushion);
  seat.position.y = 0.74;
  group.add(seat);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 12), metal);
  post.position.y = 0.38;
  group.add(post);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 0.015, 8, 20), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.28;
  group.add(ring);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, 0.03, 20), wood);
  base.position.y = 0.02;
  group.add(base);
}

function buildBooth(group: THREE.Group, width: number, depth: number, fabric: THREE.Material, wood: THREE.Material) {
  box(group, 0, 0.28, depth * 0.08, width, 0.42, depth * 0.62, fabric);
  box(group, 0, 0.72, -depth / 2 + 0.1, width, 0.9, 0.14, wood);
  box(group, -width / 2 + 0.06, 0.55, 0.04, 0.1, 0.7, depth * 0.7, wood);
  box(group, width / 2 - 0.06, 0.55, 0.04, 0.1, 0.7, depth * 0.7, wood);
}

function buildPlant(group: THREE.Group, width: number, depth: number, pot: THREE.Material) {
  const radius = Math.min(width, depth) * 0.28;
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.72, 0.32, 16), pot);
  planter.position.y = 0.16;
  group.add(planter);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f6b45, roughness: 0.8 });
  const foliage = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 16, 12), leaf);
  foliage.position.y = 0.62;
  group.add(foliage);
}

function buildCounter(group: THREE.Group, width: number, depth: number, body: THREE.Material, top: THREE.Material) {
  box(group, 0, 0.42, 0, width, 0.84, depth, body);
  box(group, 0, 0.86, 0, width + 0.06, 0.045, depth + 0.06, top);
}

function buildPanel(group: THREE.Group, width: number, depth: number, material: THREE.Material) {
  box(group, 0, 1.05, 0, width, 2.1, Math.max(depth, 0.1), material);
}
