// Turns an auto-design (or a plain question about the floor) into the step list the Fio character performs:
// walk to the crate, pick a piece, walk to a spot beside where it goes, set it down, say why.
import { checkLayout, placeAsset, type Placement, type Rect } from "./asset-layout";
import type { Asset } from "./assets";
import type { AutoDesign, DesignStep } from "./auto-design";
import { FioTimeline, DEFAULT_SPEED, readTime, pathLength, type FioItem, type FioStep } from "./fio-steps";
import { route, seatsOf, toPlacements, type PlacedPiece, type Pt } from "./planner";

export type FioPlanOptions = {
  speed?: number;
  /** Skip the crate trips and the narration pauses (for tests and quick replays). */
  fast?: boolean;
  /** Where the crate of pieces sits (default: the door mouth). */
  supply?: Pt;
};
export type FioPlan = { steps: FioStep[]; items: FioItem[]; stands: Pt[]; duration: number };

const ZONE_COLOR: Record<DesignStep["zone"], string> = {
  service: "var(--accent)",
  "back-of-house": "var(--foreground)",
  host: "var(--accent)",
  "window-bar": "var(--match)",
  seating: "var(--match)",
  patio: "var(--match)",
};

export function itemOf(s: DesignStep): FioItem {
  const p = placeAsset(s.asset, s.id, s.rot, s.x, s.y);
  return {
    id: s.id,
    label: s.asset.name,
    cx: (p.box.x0 + p.box.x1) / 2,
    cy: (p.box.y0 + p.box.y1) / 2,
    w: p.box.x1 - p.box.x0,
    d: p.box.y1 - p.box.y0,
    color: ZONE_COLOR[s.zone],
  };
}

const boxHit = (b: Placement["box"], x: number, y: number, pad: number) => x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad;

/** A spot to stand beside the piece: free of every placed piece, on the floor, nearest to where Fio is now. */
export function standSpot(floor: Rect, placed: Placement[], target: Placement, from: Pt, offFloor = false): Pt {
  const b = target.box;
  const off = 0.5;
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const cands: Pt[] = [
    [cx, b.y1 + off], [cx, b.y0 - off], [b.x0 - off, cy], [b.x1 + off, cy],
    [b.x0 - off, b.y1 + off], [b.x1 + off, b.y1 + off], [b.x0 - off, b.y0 - off], [b.x1 + off, b.y0 - off],
  ];
  const ok = (p: Pt, pad: number) =>
    (offFloor || (p[0] > 0.2 && p[1] > 0.2 && p[0] < floor.width - 0.2 && p[1] < floor.depth - 0.2)) &&
    !placed.some((o) => boxHit(o.box, p[0], p[1], pad)) && !boxHit(b, p[0], p[1], 0.2);
  for (const pad of [0.3, 0.2, 0.1, 0]) {
    const free = cands.filter((p) => ok(p, pad)).sort((a, c) => Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(c[0] - from[0], c[1] - from[1]));
    if (free.length) return free[0];
  }
  return cands[0];
}

/** Walk path that stays on the floor around what is already placed; outside the floor (patio) it goes straight via the door. */
function pathTo(floor: Rect, placed: Placement[], from: Pt, to: Pt, door: Pt): Pt[] {
  const onFloor = (p: Pt) => p[0] >= 0 && p[1] >= 0 && p[0] <= floor.width && p[1] <= floor.depth;
  if (onFloor(from) && onFloor(to)) return route(floor, placed, from, to).slice(1);
  if (!onFloor(from) && !onFloor(to)) return [to];
  return onFloor(from) ? [...route(floor, placed, from, door).slice(1), to] : [door, ...route(floor, placed, door, to).slice(1)];
}

/**
 * The performance of a design: an intro, then per piece (crate, pick, walk saying the reason, place), then a wrap-up.
 * Pieces of one group (a table and its chairs) are taken from the crate once and handed out in a row.
 */
