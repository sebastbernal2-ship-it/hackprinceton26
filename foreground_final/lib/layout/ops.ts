import type { OwnerBrief } from "@/lib/engine/types";
import type { Site } from "@/lib/sites/schema";
import { SEATING_MIX, autoLayout, rectZones } from "./auto";
import { clamp, itemRect, rectsOverlap, resolveSide, snap } from "./geometry";
import { findSpot, makeItem, packSeating, placeStools, regionFor, scanRows, zoneOf } from "./place";
import { ITEM_SPECS, type Item, type ItemType, type Layout, type Op, type Pt, type Rect, type Side } from "./types";
import { seatCount } from "./validate";

export type OpContext = { site: Site; brief: OwnerBrief };
export type OpResult = { layout: Layout; notes: string[] };

const plural = (n: number, type: ItemType) => `${n} ${ITEM_SPECS[type].label.toLowerCase()}${n === 1 ? "" : "s"}`;
const whole = (l: Layout): Rect => ({ x: 0, y: 0, w: l.footprint.w, d: l.footprint.d });
const isTable = (i: Item) => ITEM_SPECS[i.type].group === "seating" && i.type !== "patio-table";

function addItems(l: Layout, op: Extract<Op, { op: "add" }>, notes: string[]) {
  const spec = ITEM_SPECS[op.type];
  let placed = 0;
  const wall: Side | undefined = op.near && !(op.near in ITEM_SPECS) ? resolveSide(l, op.near as Parameters<typeof resolveSide>[1]) : undefined;
  const anchor = op.near && op.near in ITEM_SPECS ? l.items.find((i) => i.type === op.near) : undefined;
  const near: Pt | undefined = anchor ? [anchor.x, anchor.y] : undefined;

  if (op.type === "bar-stool" && !wall && (!op.near || op.near === "bar-counter")) placed = placeStools(l, op.count);
  if (isTable({ type: op.type } as Item) && !wall && !near) {
    const region = regionFor(l, op.type, op.zone);
    placed = packSeating(l, region, [op.type], op.count * spec.seats) / spec.seats;
  }
  while (placed < op.count) {
    // a wall can be asked for from any zone, so search the whole floor then
    const region = wall && !op.zone && op.type !== "patio-table" ? whole(l) : regionFor(l, op.type, op.zone);
    const spot =
      findSpot(l, op.type, { region, wall, near: near ?? (op.type === "patio-table" ? l.entry : undefined), rotations: wall ? undefined : spec.w === spec.d ? [0] : [0, 90] }) ??
      (op.type === "patio-table" ? null : findSpot(l, op.type, { region: whole(l), wall, near, sameRoom: false }));
    if (!spot) break;
    l.items.push(makeItem(l, op.type, spot.x, spot.y, spot.rotation));
    l.seq++;
    placed++;
  }
  if (placed < op.count) notes.push(placed === 0 ? `No room for ${plural(op.count, op.type)}.` : `Only ${placed} of ${plural(op.count, op.type)} fit.`);
}

function moveItems(l: Layout, op: Extract<Op, { op: "move" }>, notes: string[]) {
  const targets = op.itemId ? l.items.filter((i) => i.id === op.itemId) : op.type ? l.items.filter((i) => i.type === op.type) : [];
  if (targets.length === 0) return void notes.push("Nothing on the plan matches that move.");
  for (const it of targets) {
    const ignore = new Set([it.id]);
    let spot: ReturnType<typeof findSpot>;
    if ("zone" in op.to) {
      const z = zoneOf(l, op.to.zone);
      if (!z) {
        notes.push(`This plan has no ${op.to.zone} zone.`);
        continue;
      }
      spot = findSpot(l, it.type, { region: z, ignore, rotations: [it.rotation] });
    } else if ("wall" in op.to) {
      spot = findSpot(l, it.type, { region: whole(l), wall: resolveSide(l, op.to.wall), near: [it.x, it.y], ignore });
    } else {
      // never trust a coordinate from outside: clamp to the floor, then take the nearest spot that really fits
      const p: Pt = [snap(clamp(op.to.x, 0, l.footprint.w)), snap(clamp(op.to.y, 0, l.footprint.d))];
      spot = findSpot(l, it.type, { region: it.type === "patio-table" ? undefined : whole(l), near: p, ignore, rotations: [it.rotation], sameRoom: false });
    }
    if (!spot) {
      notes.push(`No free spot there for the ${ITEM_SPECS[it.type].label.toLowerCase()}.`);
      continue;
    }
    Object.assign(it, spot);
  }
}

function setSeats(l: Layout, target: number, notes: string[]) {
  const now = seatCount(l);
  if (target > now) {
    const dining = zoneOf(l, "dining") ?? whole(l);
    const got = packSeating(l, dining, SEATING_MIX[l.concept], target - now);
    if (now + got < target) notes.push(`The room is full at ${now + got} seats with 1.1 m aisles.`);
    return;
  }
  let excess = now - target;
  for (let i = l.items.length - 1; i >= 0 && excess > 0; i--) {
    const s = ITEM_SPECS[l.items[i].type].seats;
    if (s > 0 && s <= excess) {
      l.items.splice(i, 1);
      excess -= s;
    }
  }
}

