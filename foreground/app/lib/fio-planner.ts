// Fio's hands in the Planner: a local deterministic command layer over the placed pieces. No model, no network.
// "clear the room", "remove the sofa", "move the espresso machine to the back wall", "rotate the counter",
// "what is in this room?", "undo" and (through place-text.ts) "6 two-tops", "put a bar by the door".
// Floor convention is the planner's: the door and windows are on the front (bottom) edge.
import type { Rect, Rot } from "./asset-layout";
import type { Asset } from "./assets";
import { hit, spotAlong, applyInstruction, type Wall } from "./place-text";
import { doorX, findSpot, rotated, seatsOf, sizeFor, toPlacements, type PlacedPiece } from "./planner";

export type FioResult = { placed: PlacedPiece[]; note: string; changed: boolean; undo?: boolean };

const STOP = new Set(["the", "a", "an", "all", "every", "any", "of", "my", "our", "this", "that", "these", "those", "please", "it", "me", "room", "space", "floor", "scene", "everything"]);
/** Words a person says, rewritten to the catalog's own tokens ("two-top" -> "2top"). */
const ALIAS: [RegExp, string][] = [
  [/\btwo[- ]?tops?\b/g, "2top"], [/\bfour[- ]?tops?\b/g, "4top"], [/\bhigh[- ]?tops?\b/g, "hightop"], [/\bcouch(es)?\b/g, "banquette"],
  [/\bsofas?\b/g, "banquette"], [/\bespresso\b/g, "espresso"], [/\bcoffee machine\b/g, "espresso machine"],
];
const tokens = (phrase: string) => {
  let s = phrase.toLowerCase();
  for (const [re, to] of ALIAS) s = s.replace(re, to);
  return s.split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t)).map((t) => t.replace(/(?<=[a-z]{3})(es|s)$/, (m, e, i, str) => (m === "es" && !/(ch|sh|x|ss)es$/.test(str) ? "e" : "")));
};
const haystack = (a: Asset) => `${a.assetId} ${a.name}`.toLowerCase().replace(/[_-]/g, " ");
const score = (a: Asset, toks: string[]) => (toks.length && toks.every((t) => haystack(a).includes(t)) ? toks.length : 0);

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const WALLS: Record<string, Wall> = { front: "front", window: "front", windows: "front", door: "front", entrance: "front", back: "back", rear: "back", left: "left", right: "right" };
const WALLRE = /\b(?:to|against|along|by|near|at|beside|next to|on)\s+(?:the\s+)?(back|rear|front|left|right|window|windows|door|entrance)\b(?:\s+wall)?(?:\s+side)?/;

/** Pieces on the floor matching a spoken phrase, newest first. */
export function findPieces(placed: PlacedPiece[], phrase: string): PlacedPiece[] {
  const toks = tokens(phrase);
  if (!toks.length) return [];
  const exact = placed.filter((p) => score(p.asset, toks) > 0).reverse();
  if (exact.length) return exact;
  // a "counter" in a cafe kit is a display case, work table or bar run
  return toks.includes("counter") ? placed.filter((p) => /counter|display|work table|bar run|prep/.test(haystack(p.asset))).reverse() : [];
}

function describe(placed: PlacedPiece[], floor: Rect): string {
  if (!placed.length) return `The room is empty: ${floor.width.toFixed(1)} m by ${floor.depth.toFixed(1)} m of open floor (assumed rectangle), door and windows on the front wall.`;
  const by = new Map<string, number>();
  for (const p of placed) by.set(p.asset.name, (by.get(p.asset.name) ?? 0) + 1);
  const seats = placed.reduce((n, p) => n + seatsOf(p.asset), 0);
  return `${placed.length} pieces, ${seats} seats (estimated): ${[...by].map(([n, c]) => `${c} ${n}`).join(", ")}. Floor ${floor.width.toFixed(1)} m by ${floor.depth.toFixed(1)} m.`;
}

const faceIn: Record<Wall, Rot> = { back: 0, front: 180, left: 270, right: 90 };

