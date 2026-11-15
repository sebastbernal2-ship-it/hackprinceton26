import { ITEM_SPECS, fits, gapNeeded, itemInBounds, itemRect, makeItem, patioRect, rectGap, rectInRect, snap, type Item, type ItemType, type Layout, type Op } from "@/lib/layout";

/** A pure edit of the plan: the next layout and the ops that describe it (for the feasibility checks). */
export type Edit = { layout: Layout; ops: Op[] } | { error: string };

const label = (t: ItemType) => ITEM_SPECS[t].label.toLowerCase();

/**
 * Why a piece may not stand here, in words, or null when it may. Checks the same rules `applyOps` places by
 * (`fits`: on the floor, clear of the door, gaps to its neighbours), in the order an owner would read them.
 */
export function placementProblem(layout: Layout, cand: Item): string | null {
  const r = itemRect(cand);
  if (cand.type === "patio-table") {
    if (!rectInRect(r, patioRect(layout))) return "Patio tables stand on the sidewalk strip outside the front wall.";
  } else if (!itemInBounds(layout, cand)) return "That is off the floor.";
  if (fits(layout, cand)) return null;
  let nearest: { gap: number; type: ItemType } | null = null;
  for (const o of layout.items) {
    if (o.id === cand.id) continue;
    const gap = rectGap(r, itemRect(o)) - gapNeeded(cand.type, o.type);
    if (gap < 0 && (!nearest || gap < nearest.gap)) nearest = { gap, type: o.type };
  }
  if (nearest) return `Too close to the ${label(nearest.type)}. Chairs need room to pull out.`;
  if (cand.type === "patio-table") return "Not there.";
  return "Keep 1.5 m clear of the door.";
}

export function moveEdit(layout: Layout, id: string, x: number, y: number): Edit {
  const it = layout.items.find((i) => i.id === id);
  if (!it) return { error: "That piece is no longer on the plan." };
  const next = { ...it, x: snap(x), y: snap(y) };
  if (next.x === it.x && next.y === it.y) return { layout, ops: [] };
  const problem = placementProblem(layout, next);
  if (problem) return { error: problem };
  return { layout: { ...layout, items: layout.items.map((i) => (i.id === id ? next : i)) }, ops: [{ op: "move", itemId: id, to: { x: next.x, y: next.y } }] };
}

export function addAtEdit(layout: Layout, type: ItemType, x: number, y: number): Edit {
  const it = makeItem(layout, type, snap(x), snap(y), 0);
  const problem = placementProblem(layout, it);
  if (problem) return { error: problem };
  return { layout: { ...layout, items: [...layout.items, it], seq: layout.seq + 1 }, ops: [{ op: "add", type, count: 1 }] };
}

export function removeEdit(layout: Layout, id: string): Edit {
  const it = layout.items.find((i) => i.id === id);
  if (!it) return { error: "That piece is no longer on the plan." };
  return { layout: { ...layout, items: layout.items.filter((i) => i.id !== id) }, ops: [{ op: "remove", type: it.type, count: 1 }] };
}

export function rotateEdit(layout: Layout, id: string): Edit {
  const it = layout.items.find((i) => i.id === id);
  if (!it) return { error: "That piece is no longer on the plan." };
  const next: Item = { ...it, rotation: ((it.rotation + 90) % 360) as Item["rotation"] };
  const problem = placementProblem(layout, next);
  if (problem) return { error: `It cannot turn here. ${problem}` };
  return { layout: { ...layout, items: layout.items.map((i) => (i.id === id ? next : i)) }, ops: [] };
}
