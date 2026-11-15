// "Will it fill?": a deterministic lunch-rush simulation on the seat count of the placed plan.
// Every number is an ESTIMATED demo scenario (peak demand, dwell, patience, average check), not observed data.
export type RushInput = { seats: number; peakPerHour: number; dwell?: number; patience?: number };
export type Rush = {
  openHour: number;
  minutes: number;
  seats: number;
  needed: number;
  served: number;
  walked: number;
  peakQueue: number;
  turns: number;
  dwell: number;
  patience: number;
  /** per minute after opening */
  timeline: { seated: number; queue: number; walked: number; arrived: number }[];
  revenuePerHour: { low: number; high: number };
};

export const RUSH = { openHour: 11, closeHour: 14.5, peakHour: 12.5, spreadHours: 0.7, dwell: 40, patience: 12, check: { low: 9, high: 14 } };

const demand = (minute: number) => Math.exp(-((RUSH.openHour + minute / 60 - RUSH.peakHour) ** 2) / (2 * RUSH.spreadHours ** 2));

/** Guests arrive on a bell curve peaking at `peakPerHour`; each takes a free seat for `dwell` minutes or walks after `patience`. */
export function simulateRush({ seats, peakPerHour, dwell = RUSH.dwell, patience = RUSH.patience }: RushInput): Rush {
  const minutes = Math.round((RUSH.closeHour - RUSH.openHour) * 60);
  const perMin = Array.from({ length: minutes }, (_, m) => (Math.max(0, peakPerHour) / 60) * demand(m));
  const arrivals: number[] = [];
  let acc = 0;
  for (let m = 0; m < minutes; m++) {
    const before = Math.floor(acc);
    acc += perMin[m];
    for (let k = before; k < Math.floor(acc); k++) arrivals.push(m);
  }
  const needed = arrivals.length;
  const freeAt = new Array<number>(Math.max(0, seats)).fill(0);
  const queue: number[] = [];
  const timeline: Rush["timeline"] = [];
  let cursor = 0, served = 0, walked = 0, peakQueue = 0;
  for (let t = 0; t < minutes; t++) {
    while (cursor < needed && arrivals[cursor] <= t) queue.push(arrivals[cursor++]);
    while (queue.length && t - queue[0] > patience) { queue.shift(); walked++; }
    for (let s = 0; s < freeAt.length && queue.length; s++) {
      if (freeAt[s] <= t) { queue.shift(); freeAt[s] = t + dwell; served++; }
    }
    peakQueue = Math.max(peakQueue, queue.length);
    timeline.push({ seated: freeAt.filter((f) => f > t).length, queue: queue.length, walked, arrived: cursor });
  }
  walked += queue.length;
  const hours = minutes / 60;
  return {
    openHour: RUSH.openHour, minutes, seats, needed, served, walked, peakQueue, dwell, patience, timeline,
    turns: seats > 0 ? served / seats : 0,
    revenuePerHour: { low: Math.round((served * RUSH.check.low) / hours), high: Math.round((served * RUSH.check.high) / hours) },
  };
}

export const clock = (openHour: number, minute: number) => {
  const total = Math.round(openHour * 60 + minute);
  const h = Math.floor(total / 60);
  return `${((h + 11) % 12) + 1}:${String(total % 60).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};
