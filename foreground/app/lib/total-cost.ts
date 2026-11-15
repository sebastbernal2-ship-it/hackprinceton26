// GET /api/property/{id}/total-cost (services/api/app/total_cost_routes.py). All arithmetic happens server-side.

export type CostStatusTag = "observed" | "estimated" | "derived" | "assumption";
export type RentOption = { id: string; label: string; rate: number; low?: number | null; high?: number | null; status: CostStatusTag; source: string };
export type TotalPart = { id: string; label: string; basis: "one_time" | "monthly"; low: number; high: number; status: CostStatusTag; source: string };
type Range = { low: number; high: number };

export type TotalCost = {
  listingId: number;
  months: number;
  squareFeet: number | null;
  buildingSquareFeet: number | null;
  rentOptions: RentOption[];
  rentChosen: RentOption | null;
  parts: TotalPart[];
  excluded: { id: string; reason: string }[];
  oneTime: Range | null;
  monthly: Range | null;
  total: Range | null;
  totalStatus: string;
  notice: string;
};

export type TotalCostQuery = { sqft?: number | null; rent?: number | null; rentSource?: string | null; months?: number };

export async function fetchTotalCost(listingId: number, q: TotalCostQuery): Promise<TotalCost> {
  const p = new URLSearchParams();
  if (q.sqft) p.set("sqft", String(q.sqft));
  if (q.rent) p.set("rent", String(q.rent));
  else if (q.rentSource) p.set("rentSource", q.rentSource);
  p.set("months", String(q.months ?? 12));
  const res = await fetch(`/api/property/${listingId}/total-cost?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as TotalCost;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const range = (r: { low: number; high: number } | null | undefined) =>
  !r ? "Unknown" : Math.round(r.low) === Math.round(r.high) ? usd.format(r.low) : `${usd.format(r.low)} – ${usd.format(r.high)}`;
