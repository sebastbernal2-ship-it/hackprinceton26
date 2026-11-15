import { benchmarks } from "@/lib/engine/benchmarks";
import { clamp, dist, distToSide, insideFootprint, itemRect, patioRect, rectInRect, snap } from "./geometry";
import { GRID_M, ITEM_SPECS, type Item, type ItemType, type Layout, type Pt, type Rect, type Side, type Zone, type ZoneKind } from "./types";

export const AISLE_M = benchmarks.layout.aisleM.value;
/** chairs pushed back between neighbouring tables */
export const TABLE_GAP_M = 0.45;
const DOOR_CLEAR_M = 1.5;

const isSeating = (t: ItemType) => ITEM_SPECS[t].group === "seating";
const isCounter = (t: ItemType) => t === "bar-counter" || t === "counter";

/** Clear distance two item types must keep; 0 lets fixtures abut and stools tuck under a counter. */
export function gapNeeded(a: ItemType, b: ItemType): number {
  if ((a === "bar-stool" && isCounter(b)) || (b === "bar-stool" && isCounter(a))) return 0;
  if (a === "bar-stool" && b === "bar-stool") return 0.1;
  if (isSeating(a) || isSeating(b) || a === "bar-stool" || b === "bar-stool") return TABLE_GAP_M;
  return 0;
}

export function makeItem(layout: Layout, type: ItemType, x: number, y: number, rotation: Item["rotation"] = 0): Item {
  const spec = ITEM_SPECS[type];
  return { id: `i${layout.seq}`, type, x, y, rotation, w: spec.w, d: spec.d };
}

export function zoneOf(layout: Layout, kind: ZoneKind): Zone | undefined {
  return layout.zones.filter((z) => z.kind === kind).sort((a, b) => b.w * b.d - a.w * a.d)[0];
}

/** Where a new item of a type belongs: its own zone, else the dining room, else the whole floor. */
export function regionFor(layout: Layout, type: ItemType, zone?: ZoneKind): Rect {
  if (type === "patio-table") return patioRect(layout);
  const z = (zone && zoneOf(layout, zone)) || zoneOf(layout, ITEM_SPECS[type].zone) || zoneOf(layout, "dining");
  return z ?? { x: 0, y: 0, w: layout.footprint.w, d: layout.footprint.d };
}

type Check = { aisles?: "x" | "y" | null; ignore?: Set<string>; sameRoom?: boolean };

/** Whether an item may stand at a spot: on the floor, clear of the door, and keeping its gaps to everything else. */
export function fits(layout: Layout, cand: Item, check: Check = {}): boolean {
  const r = itemRect(cand);
  if (cand.type === "patio-table") {
    if (!rectInRect(r, patioRect(layout))) return false;
  } else if (!insideFootprint(layout.footprint, r, check.sameRoom ?? true)) return false;
  if (cand.type !== "host" && cand.type !== "counter" && cand.type !== "patio-table") {
    const [ex, ey] = layout.entry;
    const dx = Math.max(0, r.x - ex, ex - (r.x + r.w));
    const dy = Math.max(0, r.y - ey, ey - (r.y + r.d));
    if (Math.hypot(dx, dy) < DOOR_CLEAR_M) return false;
  }
  for (const other of layout.items) {
    if (other.id === cand.id || check.ignore?.has(other.id)) continue;
    const o = itemRect(other);
    const gap = gapNeeded(cand.type, other.type);
    const dx = Math.max(0, r.x - (o.x + o.w), o.x - (r.x + r.w));
    const dy = Math.max(0, r.y - (o.y + o.d), o.y - (r.y + r.d));
    if (gap === 0) {
      // touching is fine, overlapping is not
      const overlapX = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x);
      const overlapY = Math.min(r.y + r.d, o.y + o.d) - Math.max(r.y, o.y);
      if (overlapX > 0.01 && overlapY > 0.01) return false;
      continue;
    }
    // table rows: side by side needs the chair gap, row to row needs a full aisle
    if (check.aisles && isSeating(cand.type) && isSeating(other.type)) {
      const along = check.aisles === "x" ? dx : dy;
      const across = check.aisles === "x" ? dy : dx;
      if (along < gap - 1e-6 && across < AISLE_M - 1e-6) return false;
    } else if (Math.hypot(dx, dy) < gap - 1e-6) return false;
  }
  return true;
}

export type SpotOptions = {
  region?: Rect;
  /** prefer spots close to this point */
  near?: Pt;
  /** prefer spots flush against this wall of the bounding box */
  wall?: Side;
  rotations?: Item["rotation"][];
  ignore?: Set<string>;
  sameRoom?: boolean;
};

