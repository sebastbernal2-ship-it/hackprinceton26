import { benchmarks } from "@/lib/engine/benchmarks";
import { itemInBounds, itemRect, rectsOverlap, roomAt } from "./geometry";
import { GRID_M, ITEM_SPECS, type Item, type Layout, type Pt, type Warning } from "./types";

const PATH_M = benchmarks.layout.accessiblePathM.value;

export function seatCount(layout: Pick<Layout, "items">): number {
  return layout.items.reduce((n, it) => n + ITEM_SPECS[it.type].seats, 0);
}

export function countByType(layout: Pick<Layout, "items">): Partial<Record<Item["type"], number>> {
  const out: Partial<Record<Item["type"], number>> = {};
  for (const it of layout.items) out[it.type] = (out[it.type] ?? 0) + 1;
  return out;
}

/** Ids of items that overlap another item or stand off the floor. Cheap enough to run on every drag frame. */
export function conflicts(layout: Layout): { overlapping: Set<string>; outside: Set<string> } {
  const overlapping = new Set<string>();
  const outside = new Set<string>();
  const rects = layout.items.map(itemRect);
  for (let i = 0; i < layout.items.length; i++) {
    if (!itemInBounds(layout, layout.items[i])) outside.add(layout.items[i].id);
    for (let j = i + 1; j < layout.items.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) {
        overlapping.add(layout.items[i].id);
        overlapping.add(layout.items[j].id);
      }
    }
  }
  return { overlapping, outside };
}

/**
 * Floor cells a person can stand in with a 0.9 m clear route: on the floor and at least half that width from
 * every item. Flood-filled from the door. Scanned wall lines have no thickness, so doorways are assumed.
 */
export function reachable(layout: Layout): { cols: number; rows: number; free: Uint8Array; seen: Uint8Array } {
  const cols = Math.ceil(layout.footprint.w / GRID_M);
  const rows = Math.ceil(layout.footprint.d / GRID_M);
  const free = new Uint8Array(cols * rows);
  const half = PATH_M / 2 - GRID_M / 2;
  const rects = layout.items.filter((i) => i.type !== "patio-table").map(itemRect);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p: Pt = [(c + 0.5) * GRID_M, (r + 0.5) * GRID_M];
      if (roomAt(layout.footprint, p) < 0) continue;
      let ok = true;
      for (const b of rects) {
        if (p[0] > b.x - half && p[0] < b.x + b.w + half && p[1] > b.y - half && p[1] < b.y + b.d + half) {
          ok = false;
          break;
        }
      }
      if (ok) free[r * cols + c] = 1;
    }
  }
  const seen = new Uint8Array(cols * rows);
  const start = nearestFree(layout.entry, cols, rows, free);
  if (start >= 0) {
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const cell = queue.pop()!;
      const c = cell % cols;
      const r = (cell - c) / cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nr * cols + nc;
        if (free[n] && !seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
  }
  return { cols, rows, free, seen };
}

function nearestFree(p: Pt, cols: number, rows: number, free: Uint8Array): number {
  const c0 = Math.floor(p[0] / GRID_M);
  const r0 = Math.floor(p[1] / GRID_M);
  for (let radius = 0; radius <= 6; radius++)
    for (let r = r0 - radius; r <= r0 + radius; r++)
      for (let c = c0 - radius; c <= c0 + radius; c++) if (r >= 0 && c >= 0 && r < rows && c < cols && free[r * cols + c]) return r * cols + c;
  return -1;
}

/** True when some reachable cell lies within `reach` metres of the item's box. */
function canReach(item: Item, grid: ReturnType<typeof reachable>, reach = 0.75): boolean {
  const b = itemRect(item);
  const c0 = Math.max(0, Math.floor((b.x - reach) / GRID_M));
  const c1 = Math.min(grid.cols - 1, Math.floor((b.x + b.w + reach) / GRID_M));
  const r0 = Math.max(0, Math.floor((b.y - reach) / GRID_M));
  const r1 = Math.min(grid.rows - 1, Math.floor((b.y + b.d + reach) / GRID_M));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (grid.seen[r * grid.cols + c]) return true;
  return false;
}

const list = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("{n}", String(n)));

/** Everything wrong with the plan, in the owner's words. An empty list means the plan works on paper. */
export function validate(layout: Layout): Warning[] {
  const out: Warning[] = [];
  const { overlapping, outside } = conflicts(layout);
  if (overlapping.size)
    out.push({ kind: "collision", itemIds: [...overlapping], message: list(overlapping.size, "", "{n} pieces overlap. Pull them apart so each has its own floor.") });
  if (outside.size)
    out.push({
      kind: "out-of-bounds",
      itemIds: [...outside],
      message: list(outside.size, "1 piece is outside the walls. Drag it back onto the floor.", "{n} pieces are outside the walls. Drag them back onto the floor."),
    });

  const grid = reachable(layout);
  const indoor = layout.items.filter((i) => i.type !== "patio-table" && !outside.has(i.id));
  const cut = (items: Item[]) => items.filter((i) => !canReach(i, grid));
  const restrooms = cut(indoor.filter((i) => i.type === "restroom"));
  if (restrooms.length)
    out.push({ kind: "blocked-egress", itemIds: restrooms.map((i) => i.id), message: `No clear ${PATH_M} m route from the door to the restroom. Open an aisle.` });
  const kitchen = cut(indoor.filter((i) => i.type === "kitchen-line"));
  if (kitchen.length) out.push({ kind: "blocked-egress", itemIds: kitchen.map((i) => i.id), message: `No clear ${PATH_M} m route from the door to the cook line.` });
  const seats = cut(indoor.filter((i) => ITEM_SPECS[i.type].seats > 0));
  if (seats.length)
    out.push({
      kind: "blocked-egress",
      itemIds: seats.map((i) => i.id),
      message: list(seats.length, `1 table has no ${PATH_M} m route to the door.`, `{n} tables have no ${PATH_M} m route to the door.`),
    });

  if (!layout.items.some((i) => i.type === "restroom")) out.push({ kind: "missing", itemIds: [], message: "No restroom on the plan. Guests and staff need one." });
  if (!layout.items.some((i) => i.type === "kitchen-line") && layout.concept !== "cafe" && layout.concept !== "bar")
    out.push({ kind: "missing", itemIds: [], message: "No cook line on the plan." });
  return out;
}
