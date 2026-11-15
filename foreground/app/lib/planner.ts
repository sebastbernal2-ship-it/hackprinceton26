// Pure geometry for the top-down cafe planner: snapping, automatic arrangement, seat counts and walking routes.
// Everything is in metres on the assumed floor rectangle; nothing here is a survey or a code check.
import { bbox, type Asset } from "./assets";
import { frontZone, placeAsset, type Placement, type Rect, type Rot } from "./asset-layout";

export type PlacedPiece = { id: string; asset: Asset; rot: Rot; x: number; y: number };
export type Pt = [number, number];

export const GRID = 0.1;
const WALL_SNAP = 0.25;
const ALIGN_SNAP = 0.12;
const MARGIN = 0.1;

export const toPlacement = (p: PlacedPiece): Placement => placeAsset(p.asset, p.id, p.rot, p.x, p.y);
export const toPlacements = (ps: PlacedPiece[]) => ps.map(toPlacement);

let counter = 0;
export const newId = (asset: Asset) => `${asset.assetId}#${Date.now().toString(36)}${(counter++).toString(36)}`;

export const isSeating = (a: Asset) => a.category === "seating";
export const isDining = (a: Asset) => a.category === "seating" || a.category === "table";

/** Seats a piece provides. Counts are ESTIMATES (a booth or banquette seats by length). */
export function seatsOf(a: Asset): number {
  if (!isSeating(a)) return 0;
  if (a.assetId === "booth_60") return 4;
  if (a.assetId === "banquette_90") return 3;
  return 1;
}

export function sizeFor(asset: Asset, rot: Rot): { w: number; d: number } {
  const b = bbox(placeAsset(asset, "s", rot, 0, 0).poly);
  return { w: b.x1 - b.x0, d: b.y1 - b.y0 };
}

/** Snap a proposed top-left corner to the grid, then to walls, then to neighbouring piece edges. */
export function snapPosition(floor: Rect, asset: Asset, rot: Rot, x: number, y: number, others: Placement[]): Pt {
  const { w, d } = sizeFor(asset, rot);
  const g = (v: number) => Math.round(v / GRID) * GRID;
  let sx = g(x);
  let sy = g(y);
  for (const o of others) {
    for (const t of [o.box.x0, o.box.x1 - w]) if (Math.abs(sx - t) < ALIGN_SNAP) { sx = t; break; }
    for (const t of [o.box.y0, o.box.y1 - d]) if (Math.abs(sy - t) < ALIGN_SNAP) { sy = t; break; }
  }
  if (Math.abs(sx) < WALL_SNAP) sx = 0;
  else if (Math.abs(sx + w - floor.width) < WALL_SNAP) sx = floor.width - w;
  if (Math.abs(sy) < WALL_SNAP) sy = 0;
  else if (Math.abs(sy + d - floor.depth) < WALL_SNAP) sy = floor.depth - d;
  return [Math.round(sx * 1000) / 1000, Math.round(sy * 1000) / 1000];
}

/** Rotate a piece a quarter turn about its centre, keeping it where it is. */
export function rotated(p: PlacedPiece): PlacedPiece {
  const before = sizeFor(p.asset, p.rot);
  const rot = ((p.rot + 90) % 360) as Rot;
  const after = sizeFor(p.asset, rot);
  return { ...p, rot, x: p.x + (before.w - after.w) / 2, y: p.y + (before.d - after.d) / 2 };
}

const hit = (a: Placement["box"], b: Placement["box"], pad = 0) =>
  a.x0 < b.x1 + pad && a.x1 + pad > b.x0 && a.y0 < b.y1 + pad && a.y1 + pad > b.y0;

