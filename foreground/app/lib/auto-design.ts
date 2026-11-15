// "Design my place": a deterministic zoned layout generator. Everything is metres on the ASSUMED floor rectangle.
// Zones (window wall at the bottom edge, door on it): service bar and back-of-house along the back wall, a queue lane in
// front of it, a seating grid in the middle, a window bar on the window wall, an optional patio outside it.
// The result is an ordered list of placement steps with a reason each, validated with checkLayout (zero problems) and an
// ADA-style 0.91 m path check. It is a planning aid, not a code determination.
import { checkLayout, placeAsset, type Issue, type Placement, type Rect, type Rot } from "./asset-layout";
import type { Asset } from "./assets";
import { doorX as defaultDoorX, seatsOf, sizeFor, type PlacedPiece } from "./planner";

export type Concept = "cafe" | "grab-and-go" | "full-service" | "frozen-yogurt";
export type WindowWall = "front" | "back" | "left" | "right";
export type Zone = "service" | "back-of-house" | "host" | "window-bar" | "seating" | "patio";

export type AutoDesignInput = {
  floor: Rect;
  /** Centre of the door along the window wall in the planner frame (default: the planner's door position). */
  doorX?: number;
  windowWall?: WindowWall;
  seatsTarget: number;
  concept: Concept;
  /** Total equipment + furniture budget in USD; optional pieces are dropped by priority until it fits. */
  budget?: number;
  assets: Asset[];
  /** Price of one piece in USD, or null when none is on file (counted as 0 and reported as unpriced). */
  priceOf?: (asset: Asset) => number | null;
  /** Outdoor seating outside the window wall (outside the floor rectangle, checked on its own strip). */
  patio?: { seats: number; depth?: number };
};

export type DesignStep = {
  id: string;
  assetId: string;
  asset: Asset;
  x: number;
  y: number;
  rot: Rot;
  zone: Zone;
  /** Pieces placed as one set (a table and its chairs) share a group. */
  group: string;
  reason: string;
  seats: number;
  price: number | null;
  /** Drop order under a budget: higher goes first, 0 is never dropped. */
  tier: number;
  patio: boolean;
};
export type Dropped = { assetId: string; name: string; count: number; reason: string; saved: number };
export type AutoDesign = {
  steps: DesignStep[];
  narration: string[];
  seats: number;
  patioSeats: number;
  seatsTarget: number;
  /** True when the interior seat count is within +/-10% of the target (budget or space may prevent it, see notes). */
  seatsWithinTolerance: boolean;
  cost: { total: number; unpriced: string[] };
  budget: number | null;
  /** Inside the door mouth, real frame, and the window wall it is on. */
  door: [number, number];
  windowWall: WindowWall;
  withinBudget: boolean;
  dropped: Dropped[];
  zones: { zone: string; x0: number; y0: number; x1: number; y1: number }[];
  issues: Issue[];
  patioIssues: Issue[];
  access: { ok: boolean; unreachable: string[] };
  notes: string[];
};

export const ADA_AISLE = 0.91;
/** Built a touch wider than the minimum so a 0.91 m wheelchair path survives the grid tolerance. */
const AISLE = 0.94;
const WALL = 0.3;
const EPS = 1e-6;
/** Micro-metre rounding: stays under the 1e-6 tolerance of checkLayout, so pieces flush to a wall are not pushed outside it. */
const r3 = (v: number) => Math.round(v * 1e6) / 1e6;
const fmt = (v: number) => `${Math.round(v * 10) / 10}`;

type GroupKind = "two" | "four" | "six" | "hightop";
const GROUPS: Record<GroupKind, { table: string; chair: string; top: number; bottom: number; label: string }> = {
  two: { table: "table_2top_30", chair: "chair_dining", top: 1, bottom: 1, label: "two-top" },
  four: { table: "table_4top_30x48", chair: "chair_dining", top: 2, bottom: 2, label: "four-top" },
  six: { table: "table_6top_30x72", chair: "chair_dining", top: 3, bottom: 3, label: "six-top" },
  hightop: { table: "table_hightop_30", chair: "bar_stool", top: 1, bottom: 1, label: "high-top" },
};
const SEATS: Record<GroupKind, number> = { two: 2, four: 4, six: 6, hightop: 2 };

