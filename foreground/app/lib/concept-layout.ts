import type { CatalogItem } from "./layout-catalog";

export const SQFT_TO_M2 = 0.092903;
const GAP = 0.4;
/** Assumed aspect ratio of the unknown floor. A guess: real walls are not known without a scan. */
const ASPECT = 1.5;

export type Footprint = { width: number; depth: number };
export type Placed = { key: string; item: CatalogItem; x: number; z: number; w: number; d: number };
export type ConceptResult = { placed: Placed[]; unplaced: CatalogItem[]; usedM2: number; floorM2: number };

/** A rectangle with the listing's area. ESTIMATED: the real outline, columns and doors are unknown. */
export function conceptFootprint(squareFeet: number): Footprint | null {
  if (!Number.isFinite(squareFeet) || squareFeet <= 0) return null;
  const area = squareFeet * SQFT_TO_M2;
  const depth = Math.sqrt(area / ASPECT);
  return { width: area / depth, depth };
}

/** Shelf packing, left to right then down. A piece that does not fit is reported, never forced. */
export function packConcept(footprint: Footprint, items: CatalogItem[]): ConceptResult {
  const placed: Placed[] = [];
  const unplaced: CatalogItem[] = [];
  const margin = 0.5;
  let x = margin;
  let z = margin;
  let rowDepth = 0;
  items.forEach((item, index) => {
    if (x + item.width > footprint.width - margin + 1e-9) {
      x = margin;
      z += rowDepth + GAP;
      rowDepth = 0;
    }
    if (z + item.depth > footprint.depth - margin + 1e-9 || item.width > footprint.width - 2 * margin) {
      unplaced.push(item);
      return;
    }
    placed.push({ key: `${item.id}-${index}`, item, x, z, w: item.width, d: item.depth });
    x += item.width + GAP;
    rowDepth = Math.max(rowDepth, item.depth);
  });
  const usedM2 = placed.reduce((sum, piece) => sum + piece.w * piece.d, 0);
  return { placed, unplaced, usedM2, floorM2: footprint.width * footprint.depth };
}
