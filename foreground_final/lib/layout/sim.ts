import { benchmarks } from "@/lib/engine/benchmarks";
import type { Concept } from "@/lib/engine/types";
import { ITEM_SPECS, type Item, type Layout, type Pt } from "./types";

const DAY = benchmarks.layout.serviceDay;
const DWELL = benchmarks.layout.dwellMinutes;

/** Where each guest sits, in plan metres: chairs around tables, one per stool. */
export function seatPoints(layout: Pick<Layout, "items">): Pt[] {
  const out: Pt[] = [];
  for (const it of layout.items) out.push(...seatsOf(it));
  return out;
}

function seatsOf(it: Item): Pt[] {
  const n = ITEM_SPECS[it.type].seats;
  if (n === 0) return [];
  if (n === 1) return [[it.x, it.y]];
  // chairs sit on the two long edges, facing each other
  const perSide = n / 2;
  const longW = it.w >= it.d;
  const local: Pt[] = [];
  for (let k = 0; k < perSide; k++) {
    const along = ((k + 0.5) / perSide - 0.5) * (longW ? it.w : it.d) * 0.8;
    const across = (longW ? it.d : it.w) * 0.36;
    local.push(longW ? [along, -across] : [-across, along], longW ? [along, across] : [across, along]);
  }
  const turned = it.rotation === 90 || it.rotation === 270;
  return local.map(([x, y]): Pt => (turned ? [it.x - y, it.y + x] : [it.x + x, it.y + y]));
}

export type SimGuest = {
  /** minutes after opening */
  arrive: number;
  /** seat index into seatPoints, or -1 when the guest gave up waiting */
  seat: number;
  /** minute the guest sat down, or walked away */
  seatAt: number;
  leaveAt: number;
};

export type DaySim = {
  minutes: number;
  openHour: number;
  dwell: number;
  patience: number;
  guests: SimGuest[];
  needed: number;
  served: number;
  walked: number;
  peakQueue: number;
  /** turns the room actually did: served / seats */
  turns: number;
  seats: number;
};

/** Relative demand at a minute of the service day: a lunch peak and a dinner peak. */
export function demandAt(minute: number, concept: Concept): number {
  const hour = DAY.openHour + minute / 60;
  const bell = (peak: number) => Math.exp(-((hour - peak) ** 2) / (2 * DAY.peakSpreadHours ** 2));
  const lunch = DAY.lunchShare[concept];
  return lunch * bell(DAY.lunchPeakHour) + (1 - lunch) * bell(DAY.dinnerPeakHour);
}

/**
 * One service day on this plan at a given number of covers (use the break-even covers to ask "will it fill?").
 * Guests arrive on the demand curve, take any free seat, hold it for the concept's dwell time, and leave. A guest
 * who waits past the patience limit walks away. Deterministic: same plan and covers, same day.
 */
export function simulateDay(layout: Pick<Layout, "items">, opts: { covers: number; concept: Concept }): DaySim {
  const seats = seatPoints(layout).length;
  const minutes = (DAY.closeHour - DAY.openHour) * 60;
  const dwell = DWELL[opts.concept];
  const patience = DAY.patienceMinutes;
  const needed = Math.max(0, Math.round(opts.covers));

  // arrival minutes from the inverse of the cumulative demand curve
  const cdf: number[] = [];
  let acc = 0;
  for (let m = 0; m < minutes; m++) cdf.push((acc += demandAt(m, opts.concept)));
  const guests: SimGuest[] = [];
  let m = 0;
  for (let i = 0; i < needed; i++) {
    const q = ((i + 0.5) / needed) * acc;
    while (m < minutes - 1 && cdf[m] < q) m++;
    guests.push({ arrive: m, seat: -1, seatAt: -1, leaveAt: -1 });
  }

  const freeAt = new Array<number>(seats).fill(0);
  let rng = 1234567;
  const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const queue: number[] = [];
  let cursor = 0;
  let peakQueue = 0;
  let served = 0;
  for (let t = 0; t < minutes; t++) {
    while (cursor < guests.length && guests[cursor].arrive <= t) queue.push(cursor++);
    while (queue.length && t - guests[queue[0]].arrive > patience) guests[queue.shift()!].seatAt = t;
    if (queue.length) {
      const free: number[] = [];
      for (let s = 0; s < seats; s++) if (freeAt[s] <= t) free.push(s);
      while (queue.length && free.length) {
        const g = guests[queue.shift()!];
        const seat = free.splice(Math.floor(next() * free.length), 1)[0];
        g.seat = seat;
        g.seatAt = t;
        g.leaveAt = t + dwell;
        freeAt[seat] = t + dwell;
        served++;
      }
    }
    peakQueue = Math.max(peakQueue, queue.length);
  }
  for (const i of queue) guests[i].seatAt = minutes;
  return { minutes, openHour: DAY.openHour, dwell, patience, guests, needed, served, walked: needed - served, peakQueue, turns: seats > 0 ? served / seats : 0, seats };
}
