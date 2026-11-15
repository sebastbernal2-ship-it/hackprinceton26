import type { FloorLayout, Point2 } from "./floor-layout";
import type { NumberedWall, WallEdits } from "./wall-edits";

/**
 * One set of placement rules for both tours. Every object lives on the traced floor plan (plan metres); a spot is
 * allowed when the object's footprint is on the floor, crosses no standing wall (removed walls are gone, added walls
 * count) and does not overlap another object.
 */

export type Segment = { x1: number; z1: number; x2: number; z2: number };
export type Footprint = { width: number; depth: number; turn: number };

/** The walls that stand right now: scanned walls not removed, plus the ones the owner added (where they are now). */
export function standingSegments(walls: NumberedWall[], edits: WallEdits): Segment[] {
  return walls
    .filter((wall) => edits.removed[wall.key] === undefined)
    .flatMap((wall) => (wall.role === "added" ? [{ x1: wall.x1, z1: wall.z1, x2: wall.x2, z2: wall.z2 }] : wall.parts));
}

/** The footprint's corners at (x, z), turned like three.js turns it about y. `grow` pads every side. */
export function corners(x: number, z: number, f: Footprint, grow = 0): Point2[] {
  const hw = Math.max(0.05, f.width / 2 + grow);
  const hd = Math.max(0.05, f.depth / 2 + grow);
  const c = Math.cos(f.turn);
  const s = Math.sin(f.turn);
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c }));
}

function inside(points: Point2[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) hit = !hit;
  }
  return hit;
}

function cross(ax: number, az: number, bx: number, bz: number) {
  return ax * bz - az * bx;
}

function segmentsCross(a: Segment, b: Segment) {
  const d1x = a.x2 - a.x1;
  const d1z = a.z2 - a.z1;
  const d2x = b.x2 - b.x1;
  const d2z = b.z2 - b.z1;
  const denom = cross(d1x, d1z, d2x, d2z);
  if (Math.abs(denom) < 1e-12) return false;
  const t = cross(b.x1 - a.x1, b.z1 - a.z1, d2x, d2z) / denom;
  const u = cross(b.x1 - a.x1, b.z1 - a.z1, d1x, d1z) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function hitsWall(rect: Point2[], wall: Segment) {
  for (let i = 0; i < 4; i += 1) {
    const a = rect[i];
    const b = rect[(i + 1) % 4];
    if (segmentsCross({ x1: a.x, z1: a.z, x2: b.x, z2: b.z }, wall)) return true;
  }
  // a short wall entirely under the object
  return inside(rect, wall.x1, wall.z1) || inside(rect, (wall.x1 + wall.x2) / 2, (wall.z1 + wall.z2) / 2);
}

function overlaps(a: Point2[], b: Point2[]) {
  // separating-axis test for two convex quads
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % 4];
      const nx = q.z - p.z;
      const nz = p.x - q.x;
      const project = (pts: Point2[]) => pts.map((pt) => pt.x * nx + pt.z * nz);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

export type Placed = { id: string; x: number; z: number } & Footprint;

/** Whether the object can stand at (x, z) on this plan. */
export function canStand(layout: FloorLayout, walls: Segment[], piece: Footprint & { id?: string }, x: number, z: number, others: Placed[] = []): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const floor = (layout.polygons ?? []).filter((poly) => !poly.absorbed && poly.points.length >= 3).map((poly) => poly.points);
  const rect = corners(x, z, piece);
  // on the floor: every corner (pulled in a little, traced outlines are rough) is inside some room
  if (floor.length) {
    const inset = corners(x, z, piece, -0.08);
    if (!inset.every((pt) => floor.some((poly) => inside(poly, pt.x, pt.z)))) return false;
  }
  // through no standing wall (padded by half a wall's thickness)
  const padded = corners(x, z, piece, 0.05);
  if (walls.some((wall) => hitsWall(padded, wall))) return false;
  // not on top of another object
  return !others.some((other) => other.id !== piece.id && overlaps(rect, corners(other.x, other.z, other, -0.02)));
}

/**
 * Moves toward (x, z) the way a hand would: straight there when allowed, else sliding along whichever axis is free,
 * else staying put. Used for dragging, the arrow pad and chat moves alike.
 */
export function slideTo(
  layout: FloorLayout,
  walls: Segment[],
  piece: Footprint & { id?: string },
  from: Point2,
  to: Point2,
  others: Placed[] = [],
): Point2 {
  if (canStand(layout, walls, piece, to.x, to.z, others)) return to;
  if (canStand(layout, walls, piece, to.x, from.z, others)) return { x: to.x, z: from.z };
  if (canStand(layout, walls, piece, from.x, to.z, others)) return { x: from.x, z: to.z };
  // part of the way, for a long step that ends past a wall
  for (const t of [0.75, 0.5, 0.25]) {
    const mid = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    if (canStand(layout, walls, piece, mid.x, mid.z, others)) return mid;
  }
  return from;
}

