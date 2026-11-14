export type CostStatus = "observed" | "estimated" | "unknown";
export type CostBasis = "one_time" | "monthly" | "annual";

export type CostLineItem = {
  itemId: string;
  label: string;
  category: "repair" | "maintenance" | "utility" | "equipment" | "buildout";
  quantity: number | null;
  unit: string;
  low: number | null;
  expected: number | null;
  high: number | null;
  currency: "USD";
  basis: CostBasis;
  status: CostStatus;
  source: string;
  asOf: string;
  rationale: string;
};

type Range = { low: number; expected: number; high: number };
export type CostsResponse = {
  lines: CostLineItem[];
  totals: { oneTime: Range; monthly: Range } | null;
  notice: string;
};

export async function fetchCosts(listingId: number): Promise<CostsResponse> {
  const response = await fetch(`/api/property/${listingId}/costs`);
  if (!response.ok) throw new Error(`costs ${response.status}`);
  return (await response.json()) as CostsResponse;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
/** Unknown (null) is never rendered as 0. */
export const money = (value: number | null): string => (value === null ? "Unknown" : usd.format(value));

export const BASIS_LABEL: Record<CostBasis, string> = { one_time: "one-time", monthly: "per month", annual: "per year" };

/** Number of lines whose price is unknown, so totals can say they exclude them. */
export const unknownCount = (lines: CostLineItem[]) => lines.filter((l) => l.status === "unknown" || l.expected === null).length;
