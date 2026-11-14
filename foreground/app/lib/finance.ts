// Finance scenario (POST /api/finance/simulate, GET /api/finance/ledger/{runId}). Scenario analysis, not a forecast.
export type Pct = { p5: number; p50: number; p95: number };
export type SimulateRequest = { listingId?: number; seats: number; monthlyRentAssumption?: number; presenceIndex?: number; loan?: "sba" | "conventional"; equity?: number };
export type Simulation =
  | { status: "blocked"; label: string; unknownInputs: string[]; note: string; notice?: string }
  | {
      status: "simulated"; label: string; notice: string; runId?: string; nDraws: number; months: number;
      loan: { name?: string; principal: number; monthlyPayment: number };
      pCashShortfall: number;
      breakEven: { definition: string; pReached: number; monthDist: Pct | null; histogram: Record<string, number> };
      dscr: Partial<Pct> & { definition: string; "pBelow1.25": number; "pBelow1.0": number };
      minCash: Pct; endCash: Pct;
      monthly: Record<string, number[]>;
      monthlyBands?: Record<string, { p10: number[]; p50: number[]; p90: number[] }>;
      assumptions: Record<string, unknown>;
      limits: string[];
      ledger?: { backend: string; tag: string; counts: Record<string, number> };
    };
export type LedgerPage = { runId: string; backend: string; table: string; total: number; notice: string; records: Record<string, unknown>[] };

export async function simulate(req: SimulateRequest): Promise<Simulation | null> {
  try {
    const r = await fetch("/api/finance/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
    return r.ok ? ((await r.json()) as Simulation) : null;
  } catch {
    return null;
  }
}
export async function fetchLedger(runId: string, table: string, limit = 12): Promise<LedgerPage | null> {
  try {
    const r = await fetch(`/api/finance/ledger/${runId}?table=${table}&limit=${limit}`);
    return r.ok ? ((await r.json()) as LedgerPage) : null;
  } catch {
    return null;
  }
}

export const usd = (n: number | null | undefined) => (n == null ? "Cannot say" : `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
export const pct = (x: number | null | undefined) => (x == null ? "Cannot say" : `${Math.round(x * 100)}%`);

/** Chart series for the 36 months. The API returns the per-month median (P50) of each line; the P10/P90 bands are drawn only when the API supplies them. Never invented. */
export function cashSeries(sim: Extract<Simulation, { status: "simulated" }>) {
  const mid = sim.monthly.cash ?? [];
  const b = sim.monthlyBands?.cash;
  return { p50: mid, p10: b?.p10 ?? null, p90: b?.p90 ?? null };
}

/** SVG polyline/area path helpers (pure, tested). */
export function scale(values: number[], lo: number, hi: number, size: number, invert = false): number[] {
  const span = hi - lo || 1;
  return values.map((v) => (invert ? size - ((v - lo) / span) * size : ((v - lo) / span) * size));
}
export function bandPath(xs: number[], upper: number[], lower: number[]): string {
  if (!xs.length) return "";
  const top = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${upper[i].toFixed(1)}`);
  const bot = xs.map((x, i) => `L${x.toFixed(1)} ${lower[i].toFixed(1)}`).reverse();
  return `${top.join("")}${bot.join("")}Z`;
}