type Item = { id: string; tier: number; reason: string };
type ConceptSpec = {
  label: string;
  /** Customer-facing equipment, nearest the door first. */
  service: Item[];
  boh: Item[];
  host: boolean;
  barShare: number;
  mix: GroupKind[];
  seatReason: string;
};
const CONCEPTS: Record<Concept, ConceptSpec> = {
  cafe: {
    label: "cafe",
    service: [
      { id: "bakery_display_case_48", tier: 1, reason: "Pastry case first, nearest the door, so guests see it before they order and the queue runs past it to the espresso." },
      { id: "drip_brewer_station", tier: 3, reason: "Drip brewer beside the pastry case for the quick filter-coffee order that should not wait on espresso." },
      { id: "coffee_grinder_on_demand", tier: 1, reason: "Grinder right next to the espresso machine so the barista never walks between them." },
      { id: "espresso_machine_2group", tier: 0, reason: "Espresso on the back wall at the end of the bar so the queue runs past the pastry before it reaches the machine." },
    ],
    boh: [
      { id: "fridge_reachin_2door", tier: 0, reason: "Reach-in fridge at the service end of the back wall: milk is a short step from the espresso machine." },
      { id: "sink_hand_17", tier: 0, reason: "Hand sink inside the staff zone, one step from the line, where health inspectors look first." },
      { id: "convection_oven_full", tier: 4, reason: "Oven at the far end of the back wall, away from the queue, so its heat and noise stay behind the bar." },
      { id: "bake_rack_speed_rack", tier: 4, reason: "Speed rack beside the oven so trays move straight from the oven to the case." },
      { id: "bakery_work_table_72", tier: 4, reason: "Work table at the end of the line for finishing pastries; first thing to cut if money is tight." },
    ],
    host: false,
    barShare: 0.2,
    mix: ["two", "two", "four"],
    seatReason: "Mostly two-tops with a four-top every third table: a cafe sells to singles and pairs and needs a few bigger tables.",
  },
  "grab-and-go": {
    label: "grab-and-go shop",
    service: [
      { id: "bakery_display_case_48", tier: 1, reason: "Grab-and-go case right at the door: the sale happens in the first three steps." },
      { id: "salad_prep_cold_48", tier: 3, reason: "Cold-case wall after it for ready-made cold items guests can take without waiting." },
      { id: "drip_brewer_station", tier: 3, reason: "Drip brewer in the flow for the fastest coffee order." },
      { id: "coffee_grinder_on_demand", tier: 1, reason: "Grinder beside the espresso machine, same reach for the barista." },
      { id: "espresso_machine_2group", tier: 0, reason: "Espresso at the end of the bar so the line keeps moving toward the till and out the door." },
    ],
    boh: [
      { id: "fridge_reachin_2door", tier: 0, reason: "Reach-in fridge in the staff zone behind the bar." },
      { id: "sink_hand_17", tier: 0, reason: "Hand sink inside the staff zone." },
    ],
    host: false,
    barShare: 0.6,
    mix: ["two"],
    seatReason: "Few seats, quick turns: two-tops only, since most guests take it away.",
  },
  "full-service": {
    label: "full-service restaurant",
    service: [
      { id: "bar_counter_run_120", tier: 1, reason: "Drinks bar on the back wall, visible from the whole room so servers and bartender see each other." },
    ],
    boh: [
      { id: "range_6burner_36", tier: 0, reason: "Range is the centre of the cook line, on the back wall where the exhaust hood can sit above it." },
      { id: "griddle_flat_36", tier: 4, reason: "Griddle next to the range so one cook covers both." },
      { id: "fryer_floor_40lb", tier: 4, reason: "Fryer at the end of the hot line, away from the cold prep." },
      { id: "salad_prep_cold_48", tier: 3, reason: "Cold prep apart from the hot line so cooks do not cross while plating." },
      { id: "fridge_reachin_2door", tier: 0, reason: "Reach-in fridge between cold prep and the line." },
      { id: "sink_hand_17", tier: 0, reason: "Hand sink on the line, where cooks can reach it between tasks." },
      { id: "dish_station_60", tier: 1, reason: "Dish station at the end of the back wall, closest to where plates come back." },
    ],
    host: true,
    barShare: 0,
    mix: ["four", "four", "four", "six"],
    seatReason: "Four-tops carry the room, with a six-top for groups: full service lives on covers per table.",
  },
  "frozen-yogurt": {
    label: "frozen-yogurt shop",
    service: [
      { id: "display_gelato_49", tier: 0, reason: "Frozen case at the door: it is the whole reason guests come in, so it is the first thing they see." },
      { id: "gelato_batch_freezer_20qt", tier: 1, reason: "Batch freezer next to the case so refills are one step." },
      { id: "milkshake_mixer_2spindle", tier: 3, reason: "Shake mixer at the end of the bar for the high-margin add-on." },
    ],
    boh: [
      { id: "fridge_reachin_2door", tier: 0, reason: "Reach-in fridge in the staff zone for toppings and dairy." },
      { id: "sink_hand_17", tier: 0, reason: "Hand sink in the staff zone." },
      { id: "counter_prep_72", tier: 4, reason: "Prep counter at the end of the line for toppings and cup stock." },
    ],
    host: false,
    barShare: 0.3,
    mix: ["two", "hightop", "two", "four"],
    seatReason: "Two-tops and high-tops: a quick-visit crowd that sits in pairs.",
  },
};

