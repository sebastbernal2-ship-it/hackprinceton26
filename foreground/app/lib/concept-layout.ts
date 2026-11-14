export const SQFT_TO_M2 = 0.092903;
/** Assumed aspect ratio of the unknown floor. A guess: real walls are not known without a scan. */
const ASPECT = 1.5;

export type Footprint = { width: number; depth: number };

/** A rectangle with the listing's area. ESTIMATED: the real outline, columns and doors are unknown. */
export function conceptFootprint(squareFeet: number): Footprint | null {
  if (!Number.isFinite(squareFeet) || squareFeet <= 0) return null;
  const area = squareFeet * SQFT_TO_M2;
  const depth = Math.sqrt(area / ASPECT);
  return { width: area / depth, depth };
}