/** The nearest allowed spot to (x, z), searching outward in rings; null when nothing within reach is free. */
export function nearestFree(layout: FloorLayout, walls: Segment[], piece: Footprint & { id?: string }, x: number, z: number, others: Placed[] = [], reach = 4): Point2 | null {
  if (canStand(layout, walls, piece, x, z, others)) return { x, z };
  for (let r = 0.25; r <= reach; r += 0.25) {
    const steps = Math.max(8, Math.round((2 * Math.PI * r) / 0.25));
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (canStand(layout, walls, piece, px, pz, others)) return { x: px, z: pz };
    }
  }
  return null;
}

/** A space as it is now (after wall changes), for the layout agent: its size, floor area and what is still free. */
export type Space = { id: string; label: string; width: number; depth: number; area: number; freeArea: number; note?: string };

function polyArea(points: Point2[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The rooms as the owner has changed them: rooms joined by a removed wall become one open space, a room split by an
 * added wall becomes its two parts, and every space reports the floor still free after the objects standing in it.
 */
export function summarizeSpaces(layout: FloorLayout, walls: NumberedWall[], edits: WallEdits, placed: Placed[]): Space[] {
  const rooms = (layout.polygons ?? []).filter((poly) => !poly.absorbed && poly.points.length >= 3);
  if (!rooms.length) return [];
  const parent = new Map(rooms.map((room) => [room.label, room.label]));
  const find = (label: string): string => {
    const up = parent.get(label) ?? label;
    if (up === label) return label;
    const root = find(up);
    parent.set(label, root);
    return root;
  };
  const opened = new Map<string, number[]>();
  for (const wall of walls) {
    if (edits.removed[wall.key] === undefined) continue;
    const match = wall.between.match(/^between (.+) and (.+)$/);
    if (!match || match[1] === "outside" || match[2] === "outside" || !parent.has(match[1]) || !parent.has(match[2])) continue;
    parent.set(find(match[1]), find(match[2]));
    const root = find(match[2]);
    opened.set(root, [...(opened.get(root) ?? []), wall.number]);
  }
  const groups = new Map<string, typeof rooms>();
  for (const room of rooms) groups.set(find(room.label), [...(groups.get(find(room.label)) ?? []), room]);

  const spaces: Space[] = [];
  for (const [root, members] of groups) {
    const pts = members.flatMap((room) => room.points);
    const box = pts.reduce(
      (b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    const area = members.reduce((sum, room) => sum + polyArea(room.points), 0);
    const used = placed
      .filter((piece) => members.some((room) => inside(room.points, piece.x, piece.z)))
      .reduce((sum, piece) => sum + piece.width * piece.depth, 0);
    const label = members.map((room) => room.label).join(" + ");
    const walled = opened.get(root);
    const base: Space = {
      id: root,
      label,
      width: round1(box.maxX - box.minX),
      depth: round1(box.maxZ - box.minZ),
      area: round1(area),
      freeArea: round1(Math.max(0, area - used)),
      note: walled ? `open plan: wall${walled.length > 1 ? "s" : ""} ${walled.join(", ")} removed` : undefined,
    };
    // an added wall inside this space splits it into two parts the agent must fit things into separately
    const split = walls.find(
      (wall) =>
        wall.role === "added" &&
        members.some((room) => inside(room.points, (wall.x1 + wall.x2) / 2, (wall.z1 + wall.z2) / 2)),
    );
    if (!split) {
      spaces.push(base);
      continue;
    }
    const along = Math.abs(split.x2 - split.x1) >= Math.abs(split.z2 - split.z1); // runs left-right: splits depth
    const cut = along ? (split.z1 + split.z2) / 2 : (split.x1 + split.x2) / 2;
    const parts = along
      ? [
          { tag: "front part", width: box.maxX - box.minX, depth: cut - box.minZ },
          { tag: "back part", width: box.maxX - box.minX, depth: box.maxZ - cut },
        ]
      : [
          { tag: "left part", width: cut - box.minX, depth: box.maxZ - box.minZ },
          { tag: "right part", width: box.maxX - cut, depth: box.maxZ - box.minZ },
        ];
    for (const part of parts) {
      const share = (part.width * part.depth) / Math.max(0.01, (box.maxX - box.minX) * (box.maxZ - box.minZ));
      spaces.push({
        ...base,
        id: `${root}:${part.tag}`,
        label: `${label} (${part.tag})`,
        width: round1(part.width),
        depth: round1(part.depth),
        area: round1(area * share),
        freeArea: round1(base.freeArea * share),
        note: `split by new wall ${split.number}${base.note ? `; ${base.note}` : ""}`,
      });
    }
  }
  return spaces.filter((space) => space.width > 0.4 && space.depth > 0.4);
}
