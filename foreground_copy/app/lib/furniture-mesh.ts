import * as THREE from "three";
import type { TourKind } from "./tour-agent";

const SIZE: Record<TourKind, { width: number; depth: number }> = {
  table: { width: 1.8, depth: 0.9 },
  chair: { width: 0.5, depth: 0.5 },
  sofa: { width: 2.1, depth: 0.9 },
  counter: { width: 2.4, depth: 0.7 },
  wall: { width: 1.4, depth: 0.12 },
};

export function furnitureSize(kind: TourKind) {
  return SIZE[kind];
}

/** A solid piece of furniture standing on y = 0, centered on its footprint. */
export function makeFurniture(kind: TourKind, width = SIZE[kind].width, depth = SIZE[kind].depth) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8d6844, roughness: 0.62 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0xc4b29a, roughness: 0.84 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x6d5b4c, roughness: 0.88 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc5c0b6, roughness: 0.28, metalness: 0.72 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x5f6d4e, roughness: 0.55 });

  if (kind === "chair") buildChair(group, width, depth, wood, cushion);
  else if (kind === "table") buildTable(group, width, depth, wood);
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

function buildCounter(group: THREE.Group, width: number, depth: number, body: THREE.Material, top: THREE.Material) {
  box(group, 0, 0.42, 0, width, 0.84, depth, body);
  box(group, 0, 0.86, 0, width + 0.06, 0.045, depth + 0.06, top);
}

function buildPanel(group: THREE.Group, width: number, depth: number, material: THREE.Material) {
  box(group, 0, 1.05, 0, width, 2.1, Math.max(depth, 0.1), material);
}
