/**
 * Pure model for the growth mini-simulation: the stages, their DEMO numbers, the seat map, and a tiny
 * walking-people stepper. Every dollar and footfall figure here is an illustrative scenario range, not a forecast
 * and not this property's data.
 */
export type Pt = [number, number];
export type Range = { low: number; high: number };
export type Stage = {
  id: "open" | "patio" | "suite" | "second";
  label: string;
  month: number;
  blurb: string;
  seats: number;
  footfall: Range;
  revenue: Range;
  cost: Range;
  capex: Range;
};

export const STAGES: Stage[] = [
  { id: "open", label: "Opening", month: 0, blurb: "Counter, four tables, one door.", seats: 8, footfall: { low: 90, high: 140 }, revenue: { low: 22000, high: 34000 }, cost: { low: 19000, high: 26000 }, capex: { low: 120000, high: 180000 } },
  { id: "patio", label: "Add a patio", month: 6, blurb: "Eight outdoor seats in front of the shop.", seats: 16, footfall: { low: 120, high: 190 }, revenue: { low: 30000, high: 46000 }, cost: { low: 24000, high: 31000 }, capex: { low: 8000, high: 14000 } },
  { id: "suite", label: "Open into Suite B", month: 14, blurb: "Cut through the shared wall into the next unit.", seats: 24, footfall: { low: 170, high: 260 }, revenue: { low: 44000, high: 68000 }, cost: { low: 35000, high: 46000 }, capex: { low: 60000, high: 110000 } },
  { id: "second", label: "Second location", month: 24, blurb: "A compact counter-service shop elsewhere.", seats: 32, footfall: { low: 240, high: 380 }, revenue: { low: 70000, high: 110000 }, cost: { low: 58000, high: 78000 }, capex: { low: 140000, high: 220000 } },
];

export type Seat = { id: string; zone: "cafe" | "patio" | "suite" | "second"; at: Pt; route: Pt[] };

const DOOR_OUT: Pt = [275, 322], DOOR_IN: Pt = [275, 262];
const PATIO_OUT: Pt = [100, 322], PATIO_IN: Pt = [100, 268];
const L2_OUT: Pt = [650, 322], L2_IN: Pt = [650, 262];

/** Tables as [cx, cy]; each gets a seat to its left and right. */
export const TABLES = {
  cafe: [[215, 150], [335, 150], [215, 220], [335, 220]] as Pt[],
  patio: [[55, 170], [135, 170], [55, 245], [135, 245]] as Pt[],
  suite: [[435, 150], [495, 150], [435, 230], [495, 230]] as Pt[],
  second: [[600, 175], [700, 175], [600, 235], [700, 235]] as Pt[],
};
export const SEAT_DX = 22;

function build(): Seat[] {
  const seats: Seat[] = [];
  const add = (zone: Seat["zone"], tables: Pt[], route: (y: number, x: number) => Pt[]) =>
    tables.forEach(([cx, cy], t) => [-SEAT_DX, SEAT_DX].forEach((dx, s) => {
      const x = cx + dx;
      seats.push({ id: `${zone}-${t}-${s}`, zone, at: [x, cy], route: [...route(cy, x), [x, cy]] });
    }));
  add("cafe", TABLES.cafe, (y) => [DOOR_OUT, DOOR_IN, [275, y]]);
  add("patio", TABLES.patio, (y) => [PATIO_OUT, PATIO_IN, [100, y]]);
  add("suite", TABLES.suite, (_y, x) => [DOOR_OUT, DOOR_IN, [275, 190], [400, 190], [x, 190]]);
  add("second", TABLES.second, (y) => [L2_OUT, L2_IN, [650, y]]);
  return seats;
}
export const ALL_SEATS: Seat[] = build();

const ZONES_BY_STAGE: Seat["zone"][][] = [["cafe"], ["cafe", "patio"], ["cafe", "patio", "suite"], ["cafe", "patio", "suite", "second"]];
export const seatsForStage = (stage: number): Seat[] => ALL_SEATS.filter((s) => ZONES_BY_STAGE[stage].includes(s.zone));

