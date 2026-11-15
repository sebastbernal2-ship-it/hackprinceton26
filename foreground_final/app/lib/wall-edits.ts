import { layoutWalls, wallSegments, type FloorLayout, type RoomPolygon, type WallRole } from "./floor-layout";

/** A wall as the owner sees it: a number they can name ("remove wall 3"), its ends in plan metres, and its kind. */
export type NumberedWall = {
  key: string;
  number: number;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  role: WallRole | "added";
  length: number;
  /** the traced pieces this wall is made of (a straight wall is often several pieces, or two halves around a door) */
  parts: { key: string; x1: number; z1: number; x2: number; z2: number }[];
  /** rooms on either side, for the agent */
  between: string;
};

/** A wall the owner asked for: ends in plan metres and when it went up (for the grow-in motion). */
export type AddedWall = {
  key: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  at: number;
  /** where it stood before its last move, and when that move started (the slide animation) */
  prev?: { x1: number; z1: number; x2: number; z2: number };
  movedAt?: number;
};

export const MOVE_MS = 1100;

/** Plan-metre offset for a spoken direction: left/right along x, forward (away) / back (toward you) along z. */
export function directionVector(direction: string, meters: number): { dx: number; dz: number } {
  const m = Math.max(0.05, Math.min(10, meters));
  const d = direction.toLowerCase();
  if (/left|west/.test(d)) return { dx: -m, dz: 0 };
  if (/right|east/.test(d)) return { dx: m, dz: 0 };
  if (/forward|up|north|away|front/.test(d)) return { dx: 0, dz: -m };
  return { dx: 0, dz: m };
}

/** Wall edits on top of the scanned plan. removed: key -> when it started coming down (slow-motion removal). */
export type WallEdits = { removed: Record<string, number>; added: AddedWall[] };

export const EMPTY_EDITS: WallEdits = { removed: {}, added: [] };

/** How long a removed wall glows red and sinks, and how long an added wall takes to rise. Slow on purpose. */
export const REMOVE_MS = 3600;
export const ADD_MS = 2200;

/** Dollars per metre of wall, from typical tenant-improvement costs: demolition and patching, or framing and finishing. */
export const REMOVE_WALL_PER_M = 420;
export const REMOVE_SHELL_PER_M = 1800;
export const ADD_WALL_PER_M = 650;

const r = (v: number) => Math.round(v * 10) / 10;

