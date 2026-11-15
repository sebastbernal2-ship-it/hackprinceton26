import type { FloorLayout, Point2 } from "./floor-layout";
import { labelsMatch } from "./layout-fit";

/**
 * The link between the two tours' coordinates. The Matterport tour works in the scan's world metres (y up); the
 * Imagine tour works in the Gemini-traced floor plan, which may be flipped or turned against the scan and is shifted
 * to start at 0 (and scaled when the traced area was off). plan = scale * flipSwap(world.xz) + t.
 */
export type FrameMap = {
  swap: boolean;
  sx: 1 | -1;
  sz: 1 | -1;
  scale: number;
  tx: number;
  tz: number;
  /** the scan's floor height, for standing Imagine objects in the Matterport tour */
  floorY: number;
  /** share of the scan's camera spots that land inside a traced room (0..1) */
  score: number;
};

export type ScanGeometry = {
  rooms: { label: string; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }[];
  sweeps: { x: number; y: number; z: number }[];
};

export function toPlan(m: FrameMap, w: { x: number; z: number }): Point2 {
  const a = m.swap ? { x: w.z, z: w.x } : { x: w.x, z: w.z };
  return { x: m.scale * m.sx * a.x + m.tx, z: m.scale * m.sz * a.z + m.tz };
}

export function toWorld(m: FrameMap, p: { x: number; z: number }): Point2 {
  const ax = (p.x - m.tx) / (m.scale * m.sx);
  const az = (p.z - m.tz) / (m.scale * m.sz);
  return m.swap ? { x: az, z: ax } : { x: ax, z: az };
}

/** A movement (no translation) from scan metres to plan metres, and back. */
export function vecToPlan(m: FrameMap, d: { dx: number; dz: number }) {
  const a = m.swap ? { x: d.dz, z: d.dx } : { x: d.dx, z: d.dz };
  return { dx: m.scale * m.sx * a.x, dz: m.scale * m.sz * a.z };
}

export function vecToWorld(m: FrameMap, d: { dx: number; dz: number }) {
  const ax = d.dx / (m.scale * m.sx);
  const az = d.dz / (m.scale * m.sz);
  return m.swap ? { dx: az, dz: ax } : { dx: ax, dz: az };
}

/** A three.js turn about y (radians) carried across the map: the piece faces the same way in both tours. */
export function turnToPlan(m: FrameMap, theta: number) {
  const v = vecToPlan(m, { dx: Math.cos(theta), dz: -Math.sin(theta) });
  return Math.atan2(-v.dz, v.dx);
}

export function turnToWorld(m: FrameMap, theta: number) {
  const v = vecToWorld(m, { dx: Math.cos(theta), dz: -Math.sin(theta) });
  return Math.atan2(-v.dz, v.dx);
}

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