/** First free spot (scanning from the top-left) for a piece, or null when the floor is full. */
export function findSpot(floor: Rect, placed: PlacedPiece[], asset: Asset): { x: number; y: number; rot: Rot } | null {
  const boxes = toPlacements(placed).map((p) => p.box);
  for (const rot of [0, 90] as Rot[]) {
    const { w, d } = sizeFor(asset, rot);
    for (let y = MARGIN; y + d <= floor.depth - MARGIN + 1e-9; y += 0.2) {
      for (let x = MARGIN; x + w <= floor.width - MARGIN + 1e-9; x += 0.2) {
        const box = { x0: x, y0: y, x1: x + w, y1: y + d };
        if (!boxes.some((b) => hit(box, b, 0.1))) return { x, y, rot };
      }
    }
  }
  return null;
}

/**
 * Arrange a kit like a small cafe: counter-side equipment in a row along the back wall, tables in a loose grid in the
 * dining area with their chairs pulled up top and bottom, everything left over wherever it still fits. ESTIMATED layout.
 */
export function autoLayout(floor: Rect, assets: Asset[]): PlacedPiece[] {
  const out: PlacedPiece[] = [];
  const put = (asset: Asset, rot: Rot, x: number, y: number) => out.push({ id: newId(asset), asset, rot, x, y });
  const equipment = assets.filter((a) => !isDining(a));
  const tables = assets.filter((a) => a.category === "table");
  const chairs = assets.filter(isSeating);

  let x = 0.3;
  let y = 0;
  let rowDepth = 0;
  let rowFront = 0;
  for (const a of equipment) {
    const { w, d } = sizeFor(a, 0);
    if (x + w > floor.width - 0.3 && x > 0.3) { x = 0.3; y += rowDepth + rowFront + 0.2; rowDepth = 0; rowFront = 0; }
    if (y + d > floor.depth * 0.5) { const s = findSpot(floor, out, a); if (s) put(a, s.rot, s.x, s.y); continue; }
    put(a, 0, x, y);
    x += w + Math.max(0.15, a.clearance.sides);
    rowDepth = Math.max(rowDepth, d);
    rowFront = Math.max(rowFront, a.clearance.front);
  }
  const top = y + rowDepth + rowFront + 0.4;

  const pool = [...chairs];
  const take = () => pool.shift();
  let cx = 0.6;
  let cy = top + 0.55;
  let rowH = 0;
  for (const t of tables) {
    const tw = sizeFor(t, 0);
    const seatsEach = tw.w > 1 ? 2 : 1;
    const chair = chairs[0];
    const cd = chair ? sizeFor(chair, 0).d : 0.5;
    const cw = chair ? sizeFor(chair, 0).w : 0.46;
    const cellW = Math.max(tw.w, seatsEach * (cw + 0.1)) + 0.7;
    const cellH = tw.d + 2 * (cd + 0.05) + 0.4;
    if (cx + cellW > floor.width - 0.2 && cx > 0.6) { cx = 0.6; cy += rowH; rowH = 0; }
    if (cy + cellH > floor.depth) { const s = findSpot(floor, out, t); if (s) put(t, s.rot, s.x, s.y); continue; }
    const tx = cx + (cellW - tw.w) / 2 - 0.15;
    const ty = cy + cd + 0.05;
    put(t, 0, tx, ty);
    for (let k = 0; k < seatsEach; k++) {
      const topChair = take();
      if (topChair) put(topChair, 0, tx + (tw.w - seatsEach * cw - (seatsEach - 1) * 0.1) / 2 + k * (cw + 0.1), ty - cd - 0.05);
      const bottomChair = take();
      if (bottomChair) put(bottomChair, 180, tx + (tw.w - seatsEach * cw - (seatsEach - 1) * 0.1) / 2 + k * (cw + 0.1), ty + tw.d + 0.05);
    }
    cx += cellW;
    rowH = Math.max(rowH, cellH);
  }
  for (const a of pool) {
    const s = findSpot(floor, out, a);
    if (s) put(a, s.rot, s.x, s.y);
    else put(a, 0, floor.width / 2, floor.depth / 2);
  }
  return out;
}

