/** The cost estimate for one space and brief (POST /api/sites/[id]/report). */
export type CostReport = {
  siteId: string;
  concept: string;
  seats: number;
  lines: { id: string; label: string; status: "needed" | "saved" | "maybe"; low: number; high: number; reason: string; source: string }[];
  total: { low: number; mid: number; high: number };
  saved: { low: number; mid: number; high: number };
  overBudget: boolean | null;
  budgetUsd: number | null;
  occupancyPerMonth: { low: number; high: number };
  fairRent: { band: string; lowPerSfYr: number; highPerSfYr: number; askingPerSfYr: number | null } | null;
  breakeven: { coversPerDay: number; turnsPerDay: number; avgCheckUsd: number; verdict: string };
  scenarios: { name: "slow" | "base" | "strong"; annualProfitUsd: number; paybackYears: number | null }[];
  outlook: string;
  timeToOpenMonths: { low: number; high: number };
  history: string;
  score: number;
  reasons: string[];
  flags: string[];
};
