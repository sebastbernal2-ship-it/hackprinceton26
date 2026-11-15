/**
 * "Clear the space" for the 2D planner. The 3D scan's walk export (assets_<id>/walk/meta.json) lists the furniture and
 * objects the segmentation found, named by shape. This turns the objects of the busiest room into footprints on the
 * planner's floor so they can be shown, swept away, and the floor under them redrawn. Pure logic: no model, no network.
 * The names are guesses from shape and the placement is the scan's own x/y at real size (a floor-sized window of the room when the room is
 * bigger than the planner's assumed floor), so everything drawn from this is an estimate.
 */
export type ScanPiece = { id: string; label?: string | null; kind?: string | null; room?: string | null; on_floor?: boolean; centre: number[]; size: number[]; yaw_deg?: number };
export type ScanObject = { id: string; label: string; kind: string; x: number; y: number; w: number; d: number; yawDeg: number };
export type ScanView = { objects: ScanObject[]; room: string; total: number; omitted: number };

const MARGIN = 0.3;

/** Footprints of the room with the most floor objects, fitted into a width x depth floor (metres), at real size. */
export function scanObjectsForFloor(pieces: ScanPiece[] | null | undefined, floor: { width: number; depth: number }): ScanView | null {
  const usable = (pieces ?? []).filter((p) => p.on_floor !== false && Array.isArray(p.centre) && p.centre.length >= 2 && Array.isArray(p.size) && p.size.length >= 2
    && Number.isFinite(p.centre[0]) && Number.isFinite(p.centre[1]) && p.size[0] > 0.05 && p.size[1] > 0.05);
  if (!usable.length || !(floor.width > 0) || !(floor.depth > 0)) return null;
  const byRoom = new Map<string, ScanPiece[]>();
  for (const p of usable) {
    const r = p.room?.trim() || "scan";
    byRoom.set(r, [...(byRoom.get(r) ?? []), p]);
  }
  const [room, group] = [...byRoom.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  const half = (p: ScanPiece) => {
    const yaw = ((p.yaw_deg ?? 0) * Math.PI) / 180;
    return [(Math.abs(Math.cos(yaw)) * p.size[0] + Math.abs(Math.sin(yaw)) * p.size[1]) / 2, (Math.abs(Math.sin(yaw)) * p.size[0] + Math.abs(Math.cos(yaw)) * p.size[1]) / 2];
  };
  // Real size, always: if the room is bigger than the floor, take the floor-sized window of it holding the most objects.
  const W = floor.width - 2 * MARGIN, D = floor.depth - 2 * MARGIN;
  const box = group.map((p) => { const [hx, hy] = half(p); return { p, x0: p.centre[0] - hx, x1: p.centre[0] + hx, y0: p.centre[1] - hy, y1: p.centre[1] + hy }; });
  let best = { x: Math.min(...box.map((b) => b.x0)), y: Math.min(...box.map((b) => b.y0)), n: -1 };
  for (const a of box) for (const c of box) {
    const x = a.x0, y = c.y0, n = box.filter((b) => b.x0 >= x - 1e-9 && b.x1 <= x + W && b.y0 >= y - 1e-9 && b.y1 <= y + D).length;
    if (n > best.n) best = { x, y, n };
  }
  const inside = box.filter((b) => b.x0 >= best.x - 1e-9 && b.x1 <= best.x + W && b.y0 >= best.y - 1e-9 && b.y1 <= best.y + D);
  const objects = inside.map(({ p }) => ({
    id: p.id,
    label: p.label || p.kind || "object",
    kind: (p.kind || p.label || "object").toLowerCase(),
    x: MARGIN + (p.centre[0] - best.x),
    y: MARGIN + (p.centre[1] - best.y),
    w: p.size[0],
    d: p.size[1],
    yawDeg: p.yaw_deg ?? 0,
  }));
  if (!objects.length) return null;
  return { objects, room, total: usable.length, omitted: usable.length - objects.length };
}

/** Counts per kind, most common first: what the clear removed. */
export function kindCounts(objects: Pick<ScanObject, "kind">[]): [string, number][] {
  const m = new Map<string, number>();
  for (const o of objects) m.set(o.kind, (m.get(o.kind) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Corner points of an object's footprint, rotated by its yaw about its centre. */
export function footprint(o: Pick<ScanObject, "x" | "y" | "w" | "d" | "yawDeg">): [number, number][] {
  const yaw = (o.yawDeg * Math.PI) / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => [o.x + (a * o.w / 2) * c - (b * o.d / 2) * s, o.y + (a * o.w / 2) * s + (b * o.d / 2) * c] as [number, number]);
}

/** Sweep order: seconds of delay so objects vanish left to right as a wave crosses the floor. */
export function sweepDelay(x: number, width: number, seconds = 1.6): number {
  return Math.max(0, Math.min(1, x / Math.max(width, 0.01))) * seconds;
}
