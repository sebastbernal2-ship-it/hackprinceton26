import * as THREE from "three";
import type { CustomShape } from "./layout-catalog";
import type { TourKind } from "./tour-agent";

const SIZE: Record<TourKind, { width: number; depth: number }> = {
  table: { width: 1.8, depth: 0.9 },
  chair: { width: 0.5, depth: 0.5 },
  sofa: { width: 2.1, depth: 0.9 },
  counter: { width: 2.4, depth: 0.7 },
  wall: { width: 1.4, depth: 0.12 },
  custom: { width: 1, depth: 1 },
};

export function furnitureSize(kind: TourKind) {
  return SIZE[kind];
}

export type CustomLook = { height: number; color: string; shape: CustomShape; name: string; /** same-origin product photo */ image?: string };

/** A solid piece of furniture standing on y = 0, centered on its footprint. */
export function makeFurniture(kind: TourKind, width = SIZE[kind].width, depth = SIZE[kind].depth, custom?: CustomLook) {
  const group = new THREE.Group();
  if (kind === "custom" && custom) {
    buildCustom(group, width, depth, custom);
    addShadow(group, width, depth);
    return group;
  }
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

  addShadow(group, width, depth);
  return group;
}

function addShadow(group: THREE.Group, width: number, depth: number) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(width, depth) * 0.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x1b1a17, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);
}

function colorOf(hex: string): THREE.Color {
  try {
    return new THREE.Color(/^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : "#8d6844");
  } catch {
    return new THREE.Color("#8d6844");
  }
}

/** Any object the owner typed, built from primitives in its size, height and colour. */
function buildCustom(group: THREE.Group, width: number, depth: number, look: CustomLook) {
  const h = Math.min(4, Math.max(0.05, look.height));
  const main = new THREE.MeshStandardMaterial({ color: colorOf(look.color), roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: colorOf(look.color).multiplyScalar(0.55), roughness: 0.7 });
  const green = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd88a, emissiveIntensity: 0.9 });
  switch (look.shape) {
    case "cylinder": {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, h, 28), main);
      m.position.y = h / 2;
      group.add(m);
      break;
    }
    case "sofa": {
      const fabric = new THREE.MeshStandardMaterial({ color: colorOf(look.color), roughness: 0.88 });
      buildSofa(group, width, depth, fabric);
      break;
    }
    case "chair":
      buildChair(group, width, depth, dark, main);
      break;
    case "counter":
      buildCounter(group, width, depth, main, new THREE.MeshStandardMaterial({ color: 0xc5c0b6, roughness: 0.28, metalness: 0.72 }));
      break;
    case "glass": {
      const glass = new THREE.MeshStandardMaterial({ color: colorOf(look.color), transparent: true, opacity: 0.38, roughness: 0.1, metalness: 0.1 });
      box(group, 0, 0.35, 0, width, 0.7, depth, dark);
      box(group, 0, 0.7 + (h - 0.7) / 2, 0, width, Math.max(0.1, h - 0.7), depth, glass);
      break;
    }
    case "table":
      buildTable(group, width, depth, main);
      break;
    case "seat":
      buildChair(group, width, depth, dark, main);
      break;
    case "shelf": {
      box(group, 0, h / 2, -depth / 2 + 0.02, width, h, 0.04, dark);
      for (let y = 0.05; y < h; y += Math.max(0.3, h / 5)) box(group, 0, y, 0, width, 0.03, depth, main);
      box(group, -width / 2 + 0.02, h / 2, 0, 0.04, h, depth, dark);
      box(group, width / 2 - 0.02, h / 2, 0, 0.04, h, depth, dark);
      break;
    }
    case "plant": {
      const potH = Math.min(0.45, h * 0.35);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.32, width * 0.26, potH, 20), main);
      pot.position.y = potH / 2;
      group.add(pot);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(Math.max(width, depth) * 0.48, 18, 14), green);
      leaves.scale.y = Math.max(0.6, (h - potH) / Math.max(width, depth));
      leaves.position.y = potH + ((h - potH) / 2) * 0.95;
      group.add(leaves);
      break;
    }
    case "lamp": {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h * 0.85, 10), dark);
      pole.position.y = (h * 0.85) / 2;
      group.add(pole);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.18, width / 2), h * 0.22, 20, 1, true), main);
      shade.position.y = h * 0.9;
      group.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), glow);
      bulb.position.y = h * 0.86;
      group.add(bulb);
      const light = new THREE.PointLight(0xffd88a, 0.8, 4);
      light.position.y = h * 0.86;
      group.add(light);
      break;
    }
    case "screen": {
      box(group, 0, h - 0.4, 0, width, Math.min(0.8, h * 0.45), 0.06, new THREE.MeshStandardMaterial({ color: 0x111418, emissive: 0x24384a, emissiveIntensity: 0.6 }));
      box(group, 0, (h - 0.8) / 2, 0, 0.06, Math.max(0.05, h - 0.8), 0.06, dark);
      box(group, 0, 0.02, 0, width * 0.4, 0.04, Math.max(depth, 0.3), dark);
      break;
    }
    case "appliance": {
      box(group, 0, h / 2, 0, width, h, depth, main);
      box(group, 0, h * 0.62, depth / 2 + 0.005, width * 0.86, h * 0.5, 0.01, new THREE.MeshStandardMaterial({ color: 0xc5c0b6, metalness: 0.7, roughness: 0.3 }));
      box(group, width * 0.36, h * 0.62, depth / 2 + 0.03, 0.03, h * 0.3, 0.03, dark);
      break;
    }
    default:
      box(group, 0, h / 2, 0, width, h, depth, main);
  }
  // the real product's photo on a card above it, so you see the actual piece the agent picked
  if (look.image) {
    const card = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false }));
    card.position.y = h + 0.95;
    card.scale.set(1.1, 0.82, 1);
    card.renderOrder = 15;
    new THREE.TextureLoader().load(look.image, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const img = texture.image as { width?: number; height?: number } | undefined;
      const ratio = img?.width && img?.height ? img.height / img.width : 0.75;
      card.scale.set(1.1, 1.1 * Math.min(1.4, Math.max(0.45, ratio)), 1);
      card.material.map = texture;
      card.material.opacity = 1;
      card.material.needsUpdate = true;
    });
    group.add(card);
  }
  const tag = nameTag(look.name);
  tag.position.y = h + 0.22;
  const s = Math.min(0.8, Math.max(0.5, width * 0.55));
  tag.scale.set(s, s * 0.22, 1);
  group.add(tag);
}

function nameTag(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 140;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(244,241,234,0.95)";
    ctx.beginPath();
    ctx.roundRect(10, 14, 620, 112, 56);
    ctx.fill();
    ctx.fillStyle = "#d9512c";
    ctx.font = "600 60px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.length > 22 ? `${text.slice(0, 21)}…` : text, 320, 74);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
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
