import type { Change, Involves } from "@/lib/feasibility";
import { ITEM_SPECS, dist, seatCount, type ItemType, type Layout } from "@/lib/layout";

const FT = 3.281;
const SQFT = 10.764;

const count = (l: Layout, ...types: ItemType[]) => l.items.filter((i) => types.includes(i.type)).length;
const length = (l: Layout, type: ItemType) => l.items.filter((i) => i.type === type).reduce((s, i) => s + Math.max(i.w, i.d), 0);

/**
 * One feasibility `Change` of kind "layout" per group of items the owner touched, found by diffing the plan against
 * the suggested one. `involves` comes from what the group is (a cook line triggers hood and grease, a bar triggers
 * alcohol and plumbing); quantities are the difference. Removing things never triggers a check.
 */
export function layoutChanges(base: Layout, now: Layout): Change[] {
  const out: Change[] = [];
  const push = (id: string, target: string, detail: string, involves: Involves[], quantities: Change["quantities"]) =>
    out.push({ id: `lay-${id}`, kind: "layout", target, detail, involves, quantities, enabled: true });

  const seatsAdded = seatCount(now) - seatCount(base);
  if (seatsAdded > 0) push("seating", "dining room", `${seatsAdded} more seats than the suggested plan`, ["seating"], { seats: seatsAdded });

  const barAdded = length(now, "bar-counter") - length(base, "bar-counter");
  if (barAdded > 0.05)
    push("bar", "bar", `${(barAdded * FT).toFixed(0)} ft more bar counter`, ["alcohol", "plumbing-fixture"], { lengthFt: Math.round(barAdded * FT), count: count(now, "bar-counter") - count(base, "bar-counter") });

  const restrooms = count(now, "restroom") - count(base, "restroom");
  if (restrooms > 0) push("restroom", "restrooms", `${restrooms} more restroom${restrooms === 1 ? "" : "s"}`, ["restroom", "plumbing-fixture"], { count: restrooms });

  const lines = count(now, "kitchen-line") - count(base, "kitchen-line");
  const anchor = now.kitchenAnchor;
  const baseLines = base.items.filter((i) => i.type === "kitchen-line");
  const nowLines = now.items.filter((i) => i.type === "kitchen-line");
  const moved = nowLines.some((i) => (anchor ? dist([i.x, i.y], anchor) > 1 : baseLines.length > 0 && baseLines.every((b) => dist([i.x, i.y], [b.x, b.y]) > 1)));
  if (lines > 0 || moved)
    push("cook", "kitchen", lines > 0 ? `${lines} more cook line${lines === 1 ? "" : "s"}` : "cook line moved away from where it stood", ["grease-cooking", "gas-appliance"], { count: Math.max(lines, 1) });

  const coolers = count(now, "walk-in") - count(base, "walk-in");
  if (coolers > 0) push("cooler", "storage", `${coolers} more walk-in cooler${coolers === 1 ? "" : "s"}`, ["electric-load"], { count: coolers });

  const patio = count(now, "patio-table") - count(base, "patio-table");
  if (patio > 0) {
    const spec = ITEM_SPECS["patio-table"];
    push("patio", "sidewalk patio", `${patio} patio table${patio === 1 ? "" : "s"}`, ["patio", "seating"], { areaSf: Math.round(patio * spec.w * spec.d * SQFT), seats: patio * spec.seats });
  }
  return out;
}
