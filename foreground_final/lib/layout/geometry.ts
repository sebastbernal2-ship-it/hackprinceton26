import { GRID_M, PATIO_DEPTH_M, type Footprint, type Item, type Layout, type Pt, type Rect, type Side, type WallRef } from "./types";

export const snap = (v: number, step = GRID_M) => Math.round(v / step) * step;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Axis-aligned box of an item (rotation is in 90 degree steps). */
export function itemRect(it: Pick<Item, "x" | "y" | "w" | "d" | "rotation">): Rect {
  const turned = it.rotation === 90 || it.rotation === 270;
  const w = turned ? it.d : it.w;
  const d = turned ? it.w : it.d;
  return { x: it.x - w / 2, y: it.y - d / 2, w, d };
}

export function rectsOverlap(a: Rect, b: Rect, eps = 0.01): boolean {
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.d - eps && b.y < a.y + a.d - eps;
}

/** Clear distance between two boxes; 0 when they touch or overlap. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(0, a.y - (b.y + b.d), b.y - (a.y + a.d));
  return Math.hypot(dx, dy);
}

export function pointInRect(p: Pt, r: Rect, eps = 1e-6): boolean {
  return p[0] >= r.x - eps && p[0] <= r.x + r.w + eps && p[1] >= r.y - eps && p[1] <= r.y + r.d + eps;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    // points on an edge count as inside
    const cross = (p[0] - xi) * (yj - yi) - (p[1] - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-6 && p[0] >= Math.min(xi, xj) - 1e-6 && p[0] <= Math.max(xi, xj) + 1e-6 && p[1] >= Math.min(yi, yj) - 1e-6 && p[1] <= Math.max(yi, yj) + 1e-6) return true;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

export function bbox(points: Pt[]): Rect {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, d: Math.max(...ys) - y };
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function selfIntersects(poly: Pt[]): boolean {
  const n = poly.length;
  const hit = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => cross(p3, p4, p1) * cross(p3, p4, p2) < 0 && cross(p1, p2, p3) * cross(p1, p2, p4) < 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (hit(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  return false;
}

function hull(points: Pt[]): Pt[] {
  const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return half(pts).concat(half([...pts].reverse()));
}

/** Scanned room rings can arrive as unordered wall endpoints; a self-crossing ring is replaced by its hull. */
export function cleanRing(poly: Pt[]): Pt[] {
  return selfIntersects(poly) ? hull(poly) : poly;
}

const corners = (r: Rect): Pt[] => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.d],
  [r.x, r.y + r.d],
  [r.x + r.w / 2, r.y + r.d / 2],
];

/** Index of the scanned room holding the point; -1 when outside (or 0 for a plain rectangle footprint). */
export function roomAt(fp: Footprint, p: Pt): number {
  if (!fp.rooms) return pointInRect(p, { x: 0, y: 0, w: fp.w, d: fp.d }) ? 0 : -1;
  return fp.rooms.findIndex((r) => pointInPolygon(p, r.polygon));
}

/** True when the whole box is on the floor. `sameRoom` also refuses a box that straddles a scanned wall line. */
export function insideFootprint(fp: Footprint, r: Rect, sameRoom = false): boolean {
  const rooms = corners(r).map((c) => roomAt(fp, c));
  if (rooms.some((i) => i < 0)) return false;
  return !sameRoom || rooms.every((i) => i === rooms[0]);
}

export function resolveSide(layout: Pick<Layout, "front">, wall: WallRef): Side {
  if (wall === "front" || wall === "window") return layout.front;
  if (wall === "back") return OPPOSITE[layout.front];
  return wall;
}

export const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** Unit vector pointing out of the building through a wall. */
export const OUTWARD: Record<Side, Pt> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

/** Distance from a point to a wall of the bounding box. */
export function distToSide(fp: Pick<Footprint, "w" | "d">, side: Side, p: Pt): number {
  return side === "left" ? p[0] : side === "right" ? fp.w - p[0] : side === "top" ? p[1] : fp.d - p[1];
}

/** Strip outside the front wall where patio tables may stand. */
export function patioRect(layout: Pick<Layout, "front" | "footprint">): Rect {
  const { w, d } = layout.footprint;
  const p = PATIO_DEPTH_M;
  if (layout.front === "left") return { x: -p, y: 0, w: p, d };
  if (layout.front === "right") return { x: w, y: 0, w: p, d };
  if (layout.front === "top") return { x: 0, y: -p, w, d: p };
  return { x: 0, y: d, w, d: p };
}

export function rectInRect(inner: Rect, outer: Rect, eps = 1e-6): boolean {
  return inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.d <= outer.y + outer.d + eps;
}

/** Whether an item stands somewhere it is allowed to (floor, or the patio strip for patio tables). */
export function itemInBounds(layout: Pick<Layout, "front" | "footprint">, it: Item): boolean {
  const r = itemRect(it);
  if (insideFootprint(layout.footprint, r)) return true;
  return it.type === "patio-table" && rectInRect(r, patioRect(layout));
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