/** Run one spoken command against the placed pieces. `changed` is false for questions and misses. */
export function runFioCommand(text: string, floor: Rect, placed: PlacedPiece[], assets: Asset[]): FioResult {
  const s = text.toLowerCase().replace(/[.!?]+$/g, "").trim();
  const keep = (note: string): FioResult => ({ placed, note, changed: false });
  if (!s) return keep("Tell me what to do with the room.");
  if (/^(undo|go back|revert)\b/.test(s)) return { placed, note: "Undid the last change.", changed: false, undo: true };
  if (/\b(what|which)\b.*\b(in|on)\b.*\b(room|floor|space|here)\b|\b(describe|list|inventory)\b|how many (seats|pieces)/.test(s)) return keep(describe(placed, floor));

  if (/^(clear|empty|wipe|strip|reset)\b.*\b(room|floor|space|scene|it|everything|out)\b|^(remove|delete|take out|get rid of)\s+(everything|all( of it)?|all (furniture|pieces))$/.test(s)) {
    return placed.length ? { placed: [], note: `Cleared the room: removed ${placed.length} piece${placed.length === 1 ? "" : "s"}. Undo brings them back.`, changed: true } : keep("The room is already empty.");
  }

  const move = /^(?:move|push|slide|shift|put|place|send)\s+(.+?)\s+(?:to|against|along|by|near|at|beside|next to|on)\s+(?:the\s+)?(back|rear|front|left|right|window|windows|door|entrance)\b/.exec(s);
  const adding = /^(put|place)\b/.test(s) && /^(a|an|\d+|one|two|three|four|five|six|seven|eight|ten|twelve)\b/.test(move?.[1] ?? "");
  if (move && !adding) {
    const wallWord = move[2];
    const wall = WALLS[wallWord];
    const found = findPieces(placed, move[1]);
    if (!found.length) return keep(`I do not see ${move[1]} in the room to move.`);
    const piece = found[0];
    const others = placed.filter((p) => p.id !== piece.id);
    const prefer = /door|entrance/.test(wallWord) ? doorX(floor) : undefined;
    const spot = spotAlong(floor, others, piece.asset, wall, prefer);
    if (!spot) return keep(`No free space along the ${wallWord} wall for the ${piece.asset.name}.`);
    const rot = faceIn[wall];
    const sz = sizeFor(piece.asset, rot);
    const x = wall === "right" ? floor.width - sz.w - 0.1 : wall === "left" ? 0.1 : spot.x;
    const y = wall === "front" ? floor.depth - sz.d - 0.1 : wall === "back" ? 0.1 : spot.y;
    const box = { x0: x, y0: y, x1: x + sz.w, y1: y + sz.d };
    if (toPlacements(others).some((q) => hit(box, q.box))) return keep(`No free space along the ${wallWord} wall for the ${piece.asset.name}.`);
    return { placed: placed.map((p) => (p.id === piece.id ? { ...p, rot, x, y } : p)), note: `Moved the ${piece.asset.name} to the ${wall} wall${wall === "front" ? " (windows side)" : ""}, facing into the room.`, changed: true };
  }

  const rot = /^(?:rotate|turn|spin|flip)\s+(.+)$/.exec(s);
  if (rot) {
    const found = findPieces(placed, rot[1]);
    if (!found.length) return keep(`I do not see ${rot[1]} in the room to rotate.`);
    const target = new Set(/\b(all|every)\b/.test(rot[1]) ? found.map((p) => p.id) : [found[0].id]);
    return { placed: placed.map((p) => (target.has(p.id) ? rotated(p) : p)), note: `Rotated ${target.size} ${found[0].asset.name} a quarter turn.`, changed: true };
  }

  const rm = /^(?:remove|delete|take out|get rid of|take away|drop)\s+(?:(\d+|one|two|three|four|five|six|seven|eight|ten|twelve)\s+)?(.+)$/.exec(s);
  if (rm) {
    const found = findPieces(placed, rm[2]);
    if (!found.length) return keep(`I do not see ${rm[2].replace(/^(the|a|an) /, "a ")} in the room.`);
    const all = /\b(all|every)\b/.test(s) || (!rm[1] && /s$/.test(rm[2].trim()) && found.length > 1);
    const n = all ? found.length : Math.min(found.length, rm[1] ? NUM[rm[1]] ?? Number(rm[1]) : 1);
    const gone = new Set(found.slice(0, n).map((p) => p.id));
    return { placed: placed.filter((p) => !gone.has(p.id)), note: `Removed ${gone.size} ${found[0].asset.name}${gone.size > 1 ? "s" : ""}. Undo brings ${gone.size > 1 ? "them" : "it"} back.`, changed: true };
  }

  const r = applyInstruction(s, floor, placed, assets);
  if (r.placed !== placed) return { placed: r.placed, note: r.note, changed: true };
  const add = /^(?:add|put|place|bring in|set up)\s+(?:(\d+|a|an|one|two|three|four|five|six|seven|eight|ten|twelve)\s+)?(.+?)(?:\s+(?:to|against|along|by|near|at|beside|next to|on)\s+the\s+.*)?$/.exec(s);
  if (add) {
    const toks = tokens(add[2]);
    const asset = assets.map((a) => ({ a, sc: score(a, toks) })).filter((x) => x.sc).sort((x, y) => y.sc - x.sc)[0]?.a;
    if (asset) {
      const n = Math.min(12, add[1] ? NUM[add[1]] ?? (Number(add[1]) || 1) : 1);
      let next = placed;
      const wallWord = WALLRE.exec(s)?.[1];
      let done = 0;
      for (let i = 0; i < n; i++) {
        const spot = wallWord ? spotAlong(floor, next, asset, WALLS[wallWord], /door|entrance/.test(wallWord) ? doorX(floor) : undefined) : null;
        const fallback = spot ?? findSpot(floor, next, asset);
        if (!fallback) break;
        next = [...next, { id: `${asset.assetId}#fio${Date.now().toString(36)}${i}`, asset, rot: 0, x: fallback.x, y: fallback.y }];
        done++;
      }
      if (done) return { placed: next, note: `Added ${done} ${asset.name}${done > 1 ? "s" : ""}${wallWord ? ` along the ${WALLS[wallWord]} wall` : ""}.`, changed: true };
      return keep(`No free room for ${asset.name}.`);
    }
  }
  return keep(r.note.startsWith("Did not understand") ? 'I did not catch that. Try "clear the room", "remove the stools", "move the espresso machine to the back wall", "rotate the counter", "add 6 two-tops along the windows", "put a bar by the door" or "what is in this room?".' : r.note);
}
