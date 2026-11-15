import { findingFor } from "@/lib/engine/benchmarks";
import { fitSeats } from "@/lib/engine/seats";
import type { Concept, OwnerBrief } from "@/lib/engine/types";
import type { Site } from "@/lib/sites/schema";
import { OPPOSITE, bbox, cleanRing, distToSide, pointInPolygon, polygonArea, snap } from "./geometry";
import { findSpot, makeItem, packSeating, placeStools, zoneOf } from "./place";
import { ITEM_SPECS, SIDES, type Footprint, type ItemType, type Layout, type Pt, type Rect, type Side, type Zone, type ZoneKind } from "./types";

const SF_PER_M2 = 10.7639;

/** Share of the floor behind the pass (kitchen, storage, restroom), by concept. Foreground estimate. */
export const BACK_OF_HOUSE_SHARE: Record<Concept, number> = {
  "quick-service": 0.4,
  "fast-casual": 0.38,
  "full-service": 0.35,
  cafe: 0.25,
  bar: 0.22,
};

/** Tables dealt in turn until the seat target is met. */
export const SEATING_MIX: Record<Concept, ItemType[]> = {
  "quick-service": ["four-top", "two-top", "two-top"],
  "fast-casual": ["four-top", "four-top", "two-top"],
  "full-service": ["four-top", "booth", "four-top", "two-top", "six-top"],
  cafe: ["two-top", "two-top", "four-top"],
  bar: ["two-top", "four-top", "two-top"],
};

const BAR_DEPTH_M = 2.75;

export type Frame = {
  fp: Footprint;
  toPlan?: (p: { x: number; y: number }) => Pt;
  /** inverse of toPlan: plan metres back to the scan's (z-up, GraphQL) x/y */
  fromPlan?: (p: Pt) => { x: number; y: number };
};

/** The transform between scan room outlines (model x/y, y forward) and plan space (y down), both directions. */
export function scanFrame(rings: Pt[][]) {
  const box = bbox(rings.flat());
  const maxY = box.y + box.d;
  return {
    box,
    toPlan: (p: { x: number; y: number }): Pt => [p.x - box.x, maxY - p.y],
    fromPlan: (p: Pt): { x: number; y: number } => ({ x: p[0] + box.x, y: maxY - p[1] }),
  };
}

/** The floor to plan on: scanned room outlines when the scan is of this suite, else a rectangle from the listing SF. */
export function footprintFor(site: Site): Frame {
  const mp = site.matterport;
  const rooms = mp?.scanOfExactSuite ? mp.rooms.filter((r) => r.polygon && r.polygon.length >= 3) : [];
  if (rooms.length > 0) {
    // model space is y-up; the plan is y-down
    const { box, toPlan, fromPlan } = scanFrame(rooms.map((r) => r.polygon as Pt[]));
    const planRooms = rooms.map((r) => ({ label: r.label, polygon: cleanRing((r.polygon as Pt[]).map(([x, y]) => toPlan({ x, y }))) }));
    const areaM2 = planRooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
    return { fp: { w: box.w, d: box.d, rooms: planRooms, source: "matterport", areaM2 }, toPlan, fromPlan };
  }
  // a typical retail bay is about 1.8 times as deep as it is wide; drawn with the storefront on the left
  const areaM2 = site.space.sf / SF_PER_M2;
  const d = snap(Math.sqrt(areaM2 / 1.8));
  const w = snap(areaM2 / d);
  return { fp: { w, d, source: "listing", areaM2: w * d } };
}

/** Rectangle in "distance from the front wall (u), distance along it (v)" turned into plan space. */
function fromFront(fp: Footprint, front: Side, u: number, v: number, du: number, dv: number): Rect {
  if (front === "left") return { x: u, y: v, w: du, d: dv };
  if (front === "right") return { x: fp.w - u - du, y: v, w: du, d: dv };
  if (front === "top") return { x: v, y: u, w: dv, d: du };
  return { x: v, y: fp.d - u - du, w: dv, d: du };
}

export function rectZones(fp: Footprint, front: Side, concept: Concept, backDepth?: number): Zone[] {
  const horizontal = front === "left" || front === "right";
  const U = horizontal ? fp.w : fp.d;
  const V = horizontal ? fp.d : fp.w;
  const back = backDepth ?? snap(U * BACK_OF_HOUSE_SHARE[concept]);
  const dining = U - back;
  const withBar = concept === "bar" || concept === "full-service";
  const bar = withBar ? Math.min(BAR_DEPTH_M, V * 0.35) : 0;
  const z = (kind: ZoneKind, r: Rect): Zone => ({ id: kind, kind, ...r });
  const zones = [
    z("dining", fromFront(fp, front, 0, 0, dining, V - bar)),
    z("kitchen", fromFront(fp, front, dining, 0, back, snap(V * 0.6))),
    z("storage", fromFront(fp, front, dining, snap(V * 0.6), back, snap(V * 0.78) - snap(V * 0.6))),
    z("restroom", fromFront(fp, front, dining, snap(V * 0.78), back, V - snap(V * 0.78))),
    z("entry", fromFront(fp, front, 0, Math.max(0, (V - bar) / 2 - 1.5), 1.5, Math.min(3, V))),
  ];
  if (withBar) zones.push(z("bar", fromFront(fp, front, 1.5, V - bar, dining - 1.5, bar)));
  return zones;
}

