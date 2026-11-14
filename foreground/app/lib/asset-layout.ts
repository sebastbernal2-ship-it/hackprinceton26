// Footprint placement and clearance checks for catalog assets. Pure geometry; reports problems, never hides them.
import polygonClipping from "polygon-clipping";
import { bbox, type Asset } from "./assets";

export type Placement = { key: string; asset: Asset; x: number; y: number; rot: 0 | 90; poly: [number, number][]; box: { x0: number; y0: number; x1: number; y1: number } };
export type Issue = { kind: "overlap" | "blocked_front" | "narrow_aisle" | "outside_floor"; message: string };
export type PackResult = { placed: Placement[]; unplaced: { asset: Asset; reason: string }[]; issues: Issue[] };

export type Rect = { width: number; depth: number };

const EPS = 1e-6;

function transform(asset: Asset, rot: 0 | 90, x: number, y: number): [number, number][] {
  const b = bbox(asset.footprint);
  const local = asset.footprint.map(([px, py]) => [px - b.x0, py - b.y0] as [number, number]);
  const depth = b.y1 - b.y0;
  // 90 degrees: (px, py) -> (depth - py, px); the front (+y) then faces -x... kept simple: rotate about bbox origin.
  const turned = rot === 90 ? local.map(([px, py]) => [depth - py, px] as [number, number]) : local;
  return turned.map(([px, py]) => [px + x, py + y]);
}

function place(asset: Asset, key: string, rot: 0 | 90, x: number, y: number): Placement {
  const poly = transform(asset, rot, x, y);
  return { key, asset, x, y, rot, poly, box: bbox(poly) };
}

/**
 * Shelf packing that leaves each piece's side clearance between neighbours and its front clearance before the next row.
 * With `respectClearance` false pieces are packed tight (gap 0) so the checks below can show what that breaks.
 */
export function packAssets(floor: Rect, assets: Asset[], respectClearance = true): PackResult {
  const placed: Placement[] = [];
  const unplaced: PackResult["unplaced"] = [];
  const margin = 0.3;
  let x = margin;
  let y = margin;
  let rowDepth = 0;
  let rowGap = 0;
  assets.forEach((asset, i) => {
    const b = bbox(asset.footprint);
    const w = b.x1 - b.x0;
    const d = b.y1 - b.y0;
    const key = `${asset.assetId}-${i}`;
    const side = respectClearance ? asset.clearance.sides : 0;
    const front = respectClearance ? asset.clearance.front + asset.clearance.back : 0;
    let rot: 0 | 90 = 0;
    let pw = w;
    let pd = d;
    if (w > floor.width - 2 * margin + EPS && d <= floor.width - 2 * margin + EPS) { rot = 90; pw = d; pd = w; }
    if (pw > floor.width - 2 * margin + EPS) { unplaced.push({ asset, reason: `${fmt(w)} by ${fmt(d)} m is wider than the floor` }); return; }
    if (x + pw > floor.width - margin + EPS) {
      x = margin;
      y += rowDepth + rowGap;
      rowDepth = 0;
      rowGap = 0;
    }
    if (y + pd > floor.depth - margin + EPS) { unplaced.push({ asset, reason: "no room left on the assumed floor" }); return; }
    placed.push(place(asset, key, rot, x, y));
    x += pw + side;
    rowDepth = Math.max(rowDepth, pd);
    rowGap = Math.max(rowGap, front);
  });
  return { placed, unplaced, issues: checkLayout(floor, placed) };
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

function area(a: [number, number][], b: [number, number][]): number {
  const hit = polygonClipping.intersection([a], [b]);
  let total = 0;
  for (const poly of hit) {
    for (const [i, ring] of poly.entries()) {
      let s = 0;
      for (let k = 0; k < ring.length - 1; k++) s += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
      total += (i === 0 ? 1 : -1) * Math.abs(s / 2);
    }
  }
  return total;
}

/** The rectangle in front of a piece (unrotated: below its bbox, +y; rotated 90: front faces +x) that must stay free. */
export function frontZone(p: Placement): [number, number][] {
  const c = p.asset.clearance.front;
  const { x0, y0, x1, y1 } = p.box;
  return p.rot === 0
    ? [[x0, y1], [x1, y1], [x1, y1 + c], [x0, y1 + c]]
    : [[x1, y0], [x1 + c, y0], [x1 + c, y1], [x1, y1]];
}

export function checkLayout(floor: Rect, placed: Placement[]): Issue[] {
  const issues: Issue[] = [];
  const name = (p: Placement) => p.asset.name;
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    if (a.box.x0 < -EPS || a.box.y0 < -EPS || a.box.x1 > floor.width + EPS || a.box.y1 > floor.depth + EPS) {
      issues.push({ kind: "outside_floor", message: `${name(a)} extends past the assumed floor.` });
    }
    const zone = frontZone(a);
    const zb = bbox(zone);
    if (a.asset.clearance.front > 0 && (zb.x1 > floor.width + EPS || zb.y1 > floor.depth + EPS)) {
      issues.push({ kind: "blocked_front", message: `${name(a)}: its ${fmt(a.asset.clearance.front)} m front clearance runs off the floor.` });
    }
    for (let j = 0; j < placed.length; j++) {
      if (j === i) continue;
      const b = placed[j];
      if (j > i && area(a.poly, b.poly) > 1e-4) issues.push({ kind: "overlap", message: `${name(a)} overlaps ${name(b)}.` });
      if (area(zone, b.poly) > 1e-4 && area(a.poly, b.poly) <= 1e-4) {
        issues.push({ kind: "blocked_front", message: `${name(b)} blocks the ${fmt(a.asset.clearance.front)} m clearance in front of ${name(a)}.` });
      }
      if (j > i) {
        const gap = sideGap(a, b);
        const need = Math.max(a.asset.clearance.sides, b.asset.clearance.sides);
        if (gap !== null && gap >= -EPS && gap < need - EPS && area(a.poly, b.poly) <= 1e-4) {
          issues.push({ kind: "narrow_aisle", message: `${fmt(gap)} m between ${name(a)} and ${name(b)}; the clearance assumption is ${fmt(need)} m.` });
        }
      }
    }
  }
  return issues;
}

/** Gap between two boxes when they face each other across an axis (they share overlap on the other axis), else null. */
function sideGap(a: Placement, b: Placement): number | null {
  const ox = Math.min(a.box.x1, b.box.x1) - Math.max(a.box.x0, b.box.x0);
  const oy = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0);
  if (oy > EPS && ox <= EPS) return -ox;
  if (ox > EPS && oy <= EPS) return -oy;
  return null;
}

export function floorAreaUsed(placed: Placement[]): number {
  return placed.reduce((s, p) => s + area(p.poly, p.poly), 0);
}