type Cand = { asset: Asset; rot: Rot; x: number; y: number; zone: Zone; group: string; reason: string; tier: number; patio: boolean };
type Unit = { tier: number; key: number; label: string; cands: Cand[] };

const boxOf = (c: { asset: Asset; rot: Rot; x: number; y: number }) => placeAsset(c.asset, "k", c.rot, c.x, c.y).box;

/** A table with its chairs: positions relative to the group's top-left, plus the group's size. */
function buildGroup(kind: GroupKind, seats: number, byId: Map<string, Asset>) {
  const spec = GROUPS[kind];
  const table = byId.get(spec.table);
  const chair = byId.get(spec.chair);
  if (!table || !chair || seats < 1) return null;
  const tz = sizeFor(table, 0);
  const cz = sizeFor(chair, 0);
  const top = Math.min(spec.top, Math.ceil(seats / 2));
  const bottom = Math.min(spec.bottom, seats - top);
  const row = (n: number) => n * cz.w + Math.max(0, n - 1) * 0.12;
  const w = Math.max(tz.w, row(top), row(bottom));
  const ty = top ? cz.d + 0.05 : 0;
  const parts: { asset: Asset; rot: Rot; x: number; y: number; chair: boolean }[] = [];
  parts.push({ asset: table, rot: 0, x: (w - tz.w) / 2, y: ty, chair: false });
  for (let i = 0; i < top; i++) parts.push({ asset: chair, rot: 0, x: (w - row(top)) / 2 + i * (cz.w + 0.12), y: 0, chair: true });
  for (let i = 0; i < bottom; i++) parts.push({ asset: chair, rot: 180, x: (w - row(bottom)) / 2 + i * (cz.w + 0.12), y: ty + tz.d + 0.05, chair: true });
  const d = ty + tz.d + (bottom ? 0.05 + cz.d : 0);
  return { kind, seats: top + bottom, w, d, parts };
}
type Group = NonNullable<ReturnType<typeof buildGroup>>;

type Rc = { x0: number; y0: number; x1: number; y1: number };
const hits = (a: Rc, b: Rc) => a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS;

/** Shelf-pack groups into a zone: rows left to right, AISLE between groups and between rows; groups that do not fit are skipped. */
function packGroups(groups: Group[], zone: Rc, avoid: Rc[]): { g: Group; x: number; y: number }[] {
  const out: { g: Group; x: number; y: number }[] = [];
  const rows: { y: number; h: number; x: number; first: number }[] = [];
  for (const g of groups) {
    const tryRow = (row: { y: number; h: number; x: number }) => {
      let x = row.x;
      for (let guard = 0; guard < 8; guard++) {
        const box = { x0: x - AISLE / 2 + 0.01, y0: row.y - 0.01, x1: x + g.w + AISLE / 2 - 0.01, y1: row.y + g.d + 0.01 };
        const blocker = avoid.find((a) => hits(box, a));
        if (!blocker) break;
        x = blocker.x1 + AISLE / 2;
      }
      return x + g.w <= zone.x1 + EPS && row.y + Math.max(row.h, g.d) <= zone.y1 + EPS ? x : null;
    };
    let placed = false;
    const last = rows[rows.length - 1];
    if (last) {
      const x = tryRow(last);
      if (x !== null) { out.push({ g, x, y: last.y }); last.x = x + g.w + AISLE; last.h = Math.max(last.h, g.d); placed = true; }
    }
    if (!placed) {
      const y = last ? last.y + last.h + AISLE : zone.y0;
      const row = { y, h: 0, x: zone.x0, first: out.length };
      const x = tryRow(row);
      if (x !== null) { rows.push(row); out.push({ g, x, y }); row.x = x + g.w + AISLE; row.h = g.d; }
    }
  }
  // centre each row on the zone where nothing had to dodge the door
  for (const row of rows) {
    const mine = out.filter((o) => o.y === row.y);
    if (mine.length === 0) continue;
    const used = mine[mine.length - 1].x + mine[mine.length - 1].g.w - mine[0].x;
    const free = zone.x1 - zone.x0 - used;
    const unbroken = mine.every((o, i) => i === 0 || Math.abs(o.x - (mine[i - 1].x + mine[i - 1].g.w + AISLE)) < 1e-9) && Math.abs(mine[0].x - zone.x0) < 1e-9;
    if (unbroken && free > 0) for (const o of mine) o.x += free / 2;
  }
  return out;
}