const centroid = (poly: Pt[]): Pt => {
  const b = bbox(poly);
  return [b.x + b.w / 2, b.y + b.d / 2];
};

function nearestSide(fp: Footprint, p: Pt, skip?: Side): Side {
  return [...SIDES].filter((s) => s !== skip).sort((a, b) => distToSide(fp, a, p) - distToSide(fp, b, p))[0];
}

/** Zones for a scanned suite: every room gets a job from its label, the hood's position, and its size. */
function roomZones(fp: Footprint, kitchenAt: Pt | null, storefrontAt: Pt | null, concept: Concept) {
  const rooms = (fp.rooms ?? []).map((r, i) => ({ i, label: r.label, polygon: r.polygon, area: polygonArea(r.polygon), kind: null as ZoneKind | null }));
  const bySize = [...rooms].sort((a, b) => b.area - a.area);
  for (const r of rooms) {
    if (/dining|seating/i.test(r.label)) r.kind = "dining";
    else if (/kitchen|cook/i.test(r.label)) r.kind = "kitchen";
    else if (/bath|rest|toilet|wc/i.test(r.label)) r.kind = "restroom";
    else if (/storage|closet|utility|mechanical/i.test(r.label)) r.kind = "storage";
    else if (/\bbar\b/i.test(r.label)) r.kind = "bar";
  }
  if (!rooms.some((r) => r.kind === "dining")) bySize[0].kind = "dining";
  const diningRoom = bySize.find((r) => r.kind === "dining")!;
  if (kitchenAt && !rooms.some((r) => r.kind === "kitchen")) {
    const hit = rooms.find((r) => r.kind !== "dining" && pointInPolygon(kitchenAt, r.polygon));
    if (hit) hit.kind = "kitchen";
  }
  if (!rooms.some((r) => r.kind === "kitchen")) {
    const next = bySize.find((r) => r.kind === null && r.area >= 9);
    if (next) next.kind = "kitchen";
  }
  for (const r of bySize) {
    if (r.kind) continue;
    if (!rooms.some((o) => o.kind === "restroom") && r.area >= 3 && r.area <= 9) r.kind = "restroom";
    else r.kind = "storage";
  }

  const dc = centroid(diningRoom.polygon);
  const kitchenRoom = rooms.find((r) => r.kind === "kitchen");
  const front = storefrontAt ? nearestSide(fp, storefrontAt) : nearestSide(fp, dc, kitchenRoom ? nearestSide(fp, centroid(kitchenRoom.polygon)) : undefined);

  const zones: Zone[] = rooms.map((r) => ({ id: `${r.kind}-${r.i}`, kind: r.kind!, ...bbox(r.polygon), polygon: r.polygon }));
  const db = bbox(diningRoom.polygon);
  // one open room: carve the kitchen out of the back of it
  if (!kitchenRoom) {
    const horizontal = front === "left" || front === "right";
    const depth = snap((horizontal ? db.w : db.d) * BACK_OF_HOUSE_SHARE[concept]);
    const local = fromFront({ ...fp, w: db.w, d: db.d }, front, (horizontal ? db.w : db.d) - depth, 0, depth, horizontal ? db.d : db.w);
    zones.push({ id: "kitchen", kind: "kitchen", x: db.x + local.x, y: db.y + local.y, w: local.w, d: local.d });
    const rest = fromFront({ ...fp, w: db.w, d: db.d }, front, 0, 0, (horizontal ? db.w : db.d) - depth, horizontal ? db.d : db.w);
    const dz = zones.find((z) => z.id === `dining-${diningRoom.i}`)!;
    Object.assign(dz, { x: db.x + rest.x, y: db.y + rest.y, w: rest.w, d: rest.d, polygon: undefined });
  }
  if (concept === "bar" || concept === "full-service") {
    const side = OPPOSITE[front];
    const horizontal = side === "left" || side === "right";
    const depth = Math.min(BAR_DEPTH_M, (horizontal ? db.w : db.d) * 0.3);
    const local = fromFront({ ...fp, w: db.w, d: db.d }, side, 0, 0, depth, horizontal ? db.d : db.w);
    if (kitchenRoom) zones.push({ id: "bar", kind: "bar", x: db.x + local.x, y: db.y + local.y, w: local.w, d: local.d });
  }

  // the door: from the middle of the dining room's front edge, step inward until on the floor
  const inward: Pt = front === "left" ? [1, 0] : front === "right" ? [-1, 0] : front === "top" ? [0, 1] : [0, -1];
  let entry: Pt = front === "left" ? [db.x, dc[1]] : front === "right" ? [db.x + db.w, dc[1]] : front === "top" ? [dc[0], db.y] : [dc[0], db.y + db.d];
  for (let step = 0; step < 80 && !pointInPolygon([entry[0] + inward[0] * 0.3, entry[1] + inward[1] * 0.3], diningRoom.polygon); step++) {
    entry = [entry[0] + inward[0] * 0.25, entry[1] + inward[1] * 0.25];
  }
  entry = [entry[0] + inward[0] * 0.4, entry[1] + inward[1] * 0.4];
  if (!pointInPolygon(entry, diningRoom.polygon)) entry = dc;
  return { zones, front, entry };
}

