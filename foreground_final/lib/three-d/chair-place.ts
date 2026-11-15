import { ITEM_SPECS, type ItemType } from "@/lib/layout";
import { MODEL_FOR } from "./layout-map";

/**
 * Chairs round a table, in the table's own frame (x along its width, z along its depth, origin at the footprint centre,
 * y up). Pure: the furniture layer builds the meshes from this, the tests read the same numbers.
 *
 * The table model fills `fill` of the plan footprint, so the margin is where the chairs stand. A chair is tucked in
 * 0.15 m under the table edge, like a diner pulling up to a table, and faces the centre.
 */
export type ChairSlot = { x: number; z: number; yaw: number };

/** A dining chair in metres: seat 0.42 square at 0.45 high, back to 0.88. */
export const CHAIR = { seat: 0.42, seatH: 0.45, backH: 0.88, leg: 0.035, tuck: 0.15 } as const;

/** types whose seats are chairs at a table (a booth is one bench unit, a bar stool is its own seat) */
const CHAIRED: ReadonlySet<ItemType> = new Set(["two-top", "four-top", "six-top", "patio-table"]);

export function chairCount(type: ItemType): number {
  return CHAIRED.has(type) ? ITEM_SPECS[type].seats : 0;
}

/** the item's table-top size: the footprint times the model's fill */
export function tableSize(type: ItemType, w: number, d: number): { w: number; d: number } {
  const fill = MODEL_FOR[type]?.fill ?? 1;
  return { w: w * fill, d: d * fill };
}

const facing = (x: number, z: number) => Math.atan2(-x, -z);

/**
 * Seats go one at each end of the long axis, then the rest in equal numbers along the two long sides, spread evenly:
 * two-top = one at each end, four-top = one a side, six-top = one at each end and two along each long side.
 */
export function chairSlots(type: ItemType, w: number, d: number, count = chairCount(type)): ChairSlot[] {
  if (count <= 0) return [];
  const t = tableSize(type, w, d);
  const alongX = t.w >= t.d;
  const long = alongX ? t.w : t.d;
  const short = alongX ? t.d : t.w;
  const reach = CHAIR.seat / 2 + 0.01 - CHAIR.tuck; // chair centre beyond the table edge
  const out: { a: number; b: number }[] = []; // a along the long axis, b across it
  const ends = Math.min(2, count);
  for (let i = 0; i < ends; i++) out.push({ a: (i === 0 ? 1 : -1) * (long / 2 + reach), b: 0 });
  const rest = count - ends;
  const sides = [Math.ceil(rest / 2), Math.floor(rest / 2)];
  sides.forEach((k, s) => {
    for (let i = 0; i < k; i++) out.push({ a: ((i + 0.5) / k - 0.5) * long * 0.9, b: (s === 0 ? 1 : -1) * (short / 2 + reach) });
  });
  return out.map(({ a, b }) => {
    const x = alongX ? a : b;
    const z = alongX ? b : a;
    return { x, z, yaw: facing(x, z) };
  });
}
