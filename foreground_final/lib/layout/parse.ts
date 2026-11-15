import type { Concept } from "@/lib/engine/types";
import { ITEM_SPECS, type ItemType, type Layout, type Op } from "./types";
import { countByType, seatCount } from "./validate";

const TYPE_WORDS: [RegExp, ItemType][] = [
  [/two[- ]?tops?|2[- ]?tops?|tables? for two|deuces?/, "two-top"],
  [/four[- ]?tops?|4[- ]?tops?|tables? for four/, "four-top"],
  [/six[- ]?tops?|6[- ]?tops?|large tables?|communal tables?/, "six-top"],
  [/booths?/, "booth"],
  [/(bar )?stools?/, "bar-stool"],
  [/patio (tables?|seating)|outdoor (tables?|seating)/, "patio-table"],
  [/restrooms?|bathrooms?|toilets?/, "restroom"],
  [/walk[- ]?ins?|coolers?/, "walk-in"],
  [/prep( tables?)?/, "prep"],
  [/host( stand)?/, "host"],
  [/bar( counter)?/, "bar-counter"],
  [/(service |order |pickup )?counter/, "counter"],
  [/kitchen|cook ?line|hood/, "kitchen-line"],
];

const CONCEPT_WORDS: [RegExp, Concept][] = [
  [/coffee|caf[eé]|bakery|espresso/, "cafe"],
  [/full[- ]service|sit[- ]down|fine dining|table service/, "full-service"],
  [/fast[- ]casual/, "fast-casual"],
  [/quick[- ]service|take[- ]?out|grab[- ]and[- ]go|counter service/, "quick-service"],
  [/\b(cocktail |wine |sports )?bar\b|pub|tap ?room/, "bar"],
];

const WALLS = /\b(window|front|back|rear|left|right|top|bottom)\b/;
const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12, twenty: 20 };
const num = (s: string | undefined, fallback: number) => (s ? (NUM[s] ?? (Number(s) || fallback)) : fallback);
const typeIn = (s: string): ItemType | undefined => TYPE_WORDS.find(([re]) => re.test(s))?.[1];
const wallIn = (s: string) => {
  const w = WALLS.exec(s)?.[1];
  return w === "rear" ? "back" : (w as "window" | "front" | "back" | "left" | "right" | "top" | "bottom" | undefined);
};

/**
 * Small offline reader for the common instructions, used when the model cannot be reached.
 * Returns null when it does not understand, so the caller can say so.
 */
export function parseInstruction(text: string, layout: Layout): Op[] | null {
  const s = text.toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (!s) return null;
  const ops: Op[] = [];
  const counts = countByType(layout);

  const concept = /\b(make|turn|convert|switch|change)\b.*\b(it|this|into|to)\b/.test(s) ? CONCEPT_WORDS.find(([re]) => re.test(s))?.[1] : undefined;
  if (concept) return [{ op: "setConcept", concept }];

  const seats = /(\d+)\s+(more|extra|additional|fewer|less)\s+seats?/.exec(s) ?? /(add|remove|cut|drop)\s+(\d+)\s+seats?/.exec(s);
  if (seats) {
    const n = Number(seats[1]) || Number(seats[2]);
    const down = /fewer|less|remove|cut|drop/.test(seats[0]);
    return [{ op: "setSeats", seats: Math.max(0, seatCount(layout) + (down ? -n : n)) }];
  }
  const total = /(\d+)\s+seats?\b/.exec(s);
  if (total) return [{ op: "setSeats", seats: Number(total[1]) }];

  const mix = /more (.+?)(?:,| and| but)? (?:fewer|less) (.+)/.exec(s);
  if (mix) {
    const up = typeIn(mix[1]);
    const down = typeIn(mix[2]);
    if (up && down) {
      const take = Math.max(1, Math.min(counts[down] ?? 0, Math.ceil((counts[down] ?? 0) / 2)));
      const give = Math.max(1, Math.round((take * ITEM_SPECS[down].seats) / Math.max(1, ITEM_SPECS[up].seats)));
      return [
        { op: "remove", type: down, count: take },
        { op: "add", type: up, count: give },
      ];
    }
  }

  const move = /\b(move|put|shift|relocate)\b (?:the |my )?(.+?) (?:to|against|along|at|on|by|near) (?:the )?(.+)/.exec(s);
  if (move) {
    const type = typeIn(move[2]);
    const wall = wallIn(move[3]);
    if (type && wall && (counts[type] ?? 0) > 0 && move[1] !== "put") return [{ op: "move", type, to: { wall } }];
    if (type && wall) {
      ops.push({ op: "add", type, count: num(/^(\d+|a|an|one|two|three|four|five|six)\b/.exec(move[2])?.[1], 1), near: wall });
      if (type === "bar-counter") ops.push({ op: "add", type: "bar-stool", count: 6, near: "bar-counter" });
      return ops;
    }
  }

  const change = /\b(add|remove|delete|drop|take out)\b\s+(\d+|a|an|one|two|three|four|five|six|eight|ten|twelve|twenty)?\s*(.+)/.exec(s);
  if (change) {
    const type = typeIn(change[3]);
    if (type) {
      const count = num(change[2], 1);
      if (change[1] === "add") {
        ops.push({ op: "add", type, count, near: wallIn(change[3]) });
        if (type === "bar-counter") ops.push({ op: "add", type: "bar-stool", count: 6, near: "bar-counter" });
      } else ops.push({ op: "remove", type, count });
      return ops;
    }
  }
  return null;
}
