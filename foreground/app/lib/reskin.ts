import type { CostLineItem } from "./costs";

export type Concept = { id: string; name: string; equipmentCount: number; status: string };
export type Swatch = { name: string; hex: string };
export type PlacedEquipment = { assetId: string; name: string; dimsStatus: string; x: number; y: number; placement?: string };
export type Palette = { wall: string; floor: string; ceiling: string; accent: string };
export type Materials = {
  from: Record<"wall" | "floor" | "ceiling" | "accent", Swatch>;
  to: Record<"wall" | "floor" | "ceiling" | "accent", Swatch>;
  glbPalette: Palette;
  decor: string[];
  signage: string;
  note: string;
};
export type Feasibility = { id: string; topic: string; status: string; from: string; to: string; basis: string; labelledAs: string };
export type ReskinResult = {
  fromConcept: string;
  toConcept: string;
  seats: number | null;
  seatsAssumed: boolean;
  syntheticSource?: boolean;
  layoutNote?: string;
  removed: PlacedEquipment[];
  added: PlacedEquipment[];
  unplaced: unknown[];
  placements: { assetId: string; x: number; y: number; rot: number }[];
  adjacency: { a: string; b: string; why: string; basis: string; result: string; gapM?: number | null }[];
  costDelta: { lines: (CostLineItem & { source: string })[]; totals: { low: number | null; expected: number | null; high: number | null }; totalsStatus: string };
  feasibility: Feasibility[];
  materials: Materials;
  notice: string;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json" } });
  } catch {
    throw new Error("The API is unreachable.");
  }
  if (!r.ok) {
    const detail = await r.json().then((j) => (typeof j?.detail === "string" ? j.detail : ""), () => "");
    throw new Error(`The API answered ${r.status} for ${path}${detail ? `: ${detail}` : ""}.`);
  }
  return (await r.json()) as T;
}

export const fetchConcepts = () => call<Concept[]>("/concepts");

export const postReskin = (listingId: number, fromConcept: string, toConcept: string, seats?: number) =>
  call<ReskinResult>("/reskin", { method: "POST", body: JSON.stringify({ listingId, fromConcept, toConcept, ...(seats ? { seats } : {}) }) });

/** Rows with an unknown price are excluded from totals and never shown as 0. */
export function costSummary(r: ReskinResult["costDelta"]) {
  const known = r.lines.filter((l) => l.expected !== null).length;
  return { known, unknown: r.lines.length - known, totalKnown: r.totals.expected !== null };
}

export type Box = { id: string; x: number; y: number; w: number; d: number; rot: number; kind: "kept" | "added"; dimsKnown: boolean };

/** Boxes in metres for the top-down preview. Missing dims stay flagged as unknown rather than guessed. */
export function layoutBoxes(r: ReskinResult, dims: Record<string, { w: number; d: number }>): Box[] {
  const added = new Set(r.added.map((a) => a.assetId));
  return r.placements.map((p) => {
    const dm = dims[p.assetId];
    return { id: p.assetId, x: p.x, y: p.y, w: dm?.w ?? 0.8, d: dm?.d ?? 0.8, rot: p.rot, kind: added.has(p.assetId) ? "added" : "kept", dimsKnown: !!dm };
  });
}

export function boundsOf(boxes: Box[]) {
  if (boxes.length === 0) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  const ext = (b: Box) => (b.rot % 180 === 0 ? [b.w, b.d] : [b.d, b.w]);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + ext(b)[0]));
  const y1 = Math.max(...boxes.map((b) => b.y + ext(b)[1]));
  return { x0, y0, x1, y1 };
}
