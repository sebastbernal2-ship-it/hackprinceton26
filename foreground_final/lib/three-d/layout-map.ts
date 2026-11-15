import { ITEM_SPECS, scanFrame, type Item, type ItemType, type Layout, type Pt } from "@/lib/layout";

/**
 * Layout metres <-> Matterport scene space (y-up, the Web Component's frame).
 *
 * Scan room outlines are z-up (x, y forward). footprintFor() maps them to plan space with
 * plan = [x - minX, maxY - y]; the scene is {x, y: z, z: -y}. Composed, plan x/y map onto scene x/z
 * with no mirroring: scene.x = planX + minX, scene.z = planY - maxY.
 */
export type SceneVec = { x: number; y: number; z: number };
export type PlanFrame = ReturnType<typeof scanFrame>;

export function planFrameFor(rings: Pt[][]): PlanFrame {
  return scanFrame(rings);
}

/** A plan point on a floor at height floorY, in scene space. */
export function planToScene(frame: PlanFrame, p: Pt, floorY: number): SceneVec {
  const m = frame.fromPlan(p);
  return { x: m.x, y: floorY, z: -m.y };
}

/** Inverse of planToScene (height is dropped). */
export function sceneToPlan(frame: PlanFrame, v: { x: number; z: number }): Pt {
  return frame.toPlan({ x: v.x, y: -v.z });
}

/** Plan rotation is clockwise on a y-down plan; a rotation about scene +Y is counter-clockwise seen from above. */
export const yawFromRotation = (rotation: Item["rotation"]) => -(rotation * Math.PI) / 180;

/** Snaps any yaw (radians about +Y) to the nearest of the layout's four rotations. */
export function rotationFromYaw(yaw: number): Item["rotation"] {
  const deg = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
  return ((Math.round(deg / 90) * 90) % 360) as Item["rotation"];
}

/**
 * Native bounds of each GLB (metres, read from the file's POSITION accessors through its node transforms) and how to
 * scale it to a layout item. `min` is the corner of the bounds: the models are not all authored with the origin on the
 * floor (the round table sits 0.27 m below its origin), so the fit offsets by it.
 */
export type ModelSpec = { url: string; size: [number, number, number]; min: [number, number, number]; fill: number };
const M = "/models";
const TABLE: ModelSpec = { url: `${M}/table.glb`, size: [0.841, 0.327, 0.447], min: [0, 0, -0.447], fill: 0.62 };
const DESK: ModelSpec = { url: `${M}/desk.glb`, size: [0.734, 0.384, 0.392], min: [-0.01, 0, -0.38], fill: 1 };
export const MODEL_FOR: Partial<Record<ItemType, ModelSpec>> = {
  "two-top": TABLE,
  "four-top": TABLE,
  "six-top": TABLE,
  "patio-table": { url: `${M}/tableRound.glb`, size: [0.693, 0.367, 0.8], min: [0, -0.27, -0.8], fill: 0.62 },
  booth: { url: `${M}/bench.glb`, size: [0.4, 0.47, 0.2], min: [0, 0, -0.2], fill: 1 },
  "bar-stool": { url: `${M}/stoolBar.glb`, size: [0.265, 0.435, 0.23], min: [0, 0, -0.23], fill: 1 },
  "bar-counter": { url: `${M}/kitchenBar.glb`, size: [0.43, 0.42, 0.21], min: [0, 0, -0.21], fill: 1 },
  counter: DESK,
  host: DESK,
};

export const MAX_SCENE_OBJECTS = 60;

/** Items the Walk can show, seating and bar first, capped. */
export function sceneItems(layout: Layout, cap = MAX_SCENE_OBJECTS): Item[] {
  const rank = (t: ItemType) => (ITEM_SPECS[t].group === "seating" ? 0 : ITEM_SPECS[t].group === "bar" ? 1 : 2);
  return layout.items
    .filter((i) => MODEL_FOR[i.type])
    .map((i, n) => ({ i, n }))
    .sort((a, b) => rank(a.i.type) - rank(b.i.type) || a.n - b.n)
    .slice(0, cap)
    .map((x) => x.i);
}

/**
 * Scale and offset that put a GLB's footprint centre on its parent's origin and its underside on the floor, sized to the
 * item: footprint w x d (times `fill`, which leaves room for the chairs round a table) and height h.
 */
export function fitModel(item: Pick<Item, "type" | "w" | "d">) {
  const spec = MODEL_FOR[item.type]!;
  const h = ITEM_SPECS[item.type].h;
  const scale: SceneVec = {
    x: (item.w * spec.fill) / spec.size[0],
    y: h / spec.size[1],
    z: (item.d * spec.fill) / spec.size[2],
  };
  const offset: SceneVec = {
    x: -(spec.min[0] + spec.size[0] / 2) * scale.x,
    y: -spec.min[1] * scale.y,
    z: -(spec.min[2] + spec.size[2] / 2) * scale.z,
  };
  return { url: spec.url, scale, offset };
}
