import type { FindingKind } from "@/lib/sites/schema";

/**
 * Engine contract. Pure functions over a Site + OwnerBrief. No network, no LLM.
 * Every number the UI shows comes from here and carries a source or "estimate" label.
 */

export type Concept = "quick-service" | "fast-casual" | "full-service" | "cafe" | "bar";

export type OwnerBrief = {
  concept: Concept;
  cuisine?: string;
  /** seats the owner wants; the engine also estimates what the space fits */
  seats?: number;
  /** total build-out budget the owner can spend */
  budgetUsd?: number;
  city?: "Houston" | "Los Angeles";
  mustHaves?: string[];
};

export const DEFAULT_BRIEF: OwnerBrief = { concept: "fast-casual", seats: 40, budgetUsd: 250_000 };

export type Range = { low: number; mid: number; high: number };

export type Cited = { label: string; source: string; url?: string };

export type CostLine = {
  id: string;
  label: string;
  kind: FindingKind | "base-buildout" | "ffe" | "permits" | "contingency";
  /** needed = owner pays; saved = existing infrastructure avoids it; maybe = unknown, shown as risk */
  status: "needed" | "saved" | "maybe";
  range: Range;
  reason: string;
  source: string;
  findingId?: string;
};

export type XRay = {
  lines: CostLine[];
  /** sum of needed lines + share of maybe lines + contingency */
  total: Range;
  /** what existing infrastructure saves versus a bare shell */
  saved: Range;
  overBudget: boolean | null;
};

export type SeatFit = { seats: number; basis: string };

export type Occupancy = {
  annualUsd: Range;
  /** estimated taxes+insurance+CAM per SF/yr added to NNN rent */
  extrasPerSfYr: number;
  basis: string;
};

export type Breakeven = {
  avgCheckUsd: number;
  salesNeededUsd: number;
  coversPerDay: number;
  turnsPerDay: number;
  verdict: "comfortable" | "stretch" | "unlikely";
  assumptions: Cited[];
};

export type ScenarioName = "slow" | "base" | "strong";

export type ScenarioYear = { year: 1 | 2 | 3; salesUsd: number; profitUsd: number; cumulativeCashUsd: number };

export type Scenario = {
  name: ScenarioName;
  salesPerSfYr: number;
  annualSalesUsd: number;
  occupancySharePct: number;
  annualProfitUsd: number;
  /** years to pay back build-out midpoint; null when profit <= 0 */
  paybackYears: number | null;
  years: ScenarioYear[];
};

export type Scenarios = {
  scenarios: Record<ScenarioName, Scenario>;
  assumptions: Cited[];
  /** plain-language read of the three, e.g. "Works only if sales reach the base case" */
  verdict: string;
};

export type TrendSignal = {
  label: string;
  direction: "up" | "flat" | "down";
  detail: string;
  source: string;
};

export type BlockTrend = {
  rating: "tailwind" | "neutral" | "headwind";
  /** -1 (headwind) .. 1 (tailwind) */
  score: number;
  signals: TrendSignal[];
};

export type Graveyard = {
  foodTenants: number;
  closedHere: number;
  sameSuiteFailures: number;
  medianYears: number | null;
  summary: string;
};

export type TimeToOpen = { months: Range; deadRentUsd: Range; basis: string };

export type SiteScore = { score: number; reasons: string[]; flags: string[] };

export type SiteAnalysis = {
  siteId: string;
  brief: OwnerBrief;
  seats: SeatFit;
  xray: XRay;
  occupancy: Occupancy;
  breakeven: Breakeven;
  scenarios: Scenarios;
  trend: BlockTrend;
  graveyard: Graveyard;
  timeToOpen: TimeToOpen;
  score: SiteScore;
};