/** Make a placed list match a kit by asset id: keep what is still wanted, drop the surplus, add the rest in free spots. */
export function reconcile(floor: Rect, placed: PlacedPiece[], kit: Asset[]): PlacedPiece[] {
  if (placed.length === 0) return autoLayout(floor, kit);
  const want = new Map<string, number>();
  for (const a of kit) want.set(a.assetId, (want.get(a.assetId) ?? 0) + 1);
  const next: PlacedPiece[] = [];
  const used = new Map<string, number>();
  for (const p of placed) {
    const n = used.get(p.asset.assetId) ?? 0;
    if (n < (want.get(p.asset.assetId) ?? 0)) { next.push(p); used.set(p.asset.assetId, n + 1); }
  }
  const added = new Map<string, number>();
  for (const a of kit) {
    const have = (used.get(a.assetId) ?? 0) + (added.get(a.assetId) ?? 0);
    if (have >= (want.get(a.assetId) ?? 0)) continue;
    added.set(a.assetId, (added.get(a.assetId) ?? 0) + 1);
    const s = findSpot(floor, next, a);
    next.push({ id: newId(a), asset: a, rot: s?.rot ?? 0, x: s?.x ?? floor.width / 2, y: s?.y ?? floor.depth / 2 });
  }
  return next;
}

export const sameKit = (a: Asset[], b: Asset[]) => {
  if (a.length !== b.length) return false;
  const c = new Map<string, number>();
  for (const x of a) c.set(x.assetId, (c.get(x.assetId) ?? 0) + 1);
  for (const x of b) c.set(x.assetId, (c.get(x.assetId) ?? 0) - 1);
  return [...c.values()].every((v) => v === 0);
};

// ---- visitors ---------------------------------------------------------------------------------------------------

export const DOOR_WIDTH = 1;
export const doorX = (floor: Rect) => Math.min(floor.width - DOOR_WIDTH, Math.max(0.4, floor.width * 0.18)) + DOOR_WIDTH / 2;

const CELL = 0.15;

/** Shortest walkable route between two points around the placed pieces (8-neighbour grid search, then straightened). */
export function route(floor: Rect, placed: Placement[], from: Pt, to: Pt): Pt[] {
  const nx = Math.ceil(floor.width / CELL);
  const ny = Math.ceil(floor.depth / CELL);
  const boxes = placed.map((p) => p.box);
  const near = (p: Pt, q: Pt, r: number) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;
  const blockedAt = (px: number, py: number) => !near([px, py], to, 0.45) && !near([px, py], from, 0.45)
    && boxes.some((b) => px > b.x0 - 0.1 && px < b.x1 + 0.1 && py > b.y0 - 0.1 && py < b.y1 + 0.1);
  const center = (i: number, j: number): Pt => [(i + 0.5) * CELL, (j + 0.5) * CELL];
  const cell = (p: Pt): [number, number] => [Math.min(nx - 1, Math.max(0, Math.floor(p[0] / CELL))), Math.min(ny - 1, Math.max(0, Math.floor(p[1] / CELL)))];
  const blocked = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const [px, py] = center(i, j); blocked[j * nx + i] = blockedAt(px, py) ? 1 : 0; }
  const [si, sj] = cell(from);
  const [gi, gj] = cell(to);
  const prev = new Int32Array(nx * ny).fill(-2);
  const queue = [sj * nx + si];
  prev[sj * nx + si] = -1;
  for (let h = 0; h < queue.length && prev[gj * nx + gi] === -2; h++) {
    const cur = queue[h];
    const ci = cur % nx;
    const cj = (cur - ci) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const k = nj * nx + ni;
      if (prev[k] !== -2 || blocked[k]) continue;
      if (di && dj && (blocked[cj * nx + ni] || blocked[nj * nx + ci])) continue;
      prev[k] = cur;
      queue.push(k);
    }
  }
  if (prev[gj * nx + gi] === -2) return [from, to];
  const cells: Pt[] = [];
  for (let k = gj * nx + gi; k !== -1; k = prev[k]) cells.push(center(k % nx, Math.floor(k / nx)));
  cells.reverse();
  const pts: Pt[] = [from, ...cells.slice(1, -1), to];
  const clear = (a: Pt, b: Pt) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05);
    for (let s = 1; s < n; s++) {
      const px = a[0] + ((b[0] - a[0]) * s) / n;
      const py = a[1] + ((b[1] - a[1]) * s) / n;
      if (blockedAt(px, py)) return false;
    }
    return true;
  };
  const out: Pt[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

export type Leg = { path: Pt[]; pause: number };
export type Visitor = { legs: Leg[]; offset: number; total: number; seat: Pt | null };

const SPEED = 1.1;
const length = (path: Pt[]) => path.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);

