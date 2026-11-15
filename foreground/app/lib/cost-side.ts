// Live cost side panel math (DEMO). Ported in spirit from the older Foreground engine (xray, scenarios, breakeven):
// hidden-cost X-ray, 3-year slow/base/strong outlook, break-even turns. Every constant below is an ESTIMATED
// benchmark (named source), never an observation. Build-out dollars come from /api/layout-cost, rent and utilities
// from /api/property/{id}/total-cost; this file only combines them. Scenario analysis, not a forecast.
import { seatsOf } from "./planner";
import type { Asset } from "./assets";
import type { Exchange } from "./next-question";

export type Range = { low: number; high: number };
export type XrayLine = { id: string; label: string; range: Range; why: string; source: string };

/** Share of an unknown (maybe) line counted in the total; Foreground estimate from the older engine. */
export const MAYBE_SHARE = 0.5;

/** Owner's build-out budget as stated in the intake brief ("budget is under $250,000"), or null when none is stated. */
export function briefBudget(brief: Exchange[]): number | null {
  const said = brief.map((b) => b.answer).join(" ");
  const m = /budget[^.$]{0,40}\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\b/i.exec(said);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "")) * (m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1);
  return n > 0 ? n : null;
}

const has = (kit: Asset[], re: RegExp) => kit.some((a) => re.test(a.assetId));

/**
 * Systems a scan cannot prove are in place. Which ones apply follows the placed pieces (cooking gear needs a hood, sinks a grease
 * line, any powered equipment an electrical check), so the X-ray changes as pieces are placed or removed.
 * Ranges: Block Renovation, Projul, Pulse RevOps and Foreground estimates, as in the older app's benchmarks.
 */
export function xrayLines(kit: Asset[]): XrayLine[] {
  const out: XrayLine[] = [];
  if (has(kit, /oven|range|fryer|griddle|grill/)) out.push({ id: "hood", label: "Kitchen hood and ventilation", range: { low: 20000, high: 60000 }, why: "Cooking gear is placed. Hood, duct and fire suppression are not visible in a scan.", source: "Block Renovation" });
  if (has(kit, /sink|dishwash|gelato/)) out.push({ id: "grease", label: "Grease interceptor", range: { low: 5000, high: 8000 }, why: "A sink is placed. Point-of-use interceptor, lower part of the published range.", source: "Foreground estimate" });
  if (kit.length > 0) out.push({ id: "electrical", label: "Electrical service upgrade", range: { low: 10000, high: 40000 }, why: "Powered equipment is placed. Panel capacity is not visible in a scan.", source: "Block Renovation" });
  out.push({ id: "ada", label: "Accessible restroom and path", range: { low: 5000, high: 25000 }, why: "Cannot be confirmed from the scan. Ask the landlord.", source: "Pulse RevOps" });
  out.push({ id: "permits", label: "Permits and plan review", range: { low: 3000, high: 20000 }, why: "Always needed.", source: "Block Renovation" });
  return out;
}

/** Unknown systems counted at MAYBE_SHARE; permits are certain so they count in full. */
export function xrayTotal(lines: XrayLine[]): Range {
  const sum = (k: "low" | "high") => lines.reduce((s, l) => s + l.range[k] * (l.id === "permits" ? 1 : MAYBE_SHARE), 0);
  return { low: Math.round(sum("low")), high: Math.round(sum("high")) };
}

export const seatTotal = (kit: Asset[]) => kit.reduce((s, a) => s + seatsOf(a), 0);

export type Case = "slow" | "base" | "strong";
export const CASES: Case[] = ["slow", "base", "strong"];
/** Covers per seat per day. Foreground estimates for a cafe: break-even is comfortable up to 3, a stretch up to 5. */
export const TURNS: Record<Case, number> = { slow: 2.5, base: 3.5, strong: 5 };
export const AVG_CHECK = 9; // USD per cover, cafe (Foreground estimate)
export const OPEN_DAYS = 360;
/** Share of sales left after food 30%, labor 31%, other 23% (older engine benchmarks). */
export const MARGIN = 1 - 0.3 - 0.31 - 0.23;
export const YEAR1_RAMP = 0.8;

export type Outlook = {
  seats: number;
  buildout: number;
  occupancy: number;
  cases: Record<Case, { sales: number; profit: [number, number, number]; cash: [number, number, number, number]; paybackMonths: number | null }>;
  breakEvenTurns: number | null;
  verdict: "comfortable" | "stretch" | "unlikely" | "unknown";
  reason: string;
};

/**
 * profit = sales x margin - occupancy (rent plus utilities, fixed); sales = seats x turns x check x open days.
 * Cumulative cash starts at minus the build-out; year 1 runs at 80% of steady sales. Payback interpolates and continues past year 3.
 */
export function outlook(seats: number, buildout: number, occupancyPerYear: number): Outlook {
  const cases = {} as Outlook["cases"];
  for (const c of CASES) {
    const sales = seats * TURNS[c] * AVG_CHECK * OPEN_DAYS;
    const steady = sales * MARGIN - occupancyPerYear;
    const y1 = sales * YEAR1_RAMP * MARGIN - occupancyPerYear;
    const profit: [number, number, number] = [y1, steady, steady];
    const cash: [number, number, number, number] = [-buildout, -buildout + y1, -buildout + y1 + steady, -buildout + y1 + 2 * steady];
    let paybackMonths: number | null = null;
    if (steady > 0) paybackMonths = Math.round((y1 >= buildout ? (y1 > 0 ? buildout / y1 : 0) : 1 + (buildout - y1) / steady) * 12);
    cases[c] = { sales, profit, cash, paybackMonths };
  }
  const covers = occupancyPerYear / MARGIN / AVG_CHECK / OPEN_DAYS;
  const breakEvenTurns = seats > 0 ? covers / seats : null;
  const verdict = breakEvenTurns === null ? "unknown" : breakEvenTurns <= 3 ? "comfortable" : breakEvenTurns <= 5 ? "stretch" : "unlikely";
  const reason = seats > 0 ? `${seats} seats placed.` : "No seats placed yet: there is nothing to sell from.";
  return { seats, buildout, occupancy: occupancyPerYear, cases, breakEvenTurns, verdict, reason };
}

/** Where a series crosses zero, as a fractional index, or null. */
export function zeroCrossing(series: number[]): number | null {
  for (let i = 0; i < series.length - 1; i++) {
    if (series[i] < 0 !== series[i + 1] < 0) return i + series[i] / (series[i] - series[i + 1]);
  }
  return null;
}

/** Budget status of the all-in build-out (placed pieces + fit-out + hidden systems at their counted share). */
export function budgetStatus(allIn: Range, budget: number | null): { tone: "under" | "tight" | "over" | "unknown"; text: string } {
  if (!budget) return { tone: "unknown", text: "No budget in your brief. Enter one to compare." };
  if (allIn.low > budget) return { tone: "over", text: "Over budget even at the low end." };
  if (allIn.high <= budget) return { tone: "under", text: "Within budget even at the high end." };
  return { tone: "tight", text: "The budget falls inside the range: it depends on what the hidden systems cost." };
}