/** Pick the table kinds (cycled from the concept mix) until the seats are covered; the last table is trimmed to match exactly. */
function planGroups(mix: GroupKind[], seats: number, byId: Map<string, Asset>): Group[] {
  const out: Group[] = [];
  let left = seats;
  for (let i = 0; left > 0 && i < 200; i++) {
    const kind = mix[i % mix.length];
    const g = buildGroup(kind, Math.min(SEATS[kind], left), byId);
    if (!g) { if (mix.every((k) => !buildGroup(k, 1, byId))) break; continue; }
    out.push(g);
    left -= g.seats;
  }
  return out;
}

/** Rotate canonical (window wall = bottom edge) geometry onto the real window wall: a rigid turn, pieces keep their fronts. */
function orient(c: Cand, W: number, D: number, wall: WindowWall): Cand {
  const b = boxOf(c);
  const turn = { front: 0, left: 90, back: 180, right: 270 }[wall];
  if (turn === 0) return c;
  let x0: number, y0: number;
  if (turn === 90) { x0 = D - b.y1; y0 = b.x0; }
  else if (turn === 180) { x0 = W - b.x1; y0 = D - b.y1; }
  else { x0 = b.y0; y0 = W - b.x1; }
  return { ...c, rot: ((c.rot + turn) % 360) as Rot, x: r3(x0), y: r3(y0) };
}
function orientRect(r: Rc, W: number, D: number, wall: WindowWall): Rc {
  const turn = { front: 0, left: 90, back: 180, right: 270 }[wall];
  if (turn === 0) return r;
  if (turn === 90) return { x0: D - r.y1, y0: r.x0, x1: D - r.y0, y1: r.x1 };
  if (turn === 180) return { x0: W - r.x1, y0: D - r.y1, x1: W - r.x0, y1: D - r.y0 };
  return { x0: r.y0, y0: W - r.x1, x1: r.y1, y1: W - r.x0 };
}

/** Distance from a point to a rectangle (0 inside). */
const distTo = (px: number, py: number, b: Rc) => Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1));

/**
 * Wheelchair-width access: a 0.91 m path (cells kept 0.455 m from every piece and wall) must run from the door to the
 * queue lane and to a spot beside every dining group. Returns the groups it could not reach.
 */