function boxOf(points: Point2[]): Box {
  return points.reduce(
    (b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
}

function iou(a: Box, b: Box) {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (w <= 0 || d <= 0) return 0;
  const inter = w * d;
  return inter / ((a.maxX - a.minX) * (a.maxZ - a.minZ) + (b.maxX - b.minX) * (b.maxZ - b.minZ) - inter);
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

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/**
 * Finds the flip / swap / shift that puts the scan's camera spots (and room centres) inside the traced rooms.
 * Null until both the scan and a traced plan are known, or when no mapping fits well enough to trust.
 */
export function fitFrame(layout: FloorLayout, scan: ScanGeometry | null): FrameMap | null {
  const polys = (layout.polygons ?? []).filter((p) => !p.absorbed && p.points.length >= 3).map((p) => p.points);
  if (!scan || layout.source !== "plan" || !polys.length) return null;
  const points = [
    ...scan.sweeps.map((s) => ({ x: s.x, z: s.z })),
    ...scan.rooms.map((r) => ({ x: (r.min.x + r.max.x) / 2, z: (r.min.z + r.max.z) / 2 })),
  ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  if (points.length < 3) return null;

  const scale = layout.meshAlign?.scale && layout.meshAlign.scale > 0 ? layout.meshAlign.scale : 1;
  const all = polys.flat();
  const planCentre = { x: all.reduce((s, p) => s + p.x, 0) / all.length, z: all.reduce((s, p) => s + p.z, 0) / all.length };
  const floorY = scan.rooms.length ? median(scan.rooms.map((r) => r.min.y)) : median(scan.sweeps.map((s) => s.y - 1.5));

  // the traced rooms' outlines, and each scan room's outline (both as boxes), for overlap scoring
  const polyBoxes = polys.map(boxOf);
  const roomBoxes = scan.rooms
    .map((r) => ({ minX: r.min.x, maxX: r.max.x, minZ: r.min.z, maxZ: r.max.z }))
    .filter((b) => b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5);
  let mappedRooms: Box[] = [];

  // camera spots inside rooms, plus how well every scan room's outline overlaps a traced room: the overlap pins
  // the shift exactly and tells the two ends of a symmetric building apart (a small bath lands on the bath)
  const scoreAt = (mapped: Point2[], tx: number, tz: number) => {
    let hits = 0;
    for (const p of mapped) if (polys.some((poly) => inside(poly, p.x + tx, p.z + tz))) hits += 1;
    const spots = hits / mapped.length;
    if (!mappedRooms.length) return spots;
    let overlap = 0;
    for (const room of mappedRooms) {
      const moved = { minX: room.minX + tx, maxX: room.maxX + tx, minZ: room.minZ + tz, maxZ: room.maxZ + tz };
      overlap += Math.max(...polyBoxes.map((b) => iou(moved, b)));
    }
    return spots + 0.6 * (overlap / mappedRooms.length);
  };

  let best: FrameMap | null = null;
  let bestTotal = -Infinity;
  for (const swap of [false, true]) {
    for (const sx of [1, -1] as const) {
      for (const sz of [1, -1] as const) {
        const base = { swap, sx, sz, scale, tx: 0, tz: 0, floorY, score: 0 };
        const mapped = points.map((p) => toPlan(base, p));
        mappedRooms = roomBoxes.map((b) => {
          const a1 = toPlan(base, { x: b.minX, z: b.minZ });
          const a2 = toPlan(base, { x: b.maxX, z: b.maxZ });
          return { minX: Math.min(a1.x, a2.x), maxX: Math.max(a1.x, a2.x), minZ: Math.min(a1.z, a2.z), maxZ: Math.max(a1.z, a2.z) };
        });
        const centre = { x: mapped.reduce((s, p) => s + p.x, 0) / mapped.length, z: mapped.reduce((s, p) => s + p.z, 0) / mapped.length };
        let tx = planCentre.x - centre.x;
        let tz = planCentre.z - centre.z;
        let score = scoreAt(mapped, tx, tz);
        // coarse then fine search for the shift that seats the most camera spots inside rooms
        for (const [span, step] of [
          [3, 0.25],
          [0.3, 0.05],
        ] as const) {
          const cx = tx;
          const cz = tz;
          for (let dx = -span; dx <= span + 1e-9; dx += step) {
            for (let dz = -span; dz <= span + 1e-9; dz += step) {
              const s = scoreAt(mapped, cx + dx, cz + dz);
              if (s > score + 1e-9) {
                score = s;
                tx = cx + dx;
                tz = cz + dz;
              }
            }
          }
        }
        if (!best || score > bestTotal) {
          bestTotal = score;
          const saved = mappedRooms;
          mappedRooms = [];
          best = { ...base, tx, tz, score: scoreAt(mapped, tx, tz) };
          mappedRooms = saved;
        }
      }
    }
  }
  return best && best.score >= 0.5 ? best : null;
}

/** Where a new Imagine object goes: the middle of its room, staggered so several do not stack. */
export function roomSpot(layout: FloorLayout, room: string, count: number, size: { width: number; depth: number }): Point2 | null {
  const poly = (layout.polygons ?? []).find((entry) => !entry.absorbed && labelsMatch(entry.label, room))
    ?? (layout.polygons ?? []).filter((entry) => !entry.absorbed).sort((a, b) => area(b.points) - area(a.points))[0];
  let centre: Point2 | null = null;
  if (poly && poly.points.length >= 3) {
    centre = poly.points.reduce((sum, point) => ({ x: sum.x + point.x / poly.points.length, z: sum.z + point.z / poly.points.length }), { x: 0, z: 0 });
  } else {
    const rect = layout.rooms.find((entry) => !entry.absorbed && (room ? labelsMatch(entry.label, room) : entry.kind === "dining"));
    if (rect) centre = { x: rect.x + rect.w / 2, z: rect.z + rect.d / 2 };
  }
  if (!centre) return null;
  return { x: centre.x + (count % 3) * (size.width + 0.35), z: centre.z + Math.floor(count / 3) * (size.depth + 0.35) };
}

function area(points: Point2[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}