export function wallKey(s: { x1: number; z1: number; x2: number; z2: number }): string {
  const a = `${r(s.x1)},${r(s.z1)}`;
  const b = `${r(s.x2)},${r(s.z2)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Every wall segment of a layout: polygon plans (Gemini-traced floorplan) or the sweep-box fallback. */
export function layoutSegments(layout: FloorLayout): { x1: number; z1: number; x2: number; z2: number; role: WallRole }[] {
  if (layout.polygons?.length) return wallSegments(layout);
  return layoutWalls(layout).map((w) =>
    w.w >= w.d
      ? { x1: w.x, z1: w.z + w.d / 2, x2: w.x + w.w, z2: w.z + w.d / 2, role: w.role }
      : { x1: w.x + w.w / 2, z1: w.z, x2: w.x + w.w / 2, z2: w.z + w.d, role: w.role },
  );
}

function inside(points: { x: number; z: number }[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) hit = !hit;
  }
  return hit;
}

function roomAt(polys: RoomPolygon[], x: number, z: number): string | null {
  return polys.find((p) => !p.absorbed && p.points.length >= 3 && inside(p.points, x, z))?.label ?? null;
}

/**
 * Numbers the walls. `numbers` keeps a wall's number stable across edits (a wall keeps its number while it stands;
 * new walls get the next free number), so "wall 3" means the same wall all session.
 */
type Seg = { x1: number; z1: number; x2: number; z2: number; role: WallRole; key: string; len: number };

const MIN_WALL_M = 0.7;

/** Joins traced pieces into the walls a person would point at: collinear pieces end to end (door gaps included). */
function mergeSegments(raw: { x1: number; z1: number; x2: number; z2: number; role: WallRole }[]): Seg[][] {
  const segs: Seg[] = raw.map((s) => ({ ...s, key: wallKey(s), len: Math.hypot(s.x2 - s.x1, s.z2 - s.z1) }));
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const ends = (s: Seg) => [
    { x: s.x1, z: s.z1 },
    { x: s.x2, z: s.z2 },
  ];
  const near = (a: Seg, b: Seg, gap: number) => ends(a).some((p) => ends(b).some((q) => Math.hypot(p.x - q.x, p.z - q.z) < gap));
  const collinear = (a: Seg, b: Seg) => {
    const ax = (a.x2 - a.x1) / (a.len || 1);
    const az = (a.z2 - a.z1) / (a.len || 1);
    const bx = (b.x2 - b.x1) / (b.len || 1);
    const bz = (b.z2 - b.z1) / (b.len || 1);
    if (Math.abs(ax * bx + az * bz) < 0.95) return false;
    // b's midpoint must sit on a's line
    const mx = (b.x1 + b.x2) / 2 - a.x1;
    const mz = (b.z1 + b.z2) / 2 - a.z1;
    return Math.abs(mx * -az + mz * ax) < 0.18;
  };
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      if (segs[i].role !== segs[j].role || !collinear(segs[i], segs[j])) continue;
      if (near(segs[i], segs[j], segs[i].role === "divider" ? 1.2 : 0.2)) union(i, j);
    }
  }
  const groups = new Map<number, Seg[]>();
  segs.forEach((s, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), s]));
  const all = [...groups.values()];
  const total = (g: Seg[]) => g.reduce((sum, s) => sum + s.len, 0);
  const big = all.filter((g) => total(g) >= MIN_WALL_M);
  // short jogs ride along with the wall they touch, so they come down with it
  for (const g of all.filter((x) => total(x) < MIN_WALL_M)) {
    const host =
      big.find((b) => b.some((s) => g.some((t) => near(s, t, 0.2)))) ??
      big.slice().sort((a, b) => dist(a, g) - dist(b, g))[0];
    if (host) host.push(...g);
    else big.push(g);
  }
  return big;
}

function dist(a: Seg[], b: Seg[]) {
  const mid = (g: Seg[]) => ({ x: g.reduce((s, x) => s + x.x1 + x.x2, 0) / (2 * g.length), z: g.reduce((s, x) => s + x.z1 + x.z2, 0) / (2 * g.length) });
  const p = mid(a);
  const q = mid(b);
  return Math.hypot(p.x - q.x, p.z - q.z);
}

/** The straight line a group of pieces reads as: along its longest piece, from the farthest end to the farthest end. */
function spanOf(group: Seg[]) {
  const main = group.reduce((a, b) => (b.len > a.len ? b : a));
  const ux = (main.x2 - main.x1) / (main.len || 1);
  const uz = (main.z2 - main.z1) / (main.len || 1);
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of group) {
    if (Math.abs(((s.x2 - s.x1) * ux + (s.z2 - s.z1) * uz) / (s.len || 1)) < 0.9) continue;
    for (const p of [
      [s.x1, s.z1],
      [s.x2, s.z2],
    ]) {
      const t = (p[0] - main.x1) * ux + (p[1] - main.z1) * uz;
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
  }
  return { x1: main.x1 + ux * lo, z1: main.z1 + uz * lo, x2: main.x1 + ux * hi, z2: main.z1 + uz * hi };
}

/**
 * Numbers the walls. `numbers` keeps a wall's number stable across edits (a wall keeps its number while it stands;
 * new walls get the next free number), so "wall 3" means the same wall all session.
 */
export function numberWalls(layout: FloorLayout, edits: WallEdits, numbers: Map<string, number>): NumberedWall[] {
  const polys = layout.polygons ?? [];
  const next = () => Math.max(0, ...numbers.values()) + 1;
  const out: NumberedWall[] = [];
  const describe = (s: { x1: number; z1: number; x2: number; z2: number }) => {
    const mx = (s.x1 + s.x2) / 2;
    const mz = (s.z1 + s.z2) / 2;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
    const nx = -(s.z2 - s.z1) / len;
    const nz = (s.x2 - s.x1) / len;
    const a = roomAt(polys, mx + nx * 0.4, mz + nz * 0.4) ?? "outside";
    const b = roomAt(polys, mx - nx * 0.4, mz - nz * 0.4) ?? "outside";
    return a === b ? `inside ${a}` : `between ${a} and ${b}`;
  };
  const groups = mergeSegments(layoutSegments(layout))
    .map((g) => ({ g, span: spanOf(g) }))
    .sort((p, q) => (p.span.z1 + p.span.z2) / 2 - (q.span.z1 + q.span.z2) / 2 || (p.span.x1 + p.span.x2) / 2 - (q.span.x1 + q.span.x2) / 2);
  for (const { g, span } of groups) {
    const key = g
      .map((s) => s.key)
      .sort()
      .join(";");
    if (!numbers.has(key)) numbers.set(key, next());
    out.push({
      key,
      number: numbers.get(key)!,
      ...span,
      role: g[0].role,
      length: g.reduce((sum, s) => sum + s.len, 0),
      between: describe(span),
      parts: g.map((s) => ({ key: s.key, x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 })),
    });
  }
  for (const w of edits.added) {
    if (!numbers.has(w.key)) numbers.set(w.key, next());
    out.push({
      key: w.key,
      number: numbers.get(w.key)!,
      ...pick(w),
      role: "added",
      length: Math.hypot(w.x2 - w.x1, w.z2 - w.z1),
      between: describe(w),
      parts: [{ key: w.key, ...pick(w) }],
    });
  }
  return out.sort((p, q) => p.number - q.number);
}

function pick(s: { x1: number; z1: number; x2: number; z2: number }) {
  return { x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 };
}

/** What taking a wall down costs: outside (shell) walls are structural and cost far more than an interior partition. */
export function removalPrice(wall: NumberedWall): number {
  return Math.round(wall.length * (wall.role === "shell" ? REMOVE_SHELL_PER_M : REMOVE_WALL_PER_M));
}

export function additionPrice(length: number): number {
  return Math.round(length * ADD_WALL_PER_M);
}

/**
 * A new wall across a room: `orientation` across its width (runs along x) or its depth (runs along z), at
 * `position` 0..1 of the way through it. Inset slightly so it meets the existing walls.
 */
export function wallAcrossRoom(
  layout: FloorLayout,
  roomLabel: string,
  orientation: "horizontal" | "vertical",
  position: number,
): Omit<AddedWall, "at" | "key"> | null {
  const poly = (layout.polygons ?? []).find((p) => !p.absorbed && p.label.toLowerCase() === roomLabel.toLowerCase())
    ?? (layout.polygons ?? []).find((p) => !p.absorbed && p.label.toLowerCase().includes(roomLabel.toLowerCase()));
  let box: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  if (poly) {
    box = poly.points.reduce(
      (b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
  } else {
    const rect = layout.rooms.find((e) => !e.absorbed && e.label.toLowerCase().includes(roomLabel.toLowerCase()));
    if (rect) box = { minX: rect.x, maxX: rect.x + rect.w, minZ: rect.z, maxZ: rect.z + rect.d };
  }
  if (!box || !Number.isFinite(box.minX)) return null;
  const t = Math.min(0.85, Math.max(0.15, position));
  if (orientation === "horizontal") {
    const z = box.minZ + (box.maxZ - box.minZ) * t;
    return { x1: box.minX + 0.05, z1: z, x2: box.maxX - 0.05, z2: z };
  }
  const x = box.minX + (box.maxX - box.minX) * t;
  return { x1: x, z1: box.minZ + 0.05, x2: x, z2: box.maxZ - 0.05 };
}

/** How the owner described a new wall: between two numbered walls, beside one, or across a room. */
export type WallAddSpec = {
  room?: string;
  orientation?: "horizontal" | "vertical";
  position?: number;
  /** connect these two walls (wall numbers) */
  between?: [number, number];
  /** run parallel to this wall, `offset` metres into the room */
  near?: number;
  offset?: number;
};

type Seg2 = { x1: number; z1: number; x2: number; z2: number };

function insidePoly(points: { x: number; z: number }[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) hit = !hit;
  }
  return hit;
}

function floorOf(layout: FloorLayout) {
  return (layout.polygons ?? []).filter((poly) => !poly.absorbed && poly.points.length >= 3).map((poly) => poly.points);
}

function edgeDistance(points: { x: number; z: number }[], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const p = closestOn({ x1: a.x, z1: a.z, x2: b.x, z2: b.z }, x, z);
    best = Math.min(best, Math.hypot(p.x - x, p.z - z));
  }
  return best;
}

/** On the floor: inside a traced room, or within 35 cm of one (traced outlines leave gaps along walls and between rooms). */
function onFloor(layout: FloorLayout, x: number, z: number) {
  const floor = floorOf(layout);
  return !floor.length || floor.some((poly) => insidePoly(poly, x, z) || edgeDistance(poly, x, z) < 0.35);
}

/** Keeps the longest stretch of the segment that stands on the floor (a wall cannot run outside the building). */
function trimToFloor(layout: FloorLayout, s: Seg2): Seg2 | null {
  const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
  const steps = Math.max(8, Math.ceil(len / 0.1));
  let best: [number, number] | null = null;
  let start: number | null = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const ok = onFloor(layout, s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t);
    if (ok && start === null) start = t;
    if ((!ok || i === steps) && start !== null) {
      const end = ok ? t : (i - 1) / steps;
      if (!best || end - start > best[1] - best[0]) best = [start, end];
      start = null;
    }
  }
  if (!best || (best[1] - best[0]) * len < 0.4) return null;
  const at = (t: number) => ({ x: s.x1 + (s.x2 - s.x1) * t, z: s.z1 + (s.z2 - s.z1) * t });
  const a = at(best[0]);
  const b = at(best[1]);
  return { x1: a.x, z1: a.z, x2: b.x, z2: b.z };
}

function closestOn(s: Seg2, x: number, z: number) {
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / (dx * dx + dz * dz || 1)));
  return { x: s.x1 + dx * t, z: s.z1 + dz * t };
}

/** The room box for a space label as the agent sees it: "A + B" is open plan, "(front part)" a split half. */
function spaceBox(layout: FloorLayout, label: string) {
  const names = label.replace(/\s*\([^)]*\)\s*$/, "").split(/\s*\+\s*/).map((n) => n.trim().toLowerCase()).filter(Boolean);
  const polys = (layout.polygons ?? []).filter(
    (poly) => !poly.absorbed && names.some((name) => poly.label.toLowerCase() === name || poly.label.toLowerCase().includes(name) || name.includes(poly.label.toLowerCase())),
  );
  if (!polys.length) return null;
  return polys.flatMap((poly) => poly.points).reduce(
    (b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
}

/**
 * Builds the new wall the owner asked for, on the floor as it is now, or says why it cannot.
 * - between [a, b]: from wall a straight across to wall b (closest points)
 * - near n: parallel to wall n, `offset` metres (default 1.2) into the room, as long as wall n
 * - room: across that space at `position` of the way through it
 */
export function buildWall(layout: FloorLayout, walls: NumberedWall[], spec: WallAddSpec): { segment: Seg2 } | { error: string } {
  const byNumber = new Map(walls.map((wall) => [wall.number, wall]));
  let raw: Seg2 | null = null;
  if (spec.between) {
    const a = byNumber.get(spec.between[0]);
    const b = byNumber.get(spec.between[1]);
    if (!a || !b) return { error: `I can't find wall ${!a ? spec.between[0] : spec.between[1]} on this plan.` };
    const mid = { x: (b.x1 + b.x2) / 2, z: (b.z1 + b.z2) / 2 };
    const p = closestOn(a, mid.x, mid.z);
    const q = closestOn(b, p.x, p.z);
    raw = { x1: p.x, z1: p.z, x2: q.x, z2: q.z };
    if (Math.hypot(q.x - p.x, q.z - p.z) < 0.4) return { error: `Walls ${a.number} and ${b.number} already touch, so there is no gap to wall off.` };
  } else if (spec.near !== undefined) {
    const w = byNumber.get(spec.near);
    if (!w) return { error: `I can't find wall ${spec.near} on this plan.` };
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) || 1;
    const nx = -(w.z2 - w.z1) / len;
    const nz = (w.x2 - w.x1) / len;
    const mx = (w.x1 + w.x2) / 2;
    const mz = (w.z1 + w.z2) / 2;
    const offset = Math.max(0.6, Math.min(6, spec.offset ?? 1.2));
    // the room side is whichever side of the wall has floor
    const side = onFloor(layout, mx + nx * offset, mz + nz * offset) ? 1 : onFloor(layout, mx - nx * offset, mz - nz * offset) ? -1 : 0;
    if (!side) return { error: `There is no floor ${offset.toFixed(1)} m from wall ${w.number} on either side.` };
    const ox = nx * offset * side;
    const oz = nz * offset * side;
    const inset = Math.min(0.15, len * 0.1);
    const ux = (w.x2 - w.x1) / len;
    const uz = (w.z2 - w.z1) / len;
    raw = { x1: w.x1 + ox + ux * inset, z1: w.z1 + oz + uz * inset, x2: w.x2 + ox - ux * inset, z2: w.z2 + oz - uz * inset };
  } else if (spec.room) {
    const box = spaceBox(layout, spec.room);
    if (!box) return { error: `I can't find "${spec.room}" on this plan.` };
    const t = Math.min(0.85, Math.max(0.15, spec.position ?? 0.5));
    if ((spec.orientation ?? "horizontal") === "horizontal") {
      const z = box.minZ + (box.maxZ - box.minZ) * t;
      raw = { x1: box.minX + 0.05, z1: z, x2: box.maxX - 0.05, z2: z };
    } else {
      const x = box.minX + (box.maxX - box.minX) * t;
      raw = { x1: x, z1: box.minZ + 0.05, x2: x, z2: box.maxZ - 0.05 };
    }
  }
  if (!raw) return { error: "Tell me where the wall goes: between two wall numbers, near a wall, or across a room." };
  const segment = trimToFloor(layout, raw);
  if (!segment) return { error: "That wall would not stand on the floor of this space." };
  const length = Math.hypot(segment.x2 - segment.x1, segment.z2 - segment.z1);
  if (length > 15) return { error: `That wall would be ${length.toFixed(1)} m long, which is more than a partition can span here. Try between two walls instead.` };
  return { segment };
}