/** Best free spot for an item type on the 0.25 m grid, or null when the room is full. */
export function findSpot(layout: Layout, type: ItemType, opts: SpotOptions = {}): Pick<Item, "x" | "y" | "rotation"> | null {
  const spec = ITEM_SPECS[type];
  const region = opts.region ?? regionFor(layout, type);
  const horizontalWall = opts.wall === "top" || opts.wall === "bottom";
  // long side runs along the wall it hugs
  const rotations = opts.rotations ?? (opts.wall && spec.w !== spec.d ? [(spec.w > spec.d) === horizontalWall ? 0 : 90] : [0]);
  let best: { x: number; y: number; rotation: Item["rotation"]; score: number } | null = null;
  for (const rotation of rotations as Item["rotation"][]) {
    const probe: Item = { id: "__probe", type, x: 0, y: 0, rotation, w: spec.w, d: spec.d };
    const box = itemRect(probe);
    const x0 = region.x + box.w / 2;
    const y0 = region.y + box.d / 2;
    for (let y = y0; y <= region.y + region.d - box.d / 2 + 1e-6; y += GRID_M) {
      for (let x = x0; x <= region.x + region.w - box.w / 2 + 1e-6; x += GRID_M) {
        probe.x = x;
        probe.y = y;
        let score: number;
        if (opts.wall) {
          const edge = distToSide(layout.footprint, opts.wall, [x, y]) - (horizontalWall ? box.d : box.w) / 2;
          score = edge * 100 + (opts.near ? dist([x, y], opts.near) : horizontalWall ? x : y);
        } else if (opts.near) score = dist([x, y], opts.near);
        else score = dist([x, y], [region.x + region.w / 2, region.y + region.d / 2]);
        if (best && score >= best.score) continue;
        if (fits(layout, probe, { ignore: opts.ignore, sameRoom: opts.sameRoom })) best = { x, y, rotation, score };
      }
    }
  }
  return best ? { x: best.x, y: best.y, rotation: best.rotation } : null;
}

/**
 * Packs tables into rows inside a region: chair gap between neighbours, a full aisle between rows.
 * Adds items from `mix` in turn until `seats` more seats are placed or the region is full. Returns seats added.
 */
export function packSeating(layout: Layout, region: Rect, mix: ItemType[], seats: number): number {
  if (seats <= 0 || mix.length === 0) return 0;
  const aisles: "x" | "y" = region.w >= region.d ? "x" : "y";
  let added = 0;
  let turn = 0;
  let misses = 0;
  const cursor = new Map<ItemType, number>();
  while (added < seats && misses < mix.length) {
    const type = mix[turn % mix.length];
    turn++;
    const spec = ITEM_SPECS[type];
    // do not overshoot the target with a big table when a smaller one in the mix would do
    if (spec.seats > seats - added && mix.some((t) => ITEM_SPECS[t].seats <= seats - added)) continue;
    const probe = makeItem(layout, type, 0, 0, 0);
    const spot = scanRows(layout, region, probe, aisles, cursor.get(type) ?? 0);
    if (!spot) {
      misses++;
      continue;
    }
    misses = 0;
    cursor.set(type, spot.index);
    layout.items.push({ ...probe, x: spot.x, y: spot.y });
    layout.seq++;
    added += spec.seats;
  }
  return added;
}

export function scanRows(layout: Layout, region: Rect, probe: Item, aisles: "x" | "y", from: number) {
  const box = itemRect(probe);
  const nx = Math.floor((region.w - box.w) / GRID_M + 1e-6) + 1;
  const ny = Math.floor((region.d - box.d) / GRID_M + 1e-6) + 1;
  if (nx <= 0 || ny <= 0) return null;
  const total = nx * ny;
  for (let index = from; index < total; index++) {
    // walk along the row direction first so rows fill one after another
    const a = aisles === "x" ? index % nx : Math.floor(index / ny);
    const b = aisles === "x" ? Math.floor(index / nx) : index % ny;
    probe.x = region.x + box.w / 2 + a * GRID_M;
    probe.y = region.y + box.d / 2 + b * GRID_M;
    if (fits(layout, probe, { aisles })) return { x: probe.x, y: probe.y, index };
  }
  return null;
}

/** Stools along the open long sides of every bar counter, 0.6 m apart. Returns the stools placed. */
export function placeStools(layout: Layout, count: number): number {
  let placed = 0;
  const spec = ITEM_SPECS["bar-stool"];
  for (const bar of layout.items.filter((i) => i.type === "bar-counter")) {
    const r = itemRect(bar);
    const alongX = r.w >= r.d;
    const len = alongX ? r.w : r.d;
    const n = Math.floor(len / 0.6);
    const start = (len - n * 0.6) / 2 + 0.3;
    // try the roomier side first
    const sides = [-1, 1].sort((s1, s2) => {
      const c = (s: number): Pt => (alongX ? [bar.x, bar.y + s * (r.d / 2 + 1)] : [bar.x + s * (r.w / 2 + 1), bar.y]);
      return edgeRoom(layout, c(s2)) - edgeRoom(layout, c(s1));
    });
    for (const s of sides) {
      for (let k = 0; k < n && placed < count; k++) {
        const along = start + k * 0.6;
        const x = alongX ? r.x + along : bar.x + s * (r.w / 2 + spec.w / 2);
        const y = alongX ? bar.y + s * (r.d / 2 + spec.d / 2) : r.y + along;
        const stool = makeItem(layout, "bar-stool", x, y);
        if (!fits(layout, stool, { sameRoom: false })) continue;
        layout.items.push(stool);
        layout.seq++;
        placed++;
      }
      if (placed >= count) return placed;
    }
  }
  return placed;
}

function edgeRoom(layout: Layout, p: Pt): number {
  const { w, d } = layout.footprint;
  if (!insideFootprint(layout.footprint, { x: p[0], y: p[1], w: 0, d: 0 })) return -1;
  return Math.min(p[0], w - p[0], p[1], d - p[1]);
}

/** Keep a point inside the bounding box by a margin, on the grid. */
export function clampToFootprint(layout: Layout, p: Pt, margin = 0): Pt {
  return [snap(clamp(p[0], margin, layout.footprint.w - margin)), snap(clamp(p[1], margin, layout.footprint.d - margin))];
}