/** Where a takeaway guest stops at the counter, per zone that has one. */
export const TAKEAWAY: { cafe: Pt[]; second: Pt[] } = {
  cafe: [DOOR_OUT, DOOR_IN, [275, 112]],
  second: [L2_OUT, L2_IN, [650, 150]],
};

export type Person = {
  id: number; x: number; y: number; color: number;
  phase: "in" | "sit" | "out";
  route: Pt[]; ri: number; seat: string | null; timer: number; walking: boolean;
};

export const PERSON_COLORS = ["#d9512c", "#5f6d4e", "#1b1a17", "#b08a5b", "#6b7a8f"];
export const SPEED = 58;

/** Average guests arriving per second, driven by the stage's mid footfall. */
export const spawnRate = (stage: number) => ((STAGES[stage].footfall.low + STAGES[stage].footfall.high) / 2 / 100) * 0.6;

export type Rng = () => number;

export function spawn(people: Person[], stage: number, id: number, rng: Rng): Person | null {
  const taken = new Set(people.map((p) => p.seat).filter(Boolean));
  const free = seatsForStage(stage).filter((s) => !taken.has(s.id));
  const color = Math.floor(rng() * PERSON_COLORS.length);
  const takeaway = rng() < 0.25;
  if (takeaway) {
    const zones = stage >= 3 && rng() < 0.4 ? TAKEAWAY.second : TAKEAWAY.cafe;
    return { id, x: zones[0][0], y: zones[0][1] + 8, color, phase: "in", route: zones, ri: 0, seat: null, timer: 0, walking: true };
  }
  if (free.length === 0) return null;
  const seat = free[Math.floor(rng() * free.length)];
  return { id, x: seat.route[0][0], y: seat.route[0][1] + 8, color, phase: "in", route: seat.route, ri: 0, seat: seat.id, timer: 0, walking: true };
}

/** Advance everyone by dt seconds. People whose seat no longer exists (slider moved back) are dropped. */
export function step(people: Person[], dt: number, stage: number, rng: Rng): Person[] {
  const live = new Set(seatsForStage(stage).map((s) => s.id));
  const out: Person[] = [];
  for (const p0 of people) {
    if (p0.seat && !live.has(p0.seat)) continue;
    const p = { ...p0 };
    let budget = SPEED * dt;
    p.walking = false;
    if (p.phase === "sit" || (p.phase === "in" && p.ri >= p.route.length)) {
      if (p.phase === "in") { p.phase = "sit"; p.timer = p.seat ? 6 + rng() * 7 : 1.2 + rng() * 1.2; }
      p.timer -= dt;
      if (p.timer <= 0) {
        p.route = p.route.slice(0, -1).reverse();
        p.ri = 0; p.phase = "out";
      }
      out.push(p); continue;
    }
    while (budget > 0 && p.ri < p.route.length) {
      const [tx, ty] = p.route[p.ri];
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      p.walking = true;
      if (d <= budget) { p.x = tx; p.y = ty; p.ri++; budget -= d; } else { p.x += (dx / d) * budget; p.y += (dy / d) * budget; budget = 0; }
    }
    if (p.phase === "out" && p.ri >= p.route.length) continue; // reached the street: gone
    out.push(p);
  }
  return out;
}

/** Deterministic seated crowd for reduced motion: about 55% of seats, no movement. */
export function staticCrowd(stage: number): Person[] {
  return seatsForStage(stage).filter((_, i) => i % 9 < 5).map((s, i) => ({
    id: i, x: s.at[0], y: s.at[1], color: i % PERSON_COLORS.length, phase: "sit" as const, route: s.route, ri: s.route.length, seat: s.id, timer: 1e9, walking: false,
  }));
}

export const net = (s: Stage): Range => ({ low: s.revenue.low - s.cost.high, high: s.revenue.high - s.cost.low });

export function fmtK(n: number): string {
  const a = Math.abs(n);
  const body = a >= 1000 ? `${Math.round(a / 100) / 10}k`.replace(/\.0k$/, "k") : String(a);
  return `${n < 0 ? "-" : ""}$${body}`;
}
export const fmtRange = (r: Range) => `${fmtK(r.low)} to ${fmtK(r.high)}`;