export function planDesign(design: AutoDesign, floor: Rect, opts: FioPlanOptions = {}): FioPlan {
  const speed = opts.speed ?? DEFAULT_SPEED;
  const door = design.door;
  const supply = opts.supply ?? door;
  const steps: FioStep[] = [];
  const items: FioItem[] = [];
  const stands: Pt[] = [];
  let pos: Pt = door;
  const placed: PlacedPiece[] = [];
  const intro = design.narration[0];
  const centre: Pt = [floor.width / 2, floor.depth / 2];
  steps.push({ kind: "say", text: intro, dur: opts.fast ? 0.5 : undefined });
  steps.push({ kind: "look", at: centre, dur: opts.fast ? 0.3 : 1.4 });
  let lastGroup = "";
  design.steps.forEach((s) => {
    const item = itemOf(s);
    items.push(item);
    const groupKey = `${s.zone}:${s.group}`;
    if (!opts.fast && groupKey !== lastGroup) {
      const back = pathTo(floor, toPlacements(placed), pos, supply, door);
      if (back.length && pathLength([pos, ...back]) > 0.2) steps.push({ kind: "walk", path: back });
      pos = supply;
    }
    lastGroup = groupKey;
    steps.push({ kind: "pick", item });
    const target = placeAsset(s.asset, s.id, s.rot, s.x, s.y);
    const stand = standSpot(floor, toPlacements(placed), target, pos, s.patio);
    stands.push(stand);
    const path = pathTo(floor, toPlacements(placed), pos, stand, door);
    const walk = pathLength([pos, ...path]) / speed;
    steps.push({ kind: "walk", path, say: s.reason || undefined });
    const hold = opts.fast || !s.reason ? 0.9 : Math.min(5, Math.max(0.9, readTime(s.reason) - walk));
    steps.push({ kind: "place", item, dur: hold, say: s.reason || undefined });
    placed.push({ id: s.id, asset: s.asset, rot: s.rot, x: s.x, y: s.y });
    pos = stand;
  });
  steps.push({ kind: "celebrate", dur: opts.fast ? 0.5 : 2, say: design.narration[design.narration.length - (design.dropped.length ? 2 : 1)] });
  if (design.dropped.length) steps.push({ kind: "say", text: design.narration[design.narration.length - 1], dur: opts.fast ? 0.5 : undefined });
  const tl = new FioTimeline(door, { speed });
  return { steps, items, stands, duration: tl.push(steps, 0).end };
}

// ---- looking around and answering ---------------------------------------------------------------------------------

export type Inspection = { seats: number; problems: string[]; pieces: number; cost: number | null; unpriced: number };

export function inspectFloor(floor: Rect, placed: PlacedPiece[], priceOf?: (a: Asset) => number | null): Inspection {
  const ps = toPlacements(placed);
  const problems = checkLayout(floor, ps).map((i) => i.message);
  const prices = priceOf ? placed.map((p) => priceOf(p.asset)) : [];
  return {
    seats: placed.reduce((s, p) => s + seatsOf(p.asset), 0),
    problems,
    pieces: placed.length,
    cost: priceOf ? prices.reduce<number>((s, v) => s + (v ?? 0), 0) : null,
    unpriced: prices.filter((v) => v === null).length,
  };
}

/** Plain-words answers from the floor as it is now (no model call). */
export function answerQuestion(question: string, i: Inspection): string {
  const q = question.toLowerCase();
  const first = i.problems[0];
  if (i.pieces === 0) return "The floor is empty. Ask me to design your place and I will fill it.";
  if (/seat|chair|cover|how many (people|guests)/.test(q)) return `I count ${i.seats} seats.`;
  if (/problem|issue|wrong|ok\b|okay|fine|check|inspect|clear|overlap/.test(q)) {
    return i.problems.length ? `I found ${i.problems.length} problem${i.problems.length > 1 ? "s" : ""}. First: ${first}` : "Nothing flagged: no overlaps, no blocked clearances.";
  }
  if (/ada|wheelchair|aisle|access/.test(q)) return i.problems.some((p) => /aisle|clearance/.test(p)) ? `I would not sign off yet: ${first}` : "No clearance or aisle problems against the catalog assumptions. Confirm 0.91 m paths on site.";
  if (/cost|price|much|budget/.test(q)) return i.cost === null ? "I have no prices wired in here." : `About $${Math.round(i.cost).toLocaleString("en-US")} for ${i.pieces - i.unpriced} priced pieces${i.unpriced ? `, ${i.unpriced} more have no price on file` : ""}.`;
  return `${i.pieces} pieces, ${i.seats} seats, ${i.problems.length ? `${i.problems.length} problem${i.problems.length > 1 ? "s" : ""}` : "no problems"}.`;
}

/** Walk the room with the magnifier (corners and the middle, around what is placed), then answer. */
export function lookAroundPlan(floor: Rect, placed: PlacedPiece[], from: Pt, answer: string, opts: { fast?: boolean } = {}): FioStep[] {
  const ps = toPlacements(placed);
  const marks: Pt[] = [[floor.width * 0.2, floor.depth * 0.3], [floor.width * 0.8, floor.depth * 0.3], [floor.width * 0.8, floor.depth * 0.75], [floor.width * 0.25, floor.depth * 0.75]];
  const steps: FioStep[] = [];
  let pos = from;
  for (const m of marks) {
    const at = ps.some((p) => boxHit(p.box, m[0], m[1], 0.35)) ? standSpot(floor, ps, ps.find((p) => boxHit(p.box, m[0], m[1], 0.35))!, pos) : m;
    steps.push({ kind: "walk", path: route(floor, ps, pos, at).slice(1) });
    steps.push({ kind: "look", at: [floor.width / 2, floor.depth / 2], dur: opts.fast ? 0.3 : 1.2 });
    pos = at;
  }
  steps.push({ kind: "think", dur: opts.fast ? 0.3 : 1 });
  steps.push({ kind: "say", text: answer, dur: opts.fast ? 0.5 : undefined });
  return steps;
}