/** Where the person at time t (seconds) is, plus whether they are walking and the heading in radians. */
export function visitorAt(v: Visitor, t: number): { p: Pt; moving: boolean; heading: number; hidden: boolean } {
  let u = (((t - v.offset) % v.total) + v.total) % v.total;
  for (const leg of v.legs) {
    const len = length(leg.path);
    const walk = len / SPEED;
    if (u <= walk) {
      let d = u * SPEED;
      for (let i = 1; i < leg.path.length; i++) {
        const a = leg.path[i - 1];
        const b = leg.path[i];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= l || i === leg.path.length - 1) {
          const f = l === 0 ? 1 : Math.min(1, d / l);
          return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], moving: true, heading: Math.atan2(b[1] - a[1], b[0] - a[0]), hidden: false };
        }
        d -= l;
      }
    }
    u -= walk;
    if (u <= leg.pause) {
      const end = leg.path[leg.path.length - 1];
      return { p: end, moving: false, heading: Math.PI / 2, hidden: false };
    }
    u -= leg.pause;
  }
  return { p: v.legs[0].path[0], moving: false, heading: 0, hidden: true };
}

/** A few visitors: in the door, order at the counter, take a seat for a while, leave. ILLUSTRATIVE motion, not a footfall model. */
export function buildVisitors(floor: Rect, placed: PlacedPiece[], count = 5): Visitor[] {
  const ps = toPlacements(placed);
  const door: Pt = [doorX(floor), floor.depth - 0.25];
  const outside: Pt = [door[0], floor.depth + 0.7];
  const order = ps.find((p) => /espresso|bakery_display|display|counter/.test(p.asset.assetId) || p.asset.category === "counter" || p.asset.category === "freezer_display");
  let counterPt: Pt = [floor.width / 2, floor.depth / 2];
  if (order) {
    const z = frontZone(order);
    const zb = bbox(z);
    counterPt = [(zb.x0 + zb.x1) / 2, Math.min(floor.depth - 0.2, (zb.y0 + zb.y1) / 2)];
  }
  const seats: Pt[] = ps.filter((p) => isSeating(p.asset)).map((p) => [(p.box.x0 + p.box.x1) / 2, (p.box.y0 + p.box.y1) / 2] as Pt);
  const fallback: Pt[] = ps.filter((p) => p.asset.category === "table").map((p) => [(p.box.x0 + p.box.x1) / 2, p.box.y1 + 0.35] as Pt);
  const spots = seats.length ? seats : fallback.length ? fallback : [[floor.width * 0.7, floor.depth * 0.7] as Pt];
  const out: Visitor[] = [];
  for (let i = 0; i < count; i++) {
    const seat = spots[(i * 3 + 1) % spots.length];
    // spread the counter queue so people do not stand on each other
    const queue: Pt = [counterPt[0] + ((i % 3) - 1) * 0.3, counterPt[1] + Math.floor(i / 3) * 0.1];
    const legs: Leg[] = [
      { path: [outside, door, ...route(floor, ps, door, queue).slice(1)], pause: 2.5 },
      { path: route(floor, ps, queue, seat), pause: 7 + (i % 3) * 2 },
      { path: [...route(floor, ps, seat, door), outside], pause: 1 },
    ];
    const total = legs.reduce((s, l) => s + length(l.path) / SPEED + l.pause, 0) + 2;
    out.push({ legs, offset: i * (total / count), total, seat });
  }
  return out;
}
