// POST /api/layout-cost (services/api/app/layout_cost_routes.py): cost of the pieces placed in the layout.
// Arithmetic is server-side; unpriced pieces come back in `unpriced` and are never shown as $0.
import type { Asset } from "./assets";

type Range = { low: number; high: number };
export type LayoutCostLine = { assetId: string; label: string; quantity: number; low: number; high: number; status: "observed" | "estimated"; source: string };
export type LayoutCost = {
  lines: LayoutCostLine[];
  unpriced: { assetId: string; quantity: number; reason: string }[];
  equipment: Range | null;
  fitout: (Range & { squareFeet: number; status: string; source: string }) | null;
  buildout: { p5: number; p50: number; p95: number } | null;
  pOverBudget: number | null;
  budget: number | null;
  totalStatus: string;
  notice: string;
};
export type LayoutCostItem = { assetId: string; quantity: number };

/** Group placed assets by catalogue id (the asset's priceRef, else its own id) so quantity drives the cost. */
export function layoutCostItems(items: Asset[]): LayoutCostItem[] {
  const counts = new Map<string, number>();
  for (const a of items) {
    const id = a.priceRef ?? a.assetId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([assetId, quantity]) => ({ assetId, quantity }));
}

/** Display name for a catalogue id, taken from the placed assets. */
export function nameFor(items: Asset[], id: string): string {
  return items.find((a) => (a.priceRef ?? a.assetId) === id)?.name ?? id;
}

export async function fetchLayoutCost(items: LayoutCostItem[], sqft: number | null, budget: number | null): Promise<LayoutCost> {
  const res = await fetch("/api/layout-cost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items, ...(sqft ? { sqft } : {}), ...(budget ? { budget } : {}) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as LayoutCost;
}

export const pct = (p: number | null | undefined) => (p === null || p === undefined ? "Unknown" : `${Math.round(p * 100)}%`);