/** Seats the starting plan aims for: what the owner asked for, capped by what the benchmark says fits. */
export function seatTarget(site: Site, brief: OwnerBrief): number {
  const fit = fitSeats(site, brief.concept).seats;
  return Math.max(0, Math.min(brief.seats ?? fit, fit));
}

/**
 * A sensible starting plan for a concept: back of house at the back (on the existing hood when the scan located
 * one), restroom, counter or host by the door, then tables in rows with 1.1 m aisles up to the seat target.
 */
export function autoLayout(site: Site, brief: OwnerBrief): Layout {
  const concept = brief.concept;
  const { fp, toPlan } = footprintFor(site);
  const hood = findingFor(site, "hood", "kitchen-line");
  const hasKitchen = hood?.status === "present";
  const at = (kind: "hood" | "kitchen-line" | "storefront") => {
    const f = site.findings.find((x) => x.kind === kind && x.status === "present" && x.position);
    return f?.position && toPlan ? toPlan(f.position) : null;
  };

  let zones: Zone[];
  let front: Side;
  let entry: Pt;
  const kitchenAt = at("hood") ?? at("kitchen-line");
  if (fp.rooms) ({ zones, front, entry } = roomZones(fp, kitchenAt, at("storefront"), concept));
  else {
    front = "left";
    zones = rectZones(fp, front, concept);
    const e = zones.find((z) => z.kind === "entry")!;
    entry = [0.5, e.y + e.d / 2];
  }

  const layout: Layout = { v: 1, siteId: site.id, concept, footprint: fp, front, entry, zones, items: [], kitchenAnchor: null, seq: 1 };
  const back = OPPOSITE[front];
  const put = (type: ItemType, opts: Parameters<typeof findSpot>[2] = {}) => {
    const spot = findSpot(layout, type, opts) ?? findSpot(layout, type, { ...opts, region: { x: 0, y: 0, w: fp.w, d: fp.d }, sameRoom: false });
    if (!spot) return null;
    const item = makeItem(layout, type, spot.x, spot.y, spot.rotation);
    layout.items.push(item);
    layout.seq++;
    return item;
  };

  const kitchen = zoneOf(layout, "kitchen");
  const dining = zoneOf(layout, "dining")!;
  const diningCentre: Pt = [dining.x + dining.w / 2, dining.y + dining.d / 2];
  const line = put("kitchen-line", kitchenAt && kitchen && fp.rooms ? { region: kitchen, near: kitchenAt, rotations: [0, 90] } : { region: kitchen, wall: back });
  if (line && hasKitchen) layout.kitchenAnchor = [line.x, line.y];
  put("prep", { region: kitchen, near: line ? [line.x, line.y] : undefined, rotations: [0, 90] });
  if (concept !== "cafe" && concept !== "bar") put("prep", { region: kitchen, near: line ? [line.x, line.y] : undefined, rotations: [0, 90] });
  if (concept !== "cafe") put("walk-in", { region: zoneOf(layout, "storage") ?? kitchen, wall: back });
  put("restroom", { region: zoneOf(layout, "restroom") ?? kitchen, wall: back });

  if (concept === "full-service") put("host", { region: dining, near: entry });
  else if (concept !== "bar") {
    // order counter on the dining side of the pass
    const pass: Pt = kitchen ? [kitchen.x + kitchen.w / 2, kitchen.y + kitchen.d / 2] : diningCentre;
    put("counter", { region: dining, near: pass, rotations: [0, 90] });
  }

  const target = seatTarget(site, brief);
  let seated = 0;
  const barZone = zoneOf(layout, "bar");
  if (barZone) {
    const horizontal = barZone.w >= barZone.d;
    const wall: Side = fp.rooms ? back : horizontal ? (barZone.y > fp.d / 2 ? "bottom" : "top") : barZone.x > fp.w / 2 ? "right" : "left";
    const bars = concept === "bar" ? Math.max(1, Math.min(3, Math.floor((horizontal ? barZone.w : barZone.d) / ITEM_SPECS["bar-counter"].w))) : 1;
    for (let i = 0; i < bars; i++) put("bar-counter", { region: barZone, wall });
    seated += placeStools(layout, Math.round(target * (concept === "bar" ? 0.35 : 0.15)));
  }
  packSeating(layout, dining, SEATING_MIX[concept], target - seated);
  return layout;
}
