import { ITEM_SPECS, type Item, type Layout, type Pt } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";
import { MAX_SCENE_OBJECTS, MODEL_FOR, planFrameFor, yawFromRotation, type PlanFrame } from "./layout-map";

/**
 * Where the owner's plan stands inside the 360 (docs/deal-flow-plan.md, "Room technique"). Pure: the engine, the
 * mini-plan and the tests all read the same transform. Layout metres and the scan are one metric frame:
 * plan [x, y] -> model (x + box.x, maxY - y, z up) -> three {x, y: z, z: -y}.
 */

/** the engine's eye height above the floor, in metres (the pano rings use the same number) */
export const EYE_M = 1.4;
/** the cube is 6 m to a face: nothing is drawn beyond this, so no piece pokes through a wall photo */
export const FURNITURE_RANGE_M = 5.4;
/** nearer than this and a piece would sit on the lens */
export const FURNITURE_NEAR_M = 0.6;
/** pieces drawn at once (the nearest) */
export const FURNITURE_CAP = Math.min(30, MAX_SCENE_OBJECTS);
/** a piece outside every room outline (the patio strip) shows only when this close */
const OUTSIDE_RANGE_M = 4;

export type RoomPoly = { label: string; polygon: [number, number][] };

export type FurnitureInput = { items: Item[]; frame: PlanFrame; rooms: RoomPoly[] };

export type Placed = {
  id: string;
  type: Item["type"];
  w: number;
  d: number;
  /** three.js world position of the footprint centre, on the floor */
  position: [number, number, number];
  /** radians about +Y */
  yaw: number;
  /** horizontal distance from the camera */
  dist: number;
  /** false: no GLB for this type, drawn as a plain block of the plan's size and height */
  modelled: boolean;
};

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** index of the first room outline holding a model-space point, or -1 */
export function roomIndexAt(rooms: readonly RoomPoly[], x: number, y: number): number {
  return rooms.findIndex((r) => r.polygon.length >= 3 && pointInPolygon([x, y], r.polygon));
}

/** A plan point on the floor at three.js height floorY (the grid and the pieces use this one transform). */
export function planToThree(frame: PlanFrame, p: Pt, floorY: number): [number, number, number] {
  const m = frame.fromPlan(p);
  return [m.x, floorY, -m.y];
}

export function placeItem(frame: PlanFrame, item: Pick<Item, "x" | "y" | "rotation">, floorY: number) {
  return { position: planToThree(frame, [item.x, item.y], floorY), yaw: yawFromRotation(item.rotation) };
}

/** The furniture input for a site, or null when the plan is not in the scan's frame (listing-only floors, no outlines). */
export function furnitureFor(site: Pick<Site, "matterport">, layout: Layout): FurnitureInput | null {
  const mp = site.matterport;
  if (!mp?.scanOfExactSuite) return null;
  const rooms = mp.rooms.filter((r): r is typeof r & { polygon: [number, number][] } => Boolean(r.polygon && r.polygon.length >= 3));
  if (!rooms.length || layout.footprint.source !== "matterport") return null;
  return { items: layout.items, frame: planFrameFor(rooms.map((r) => r.polygon)), rooms: rooms.map((r) => ({ label: r.label, polygon: r.polygon })) };
}

/**
 * The pieces to draw from a pano: same room as the camera (a wall photo cannot hide a piece behind it, so another
 * room's furniture is simply not drawn), inside the cube, not on the lens, nearest first, capped.
 */
export function visibleFurniture(input: FurnitureInput, pano: { x: number; y: number; z: number }, cap = FURNITURE_CAP): Placed[] {
  const floorY = pano.z - EYE_M;
  const here = roomIndexAt(input.rooms, pano.x, pano.y);
  const out: Placed[] = [];
  for (const item of input.items) {
    const m = input.frame.fromPlan([item.x, item.y]);
    const dist = Math.hypot(m.x - pano.x, m.y - pano.y);
    if (dist > FURNITURE_RANGE_M || dist < FURNITURE_NEAR_M) continue;
    const there = roomIndexAt(input.rooms, m.x, m.y);
    // outside every outline (patio): only when close. Camera outside every outline: nothing to compare, keep what is near.
    if (there >= 0 && here >= 0 && there !== here) continue;
    if (there < 0 && dist > OUTSIDE_RANGE_M) continue;
    const { position, yaw } = placeItem(input.frame, item, floorY);
    out.push({ id: item.id, type: item.type, w: item.w, d: item.d, position, yaw, dist, modelled: Boolean(MODEL_FOR[item.type]) });
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, cap);
}

/** block height for an unmodelled piece */
export const blockHeight = (type: Item["type"]) => ITEM_SPECS[type].h;

/**
 * The instruction for the opt-in "AI render of this view": what the plan puts in the view, in the plan's own words.
 * Built from the placed pieces, never typed by hand; under the imagine endpoint's 500 character cap.
 */
export function roomRenderInstruction(concept: string, pieces: Pick<Placed, "type">[]): string {
  const counts = new Map<string, number>();
  for (const p of pieces) counts.set(ITEM_SPECS[p.type].label.toLowerCase(), (counts.get(ITEM_SPECS[p.type].label.toLowerCase()) ?? 0) + 1);
  const list = [...counts].map(([label, n]) => `${n} ${label}${n > 1 ? "s" : ""}`).join(", ");
  const text = `Furnish this empty room as a ${concept.replace("-", " ")} restaurant with exactly this furniture, standing where it is in the view: ${list || "no furniture"}. Keep the walls, windows, floor, ceiling and light exactly as they are.`;
  return text.slice(0, 480);
}