function resizeZone(l: Layout, op: Extract<Op, { op: "resizeZone" }>, notes: string[]) {
  if (l.footprint.rooms) return void notes.push("Zones follow the scanned walls here, so they cannot be resized. Move the pieces instead.");
  if (op.zone !== "kitchen" && op.zone !== "dining") return void notes.push(`Only the kitchen and dining zones can be resized.`);
  const horizontal = l.front === "left" || l.front === "right";
  const U = horizontal ? l.footprint.w : l.footprint.d;
  const V = horizontal ? l.footprint.d : l.footprint.w;
  const kitchen = zoneOf(l, "kitchen")!;
  const backNow = horizontal ? kitchen.w : kitchen.d;
  const delta = (op.zone === "kitchen" ? op.deltaM2 : -op.deltaM2) / V;
  const back = snap(clamp(backNow + delta, 2, U - 3));
  if (back === backNow) return void notes.push("That zone is already at its limit.");
  l.zones = rectZones(l.footprint, l.front, l.concept, back);
  // tables left standing in the bigger kitchen go back to the dining room
  const boh = l.zones.filter((z) => z.kind === "kitchen" || z.kind === "storage" || z.kind === "restroom");
  const stranded = l.items.filter((i) => ITEM_SPECS[i.type].seats > 0 && i.type !== "patio-table" && boh.some((z) => rectsOverlap(itemRect(i), z)));
  if (stranded.length) {
    l.items = l.items.filter((i) => !stranded.includes(i));
    const lost = repack(l, zoneOf(l, "dining")!, stranded);
    if (lost > 0) notes.push(`${lost} table${lost === 1 ? "" : "s"} no longer fit and came off the plan.`);
  }
}

/** Put existing tables back in rows, keeping their ids so the plan can animate them. Returns how many did not fit. */
function repack(l: Layout, region: Rect, items: Item[]): number {
  const aisles: "x" | "y" = region.w >= region.d ? "x" : "y";
  let lost = 0;
  for (const it of items) {
    const probe: Item = { ...it, rotation: 0 };
    const spot = scanRows(l, region, probe, aisles, 0);
    if (spot) l.items.push({ ...probe, x: spot.x, y: spot.y });
    else lost++;
  }
  return lost;
}

function arrange(l: Layout, op: Extract<Op, { op: "arrange" }>, notes: string[]) {
  const region = zoneOf(l, op.zone);
  if (!region) return void notes.push(`This plan has no ${op.zone} zone.`);
  const tables = l.items.filter((i) => isTable(i) && rectsOverlap(itemRect(i), region));
  if (tables.length === 0) return void notes.push("No tables in that zone to arrange.");
  l.items = l.items.filter((i) => !tables.includes(i));
  let rest = tables;
  if (op.pattern !== "grid") {
    const back = resolveSide(l, "back");
    const sides: Side[] = op.pattern === "window" ? [l.front] : back === "left" || back === "right" ? [back, "top", "bottom"] : [back, "left", "right"];
    rest = [];
    const perSide = new Map<Side, number>();
    tables.forEach((it, n) => {
      const side = sides[n % sides.length];
      const run = side === "top" || side === "bottom" ? region.w : region.d;
      const cap = Math.floor(run / (Math.max(it.w, it.d) + 0.45));
      const used = perSide.get(side) ?? 0;
      const spot = used < cap ? findSpot(l, it.type, { region, wall: side }) : null;
      if (!spot) return void rest.push(it);
      perSide.set(side, used + 1);
      l.items.push({ ...it, ...spot });
    });
  }
  const lost = repack(l, region, rest);
  if (lost > 0) notes.push(`${lost} table${lost === 1 ? "" : "s"} did not fit this arrangement and came off the plan.`);
}

/**
 * Apply layout operations in order. Never throws and never places anything off the floor: every position comes
 * from a search over free grid spots, and what does not fit is reported in `notes`.
 */
export function applyOps(layout: Layout, ops: Op[], ctx: OpContext): OpResult {
  let l: Layout = structuredClone(layout);
  const notes: string[] = [];
  for (const op of ops) {
    switch (op.op) {
      case "add":
        addItems(l, op, notes);
        break;
      case "remove": {
        let left = op.count;
        for (let i = l.items.length - 1; i >= 0 && left > 0; i--) {
          if (l.items[i].type === op.type) {
            l.items.splice(i, 1);
            left--;
          }
        }
        if (left === op.count) notes.push(`There are no ${ITEM_SPECS[op.type].label.toLowerCase()}s to remove.`);
        break;
      }
      case "move":
        moveItems(l, op, notes);
        break;
      case "setConcept": {
        if (op.concept === l.concept) break;
        const fresh = autoLayout(ctx.site, { ...ctx.brief, concept: op.concept, seats: Math.max(seatCount(l), 8) });
        // new ids, so the old plan leaves and the new one arrives
        const base = l.seq;
        fresh.items = fresh.items.map((it, n) => ({ ...it, id: `i${base + n}` }));
        fresh.seq = base + fresh.items.length;
        l = fresh;
        break;
      }
      case "setSeats":
        setSeats(l, op.seats, notes);
        break;
      case "resizeZone":
        resizeZone(l, op, notes);
        break;
      case "arrange":
        arrange(l, op, notes);
        break;
    }
  }
  return { layout: l, notes };
}