export function checkAccess(floor: Rect, placed: Placement[], door: [number, number], targets: { name: string; box: Rc }[], lane: [number, number] | null) {
  const cell = 0.02;
  const clear = ADA_AISLE / 2;
  const nx = Math.ceil(floor.width / cell);
  const ny = Math.ceil(floor.depth / cell);
  const free = new Uint8Array(nx * ny).fill(1);
  const c = (i: number) => (i + 0.5) * cell;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (c(i) < clear || c(j) < clear || c(i) > floor.width - clear || c(j) > floor.depth - clear) free[j * nx + i] = 0;
  }
  for (const p of placed) {
    const i0 = Math.max(0, Math.floor((p.box.x0 - clear) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((p.box.x1 + clear) / cell));
    const j0 = Math.max(0, Math.floor((p.box.y0 - clear) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((p.box.y1 + clear) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (distTo(c(i), c(j), p.box) < clear - 1e-9) free[j * nx + i] = 0;
  }
  const cellOf = (x: number, y: number): [number, number] => [Math.min(nx - 1, Math.max(0, Math.floor(x / cell))), Math.min(ny - 1, Math.max(0, Math.floor(y / cell)))];
  // start from the nearest free cell to the door mouth
  const [si, sj] = cellOf(door[0], door[1]);
  let start = -1;
  for (let r = 0; r < 60 && start < 0; r++) {
    for (let dj = -r; dj <= r && start < 0; dj++) for (let di = -r; di <= r; di++) {
      const i = si + di, j = sj + dj;
      if (i >= 0 && j >= 0 && i < nx && j < ny && free[j * nx + i]) { start = j * nx + i; break; }
    }
  }
  const seen = new Uint8Array(nx * ny);
  if (start >= 0) {
    const q = [start];
    seen[start] = 1;
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      const i = k % nx;
      const j = (k - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const n = b * nx + a;
        if (free[n] && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
  }
  const reaches = (box: Rc, within: number) => {
    const i0 = Math.max(0, Math.floor((box.x0 - within) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((box.x1 + within) / cell));
    const j0 = Math.max(0, Math.floor((box.y0 - within) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((box.y1 + within) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (seen[j * nx + i] && distTo(c(i), c(j), box) <= within) return true;
    return false;
  };
  const unreachable = targets.filter((t) => !reaches(t.box, clear + 0.2)).map((t) => t.name);
  if (lane) { const [li, lj] = cellOf(lane[0], lane[1]); if (!reaches({ x0: lane[0], y0: lane[1], x1: lane[0], y1: lane[1] }, 0.3) && !seen[lj * nx + li]) unreachable.push("queue lane"); }
  return { ok: start >= 0 && unreachable.length === 0, unreachable: start >= 0 ? unreachable : ["door", ...unreachable] };
}

export function autoDesign(input: AutoDesignInput): AutoDesign {
  const { concept, assets } = input;
  const spec = CONCEPTS[concept];
  const wall = input.windowWall ?? "front";
  const sideways = wall === "left" || wall === "right";
  // work in the canonical frame (window wall at the bottom); W x D is what the canonical room looks like
  const Wreal = input.floor.width;
  const Dreal = input.floor.depth;
  const W = sideways ? Dreal : Wreal;
  const D = sideways ? Wreal : Dreal;
  const doorCenter = Math.min(W - 0.6, Math.max(0.6, input.doorX ?? defaultDoorX({ width: W, depth: D })));
  const byId = new Map<string, Asset>();
  for (const a of assets) if (!byId.has(a.assetId) || (byId.get(a.assetId)!.status !== "confirmed" && a.status === "confirmed")) byId.set(a.assetId, a);
  const priceOf = input.priceOf ?? (() => null);
  const target = Math.max(0, Math.round(input.seatsTarget));
  const notes: string[] = [];
  const dropped: Dropped[] = [];
  const units: Unit[] = [];
  let key = 0;
  const drop = (a: Asset, why: string, saved = 0) => dropped.push({ assetId: a.assetId, name: a.name, count: 1, reason: why, saved });

  // ---- service bar + back of house along the back wall -------------------------------------------------------------
  type Svc = { asset: Asset; item: Item; boh: boolean };
  let row: Svc[] = [];
  for (const [list, boh] of [[spec.service, false], [spec.boh, true]] as const) {
    for (const item of list) {
      const asset = byId.get(item.id);
      if (!asset) { notes.push(`${item.id} is not in the catalog, so it is not planned.`); continue; }
      row.push({ asset, item, boh });
    }
  }
  const sideOf = (s: Svc) => s.asset.clearance.sides;
  const gapBetween = (a: Svc, b: Svc) => Math.max(0.05, Math.max(sideOf(a), sideOf(b)) + 0.06);
  const widthOf = (list: Svc[]) => list.reduce((s, p, i) => s + sizeFor(p.asset, 0).w + (i ? gapBetween(list[i - 1], p) : 0), 0);
  const avail = W - 2 * WALL;
  while (row.length && widthOf(row) > avail + EPS) {
    // no room: cut the lowest-priority piece first (highest tier; later pieces first among equals)
    let worst = 0;
    row.forEach((s, i) => { if (s.item.tier >= row[worst].item.tier) worst = i; });
    if (row[worst].item.tier === 0) break;
    drop(row[worst].asset, "no room left on the back wall");
    row = row.filter((_, i) => i !== worst);
  }
  if (widthOf(row) > avail + EPS) notes.push("The essential back-wall pieces are wider than the floor; the layout will report that.");
  if (row.length && sideways === false && doorCenter > W / 2) row = [...row].reverse();
  const serviceZone: Rc = { x0: WALL, y0: 0, x1: W - WALL, y1: 0 };
  let sx = WALL;
  row.forEach((s, i) => {
    if (i) sx += gapBetween(row[i - 1], s);
    const sz = sizeFor(s.asset, 0);
    units.push({
      tier: s.item.tier, key: key++, label: s.asset.name,
      cands: [{ asset: s.asset, rot: 0, x: r3(sx), y: 0, zone: s.boh ? "back-of-house" : "service", group: `${s.asset.assetId}`, reason: s.item.reason, tier: s.item.tier, patio: false }],
    });
    sx += sz.w;
    serviceZone.y1 = Math.max(serviceZone.y1, sz.d);
  });
  const laneBottom = row.length ? Math.max(...row.map((s) => sizeFor(s.asset, 0).d + s.asset.clearance.front)) + 0.3 : 0.3;
  const queueLane: Rc = { x0: WALL, y0: serviceZone.y1, x1: W - WALL, y1: laneBottom };

  // ---- window bar, host stand, seating grid, patio ------------------------------------------------------------------
  const avoid: Rc[] = [{ x0: doorCenter - 0.5, y0: D - 1.3, x1: doorCenter + 0.5, y1: D }];
  const hostAsset = spec.host ? byId.get("host_stand") : undefined;
  let bottomLimit = D - 1.2;
  if (hostAsset) {
    const hz = sizeFor(hostAsset, 180);
    const hx = doorCenter + 0.5 + 0.4;
    if (hx + hz.w <= W - WALL) {
      units.push({ tier: 3, key: key++, label: hostAsset.name, cands: [{ asset: hostAsset, rot: 180, x: r3(hx), y: r3(D - hz.d), zone: "host", group: "host", reason: "Host stand just inside the door on the window wall so every guest is greeted before they find a table.", tier: 3, patio: false }] });
      avoid.push({ x0: hx - 0.3, y0: D - hz.d - hostAsset.clearance.front, x1: hx + hz.w + 0.3, y1: D });
      bottomLimit = D - hz.d - hostAsset.clearance.front - 0.05;
    }
  } else if (spec.host) notes.push("host_stand is not in the catalog, so no host stand is planned.");

  const barSeatsWanted = Math.round(target * spec.barShare);
  let barSeats = 0;
  const hight = buildGroup("hightop", 2, byId);
  if (barSeatsWanted > 0 && hight) {
    const tableD = sizeFor(hight.parts[0].asset, 180).d;
    const stool = hight.parts[1].asset;
    const stoolD = sizeFor(stool, 0).d;
    const pitch = hight.w + 0.35;
    const barTop = D - tableD - 0.05 - stoolD;
    const stretches: [number, number][] = [[WALL, doorCenter - 0.5 - 0.35], [doorCenter + 0.5 + 0.35, W - WALL]];
    let left = barSeatsWanted;
    let n = 0;
    for (const [a, b] of stretches) {
      for (let x = a; x + hight.w <= b + EPS && left > 0; x += pitch) {
        const g = buildGroup("hightop", Math.min(2, left), byId)!;
        const tbl = g.parts[0];
        const seatsHere = g.seats;
        const cands: Cand[] = [{ asset: tbl.asset, rot: 180, x: r3(x + (g.w - sizeFor(tbl.asset, 0).w) / 2), y: r3(D - tableD), zone: "window-bar", group: `bar${n}`, reason: "", tier: 5, patio: false }];
        const stoolW = sizeFor(stool, 0).w;
        const rowW = seatsHere * stoolW + (seatsHere - 1) * 0.12;
        for (let k = 0; k < seatsHere; k++) cands.push({ asset: stool, rot: 0, x: r3(x + (g.w - rowW) / 2 + k * (stoolW + 0.12)), y: r3(barTop), zone: "window-bar", group: `bar${n}`, reason: "", tier: 5, patio: false });
        cands[0].reason = n === 0
          ? "Window bar on the glass: single guests with a laptop take these seats, and they make the place look busy from the street."
          : "More window seats along the glass: the cheapest seats to add because they use the wall nobody else needs.";
        units.push({ tier: 5, key: key++, label: "window bar seats", cands });
        barSeats += seatsHere;
        left -= seatsHere;
        n++;
      }
    }
    if (barSeats < barSeatsWanted) notes.push(`The window wall only has room for ${barSeats} of the ${barSeatsWanted} window-bar seats wanted.`);
    bottomLimit = Math.min(bottomLimit, barTop - AISLE);
  }

  const wantInside = Math.max(0, target - barSeats);
  const zone: Rc = { x0: WALL, y0: laneBottom, x1: W - WALL, y1: bottomLimit };
  const attempts: Group[][] = [spec.mix, ["four", "four", "six", "four"] as GroupKind[]].map((mix) => {
    let groups = planGroups(mix, wantInside, byId);
    let packed = packGroups(groups, zone, avoid);
    let seats = packed.reduce((s, p) => s + p.g.seats, 0);
    // top up with two-tops where gaps are left
    for (let i = 0; seats < wantInside && i < 60; i++) {
      const extra = buildGroup("two", Math.min(2, wantInside - seats), byId);
      if (!extra) break;
      const again = packGroups([...packed.map((p) => p.g), extra], zone, avoid);
      const s2 = again.reduce((s, p) => s + p.g.seats, 0);
      if (s2 <= seats) break;
      groups = again.map((p) => p.g);
      packed = again;
      seats = s2;
    }
    return packed.map((p) => Object.assign(p.g, { px: p.x, py: p.y }) as Group & { px: number; py: number });
  });
  const seatsIn = (a: Group[]) => a.reduce((s, g) => s + g.seats, 0);
  const closeness = (a: Group[]) => Math.abs(seatsIn(a) - wantInside) + (seatsIn(a) < wantInside * 0.9 ? 1000 : 0);
  const chosen = attempts.reduce((best, a) => (closeness(a) < closeness(best) ? a : best)) as (Group & { px: number; py: number })[];
  if (seatsIn(chosen) < wantInside * 0.9) notes.push(`The floor holds ${seatsIn(chosen) + barSeats} of the ${target} seats wanted with 0.91 m aisles; it will not fit more without breaking them.`);
  chosen.forEach((g, i) => {
    const reason = i === 0
      ? `Queue lane stays clear in front of the bar. ${spec.seatReason}`
      : g.kind === "six" ? "A six-top in the grid for the bigger parties; aisles stay 0.94 m so a wheelchair passes between tables."
      : `A ${GROUPS[g.kind].label} here, with aisles of at least 0.94 m on every side so a wheelchair can pass.`;
    const cands: Cand[] = g.parts.map((p, k) => ({
      asset: p.asset, rot: p.rot, x: r3(g.px + p.x), y: r3(g.py + p.y), zone: "seating", group: `g${i}`,
      reason: k === 0 ? reason : "", tier: 2, patio: false,
    }));
    units.push({ tier: 2, key: key++, label: `${GROUPS[g.kind].label}`, cands });
  });

  const patioDepth = input.patio?.depth ?? 2.3;
  let patioCount = 0;
  if (input.patio && input.patio.seats > 0) {
    const patioGroups = planGroups(["two"], input.patio.seats, byId);
    const packed = packGroups(patioGroups, { x0: WALL, y0: D + 0.3, x1: W - WALL, y1: D + patioDepth }, []);
    packed.forEach((p, i) => {
      units.push({
        tier: 6, key: key++, label: "patio two-top",
        cands: p.g.parts.map((q, k) => ({
          asset: q.asset, rot: q.rot, x: r3(p.x + q.x), y: r3(p.y + q.y), zone: "patio" as Zone, group: `p${i}`, patio: true, tier: 6,
          reason: k === 0 ? (i === 0 ? "Patio outside the window wall: seats that cost no rent inside, and the first to go if the budget is tight." : "Another patio two-top.") : "",
        })),
      });
      patioCount += p.g.seats;
    });
    if (patioCount < input.patio.seats) notes.push(`The patio strip holds ${patioCount} of the ${input.patio.seats} patio seats wanted.`);
  }

  // ---- budget: drop optional units by priority -------------------------------------------------------------------------
  const priceMemo = new Map<string, number | null>();
  const price = (a: Asset) => { if (!priceMemo.has(a.assetId)) priceMemo.set(a.assetId, priceOf(a)); return priceMemo.get(a.assetId) ?? null; };
  const unitCost = (u: Unit) => u.cands.reduce((s, c) => s + (price(c.asset) ?? 0), 0);
  const total = (us: Unit[]) => us.reduce((s, u) => s + unitCost(u), 0);
  let live = [...units];
  const budget = input.budget ?? null;
  if (budget !== null) {
    const order = [...live].filter((u) => u.tier > 0).sort((a, b) => b.tier - a.tier || b.key - a.key);
    for (const u of order) {
      if (total(live) <= budget + 1e-9) break;
      live = live.filter((x) => x !== u);
      for (const c of u.cands) dropped.push({ assetId: c.asset.assetId, name: c.asset.name, count: 1, reason: "over budget", saved: price(c.asset) ?? 0 });
    }
  }

  // ---- orient, validate with checkLayout, repair --------------------------------------------------------------------
  const finish = (us: Unit[]) => {
    const steps: DesignStep[] = [];
    for (const u of us) for (const c of u.cands) {
      const o = orient(c, W, D, wall);
      steps.push({
        id: "", assetId: c.asset.assetId, asset: c.asset, x: o.x, y: o.y, rot: o.rot, zone: c.zone, group: c.group,
        reason: c.reason, seats: seatsOf(c.asset), price: price(c.asset), tier: c.tier, patio: c.patio,
      });
    }
    return steps;
  };
  const floorRect: Rect = { width: Wreal, depth: Dreal };
  const place = (s: DesignStep, i: number): Placement => placeAsset(s.asset, `${i}`, s.rot, s.x, s.y);
  const inside = (us: Unit[]) => finish(us).filter((s) => !s.patio);
  let repairs = 0;
  for (; repairs < 40; repairs++) {
    const ins = inside(live);
    const issues = checkLayout(floorRect, ins.map(place));
    if (!issues.length) break;
    // remove the lowest-priority unit among those involved; essentials last
    const bad = new Set(issues.flatMap((i) => i.keys.map(Number)));
    const badSteps = [...bad].map((i) => ins[i]);
    const inUnit = live.filter((u) => u.cands.some((c) => badSteps.some((s) => s.group === c.group && s.assetId === c.asset.assetId && s.zone === c.zone)));
    const victim = [...inUnit].sort((a, b) => b.tier - a.tier || b.key - a.key)[0];
    if (!victim) break;
    live = live.filter((u) => u !== victim);
    for (const c of victim.cands) dropped.push({ assetId: c.asset.assetId, name: c.asset.name, count: 1, reason: "failed the layout check", saved: price(c.asset) ?? 0 });
  }
  if (repairs) notes.push(`${repairs} unit(s) were removed because they failed the layout check.`);

  // build order: service, back of house, host, window bar, seating, patio
  const stage: Record<Zone, number> = { service: 0, "back-of-house": 1, host: 2, "window-bar": 3, seating: 4, patio: 5 };
  const sorted = [...live].sort((a, b) => stage[a.cands[0].zone] - stage[b.cands[0].zone] || a.key - b.key);
  const steps = finish(sorted);
  steps.forEach((s, i) => { s.id = `${s.assetId}#d${i}`; });
  const interior = steps.filter((s) => !s.patio);
  const placements = interior.map(place);
  const issues = checkLayout(floorRect, placements);
  // patio: its own strip below the window wall, checked in the canonical frame with the wall edge as the top
  const patioCands = sorted.flatMap((u) => u.cands).filter((c) => c.patio);
  const patioSteps = steps.filter((s) => s.patio);
  const patioIssues = patioCands.length ? checkLayout({ width: W, depth: patioDepth }, patioCands.map((c, i) => placeAsset(c.asset, `${i}`, c.rot, c.x, c.y - D))) : [];

  // access: door mouth and the groups, in the real frame
  const doorReal = orientRect({ x0: doorCenter, y0: D - 0.5, x1: doorCenter, y1: D - 0.5 }, W, D, wall);
  const groupBoxes = new Map<string, Rc>();
  interior.forEach((s, i) => {
    if (s.zone !== "seating" && s.zone !== "window-bar") return;
    const b = placements[i].box;
    const g = groupBoxes.get(s.group);
    groupBoxes.set(s.group, g ? { x0: Math.min(g.x0, b.x0), y0: Math.min(g.y0, b.y0), x1: Math.max(g.x1, b.x1), y1: Math.max(g.y1, b.y1) } : b);
  });
  const access = checkAccess(floorRect, placements, [doorReal.x0, doorReal.y0], [...groupBoxes].map(([name, box]) => ({ name, box })), null);

  const seats = interior.reduce((s, p) => s + p.seats, 0);
  const patioSeats = patioSteps.reduce((s, p) => s + p.seats, 0);
  const costTotal = steps.reduce((s, p) => s + (p.price ?? 0), 0);
  const unpriced = [...new Set(steps.filter((s) => s.price === null).map((s) => s.assetId))];
  const within = target === 0 ? seats === 0 : Math.abs(seats - target) <= target * 0.1 + 1e-9;
  const budgetOk = budget === null || costTotal <= budget + 1e-9;
  if (budget !== null && !budgetOk) notes.push("Even with every optional piece dropped the essentials cost more than the budget.");
  if (budget !== null && dropped.some((d) => d.reason === "over budget") && !within) notes.push("Seats are below target because the budget forced seating to be dropped.");

  // collapse the dropped list per asset
  const merged = new Map<string, Dropped>();
  for (const d of dropped) {
    const k = `${d.assetId}|${d.reason}`;
    const m = merged.get(k);
    if (m) { m.count += d.count; m.saved += d.saved; } else merged.set(k, { ...d });
  }
  const droppedList = [...merged.values()];

  const say = (s: DesignStep) => s.reason;
  const narration = [
    `Right, let me design your ${spec.label}: ${fmt(Wreal)} by ${fmt(Dreal)} metres, aiming for about ${target} seats.`,
    ...steps.map(say).filter(Boolean),
    `That is ${seats} seats${patioSeats ? ` plus ${patioSeats} on the patio` : ""}, ${issues.length === 0 ? "no clearance problems" : `${issues.length} clearance problems`}, and every aisle at least ${ADA_AISLE} metres.`,
    ...(droppedList.length ? [`I had to leave out ${droppedList.map((d) => `${d.count} ${d.name}`).join(", ")}.`] : []),
  ];
  const turnRc = (r: Rc) => orientRect(r, W, D, wall);
  return {
    steps, narration, seats, patioSeats, seatsTarget: target, seatsWithinTolerance: within,
    cost: { total: Math.round(costTotal * 100) / 100, unpriced }, budget, door: [r3(doorReal.x0), r3(doorReal.y0)], windowWall: wall, withinBudget: budgetOk, dropped: droppedList,
    zones: [
      { zone: "service bar", ...turnRc(serviceZone) },
      { zone: "queue lane", ...turnRc(queueLane) },
      { zone: "seating", ...turnRc(zone) },
      ...(barSeats ? [{ zone: "window bar", ...turnRc({ x0: 0, y0: D - 1.25, x1: W, y1: D }) }] : []),
    ],
    issues, patioIssues, access, notes,
  };
}

/** The interior steps as planner pieces (stable ids), so a design can be dropped straight onto the planner floor. */
export const designPieces = (d: AutoDesign): PlacedPiece[] => d.steps.filter((s) => !s.patio).map((s) => ({ id: s.id, asset: s.asset, rot: s.rot, x: s.x, y: s.y }));
