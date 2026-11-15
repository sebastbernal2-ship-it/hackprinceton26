/**
 * Walk graph: which panos you can step to from where you stand, which one is "ahead", and which room you are in.
 * Pure, no three.js. Positions are Matterport model space (metres, z-up).
 */

import { modelToThree, yawOf } from "./cube";

export type WalkPano = {
  id: string;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  label?: string;
  skybox?: string[];
  skyboxEmpty?: string[];
};

export type Neighbour = {
  id: string;
  /** horizontal distance in metres */
  distance: number;
  /** three.js yaw from the current pano toward it (0 = -z, positive turns left) */
  yaw: number;
  /** offset from the current pano, three.js world (y-up) */
  offset: [number, number, number];
};

export const NEIGHBOUR_RADIUS_M = 6;
/** a pano with fewer neighbours than this inside the radius reaches out to the nearest ones up to MAX_REACH_M */
const MIN_NEIGHBOURS = 2;
const MAX_REACH_M = 10;
/** two candidates in nearly the same direction: the nearer one hides the farther */
const SAME_BEARING_RAD = (14 * Math.PI) / 180;
/** steps up or down more than this are a different level */
const MAX_DZ_M = 1;

/** Panos you can stand in: those with a full skybox. */
export const walkable = (panos: WalkPano[]): WalkPano[] => panos.filter((p) => p.skybox?.length === 6);

const angleDiff = (a: number, b: number): number => {
  const d = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(d);
};

export function neighbours(panos: WalkPano[], currentId: string, radius = NEIGHBOUR_RADIUS_M): Neighbour[] {
  const cur = panos.find((p) => p.id === currentId);
  if (!cur) return [];
  const [cx, cy, cz] = modelToThree(cur.position);
  const all = walkable(panos)
    .filter((p) => p.id !== currentId && Math.abs(p.position.z - cur.position.z) <= MAX_DZ_M)
    .map((p) => {
      const [x, y, z] = modelToThree(p.position);
      const dx = x - cx;
      const dz = z - cz;
      return { id: p.id, distance: Math.hypot(dx, dz), yaw: yawOf(dx, dz), offset: [dx, y - cy, dz] as [number, number, number] };
    })
    .filter((n) => n.distance > 0.2)
    .sort((a, b) => a.distance - b.distance);
  let pool = all.filter((n) => n.distance <= radius);
  if (pool.length < MIN_NEIGHBOURS) pool = all.filter((n) => n.distance <= MAX_REACH_M).slice(0, Math.max(MIN_NEIGHBOURS, pool.length));
  const out: Neighbour[] = [];
  for (const n of pool) if (!out.some((o) => angleDiff(o.yaw, n.yaw) < SAME_BEARING_RAD)) out.push(n);
  return out;
}

/**
 * The neighbour best aligned with the view yaw (W / up arrow), within maxAngle. Alignment beats distance;
 * among near-equal alignments the closer one wins.
 */
export function bestAligned(list: Neighbour[], viewYaw: number, maxAngle = Math.PI / 4): Neighbour | null {
  let best: Neighbour | null = null;
  let bestScore = -Infinity;
  for (const n of list) {
    const a = angleDiff(n.yaw, viewYaw);
    if (a > maxAngle) continue;
    const score = Math.cos(a) - n.distance * 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

/** Neighbour picked by clicking the floor in a direction: tighter cone than the keyboard step. */
export const pickByDirection = (list: Neighbour[], yaw: number): Neighbour | null => bestAligned(list, yaw, (28 * Math.PI) / 180);

type RoomLike = { label: string; polygon?: [number, number][] };

function inside(pt: [number, number], poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The room (by floor polygon) a pano stands in, or null. */
export function roomAt(rooms: RoomLike[], position: { x: number; y: number }): string | null {
  for (const r of rooms) if (r.polygon && r.polygon.length >= 3 && inside([position.x, position.y], r.polygon)) return r.label;
  return null;
}

/** Compass-ish words for a three.js yaw, relative to the model's +y ("north" on the minimap). */
export function headingWord(yaw: number): string {
  // yaw 0 looks down three -z = model +y
  const deg = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
  const words = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return words[Math.round(deg / 45) % 8];
}

/**
 * The walkable pano nearest a point in Matterport SCENE space (the Web Component's y-up frame, where plan y is -z).
 * A pano on another level counts as farther (each metre of height difference weighs like two on the floor).
 */
export function nearestPano(panos: WalkPano[], scene: { x: number; y: number; z: number }): WalkPano | null {
  let best: WalkPano | null = null;
  let bestD = Infinity;
  for (const p of walkable(panos)) {
    const d = Math.hypot(p.position.x - scene.x, p.position.y + scene.z) + 2 * Math.abs(p.position.z - scene.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
