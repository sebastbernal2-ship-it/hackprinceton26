import { CATALOG, type CatalogItem, money } from "./layout-catalog";

export type RoomMeasure = {
  id: string;
  label: string;
  width: number;
  depth: number;
  area: number;
  /** floor still free after the objects standing in it (m²) */
  freeArea?: number;
  /** "open plan: wall 6 removed", "split by new wall 11" */
  note?: string;
};

export type PlacedFootprint = {
  item: string;
  room: string;
  width: number;
  depth: number;
};

const CLEARANCE = 0.6;

export function summarizeRooms(rooms: { id: string; label: string; w: number; d: number; absorbed?: boolean }[]): RoomMeasure[] {
  return rooms
    .filter((room) => !room.absorbed && room.w > 0.4 && room.d > 0.4)
    .map((room) => ({
      id: room.id,
      label: room.label,
      width: round(room.w),
      depth: round(room.d),
      area: round(room.w * room.d),
    }));
}

export function findRoom(rooms: RoomMeasure[], name: string): RoomMeasure | null {
  const needle = name.toLowerCase();
  const hits = rooms.filter((room) => labelsMatch(room.label, needle));
  return hits.sort((left, right) => right.area - left.area)[0] ?? null;
}

export function pieceFits(room: RoomMeasure, item: CatalogItem, already: PlacedFootprint[]): { ok: true } | { ok: false; reply: string } {
  const used = already
    .filter((piece) => labelsMatch(piece.room, room.label))
    .reduce((sum, piece) => sum + piece.width + CLEARANCE, 0);
  const freeWidth = room.width - CLEARANCE - used;
  const freeDepth = room.depth - CLEARANCE;
  const along =
    (item.width <= freeWidth && item.depth <= freeDepth) || (item.depth <= freeWidth && item.width <= freeDepth);
  if (along) return { ok: true };
  return {
    ok: false,
    reply: `A ${item.label.toLowerCase()} is ${item.width} m by ${item.depth} m. ${room.label} is ${room.width.toFixed(1)} m by ${room.depth.toFixed(1)} m, so it does not fit.`,
  };
}

export function catalogPrompt(): string {
  return CATALOG.map((item) => `${item.id}: ${item.label}, ${item.width} m by ${item.depth} m, ${money(item.price)}`).join("\n");
}

export function labelsMatch(label: string, query: string) {
  const left = label.toLowerCase();
  const right = query.toLowerCase();
  if (left.includes(right) || right.includes(left)) return true;
  if (/bath|restroom/.test(left) && /bath|restroom/.test(right)) return true;
  if (/dining|living/.test(left) && /dining|living/.test(right)) return true;
  return false;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
