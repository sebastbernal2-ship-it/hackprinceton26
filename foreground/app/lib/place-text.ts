// Local deterministic reader for furniture instructions ("add a bar along the windows", "6 two-tops"). No model call.
import type { Asset } from "./assets";
import type { Rect } from "./asset-layout";
import { DOOR_WIDTH, doorX, findSpot, newId, sizeFor, toPlacements, type PlacedPiece } from "./planner";

export type Wall = "front" | "back" | "left" | "right";
type Want = { ids: string[]; count: number; wall?: Wall; label: string };
const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10, twelve: 12 };
const num = (s?: string) => (s ? (NUM[s] ?? (Number(s) || 1)) : 1);

const KINDS: [RegExp, string[], string][] = [
  [/two[- ]?tops?|2[- ]?tops?|deuces?/, ["table_2top_30", "chair_dining", "chair_dining"], "two-top"],
  [/four[- ]?tops?|4[- ]?tops?/, ["table_4top_30x48", "chair_dining", "chair_dining", "chair_dining", "chair_dining"], "four-top"],
  [/communal|six[- ]?tops?|6[- ]?tops?/, ["communal_table_96", "chair_dining", "chair_dining", "chair_dining", "chair_dining"], "communal table"],
  [/high[- ]?tops?/, ["table_hightop_30", "bar_stool", "bar_stool"], "high-top"],
  [/booths?/, ["booth_60"], "booth"],
  [/banquettes?/, ["banquette_90"], "banquette"],
  [/stools?/, ["bar_stool"], "stool"],
  [/chairs?/, ["chair_dining"], "chair"],
  [/\bbar\b/, ["bar_counter_run_120", "bar_stool", "bar_stool", "bar_stool", "bar_stool"], "bar"],
];
const WALL = /\b(window|windows|front|back|rear|left|right)\b/;
const wallOf = (w?: string): Wall | undefined => (!w ? undefined : w === "window" || w === "windows" || w === "front" ? "front" : w === "rear" ? "back" : (w as Wall));

export type Parsed = { add: Want[]; remove: { ids: string[]; count: number }[] } | null;

export function parseInstruction(text: string): Parsed {
  const s = text.toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (!s) return null;
  const wall = wallOf(WALL.exec(s)?.[1]);
  const m = /^(?:(add|remove|delete|drop|take out|put|place)\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|ten|twelve)?\s*(.+)$/.exec(s);
  if (!m) return null;
  const kind = KINDS.find(([re]) => re.test(m[3]));
  if (!kind) return null;
  const count = num(m[2]);
  if (m[1] && /remove|delete|drop|take/.test(m[1])) return { add: [], remove: [{ ids: [kind[1][0]], count }] };
  return { add: [{ ids: kind[1], count: kind[2] === "bar" ? 1 : count, wall, label: kind[2] }], remove: [] };
}

const hit = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a, pad = 0.05) => a.x0 < b.x1 + pad && a.x1 + pad > b.x0 && a.y0 < b.y1 + pad && a.y1 + pad > b.y0;

/** First free position along a wall (door/windows assumed on the front, bottom edge); falls back to any free spot. */
function spotAlong(floor: Rect, placed: PlacedPiece[], a: Asset, wall: Wall) {
  const boxes = toPlacements(placed).map((p) => p.box);
  if (wall === "front") boxes.push({ x0: doorX(floor) - DOOR_WIDTH / 2 - 0.2, x1: doorX(floor) + DOOR_WIDTH / 2 + 0.2, y0: floor.depth - 1.4, y1: floor.depth });
  const { w, d } = sizeFor(a, 0);
  const cands: { x: number; y: number }[] = [];
  const stepX = (y: number) => { for (let x = 0.1; x + w <= floor.width - 0.1; x += 0.2) cands.push({ x, y }); };
  const stepY = (x: number) => { for (let y = 0.1; y + d <= floor.depth - 0.1; y += 0.2) cands.push({ x, y }); };
  if (wall === "front") stepX(floor.depth - d - 0.1);
  if (wall === "back") stepX(0.1);
  if (wall === "left") stepY(0.1);
  if (wall === "right") stepY(floor.width - w - 0.1);
  return cands.find((c) => !boxes.some((b) => hit({ x0: c.x, y0: c.y, x1: c.x + w, y1: c.y + d }, b))) ?? null;
}

export type ApplyResult = { placed: PlacedPiece[]; note: string };

export function applyInstruction(text: string, floor: Rect, placed: PlacedPiece[], assets: Asset[]): ApplyResult {
  const p = parseInstruction(text);
  if (!p) return { placed, note: 'Did not understand. Try "6 two-tops", "add a bar along the windows" or "remove 2 stools".' };
  const byId = new Map(assets.map((a) => [a.assetId, a]));
  let next = placed;
  const msgs: string[] = [];
  for (const r of p.remove) {
    let n = r.count;
    next = [...next].reverse().filter((x) => (n > 0 && r.ids.includes(x.asset.assetId) ? (n--, false) : true)).reverse();
    msgs.push(`Removed ${r.count - n}`);
  }
  for (const w of p.add) {
    const missing = w.ids.find((id) => !byId.has(id));
    if (missing) { msgs.push(`${missing} is not in the catalog`); continue; }
    let done = 0;
    for (let i = 0; i < w.count; i++) {
      const group: PlacedPiece[] = [];
      w.ids.forEach((id, k) => {
        const a = byId.get(id)!;
        const cur = [...next, ...group];
        const first = group[0];
        let spot: { x: number; y: number; rot: 0 | 90 | 180 | 270 } | null = null;
        if (k === 0) {
          const along = w.wall ? spotAlong(floor, cur, a, w.wall) : null;
          spot = along ? { ...along, rot: 0 } : findSpot(floor, cur, a);
        } else {
          // extras sit beside the first piece: stools in a row on the room side of a bar, chairs above and below a table
          const sz = sizeFor(a, 0);
          const f = sizeFor(first.asset, first.rot);
          const bar = w.label === "bar";
          const i = k - 1;
          const below = !bar && i % 2 === 1;
          const n = bar ? i : Math.floor(i / 2);
          const x = bar ? first.x + 0.15 + n * (sz.w + 0.12) : first.x + (f.w - (w.ids.length > 3 ? 2 : 1) * sz.w) / 2 + n * (sz.w + 0.08);
          const y = below ? first.y + f.d + 0.05 : first.y - sz.d - 0.05;
          const box = { x0: x, y0: y, x1: x + sz.w, y1: y + sz.d };
          const free = x >= 0 && y >= 0 && x + sz.w <= floor.width && y + sz.d <= floor.depth && !toPlacements(cur).some((p) => hit(box, p.box, 0.01));
          spot = free ? { x, y, rot: below ? 180 : 0 } : findSpot(floor, cur, a);
        }
        if (spot) group.push({ id: newId(a), asset: a, rot: spot.rot, x: spot.x, y: spot.y });
      });
      if (!group.length) break;
      next = [...next, ...group];
      done++;
    }
    msgs.push(done ? `Added ${done} ${w.label}${done > 1 ? "s" : ""}${w.wall ? ` along the ${w.wall === "front" ? "front (assumed windows)" : w.wall} wall` : ""}` : `No free room for ${w.label}`);
    if (done < w.count && done) msgs.push(`only ${done} of ${w.count} fit`);
  }
  return { placed: next, note: msgs.join("; ") + "." };
}
