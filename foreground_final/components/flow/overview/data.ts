import type { CostLine, OwnerBrief, Range, SiteAnalysis, TimeToOpen } from "@/lib/engine/types";
import { usd, usdRange } from "@/lib/format";
import type { LayoutImpact } from "@/lib/layout";
import type { SiteRent } from "@/lib/ml/rent";
import type { Site, Tenancy } from "@/lib/sites/schema";

/** Pure view-models for the Overview tiles. Everything here is read off the site, the engine or the two models. */

export const WORDS: Record<CostLine["status"], string> = { needed: "you pay", saved: "already here", maybe: "ask the landlord" };

/** the lines that move the total most, by midpoint */
export function biggestLines(a: Pick<SiteAnalysis, "xray">, n = 3): CostLine[] {
  return [...a.xray.lines].sort((x, y) => y.range.mid - x.range.mid).slice(0, n);
}

/** weeks from signing to opening, from the engine's months (52 / 12 weeks a month) */
export function weeksToOpen(t: Pick<TimeToOpen, "months">): { low: number; high: number } {
  return { low: Math.round((t.months.low * 52) / 12), high: Math.round((t.months.high * 52) / 12) };
}

/** a horizontal scale for the money bar: where the range and the budget sit as 0..100 */
export function moneyScale(total: Range, budgetUsd: number | undefined) {
  const max = Math.max(total.high, budgetUsd ?? 0) * 1.08 || 1;
  const p = (n: number) => Math.max(0, Math.min(100, (n / max) * 100));
  return { low: p(total.low), high: p(total.high), mid: p(total.mid), budget: budgetUsd === undefined ? null : p(budgetUsd) };
}

/** the one sentence under the money bar, with the sign in words */
export function budgetWords(total: Range, budgetUsd: number | undefined): { tone: "needed" | "saved" | "maybe"; text: string } | null {
  if (budgetUsd === undefined) return null;
  const gap = total.mid - budgetUsd;
  if (total.low > budgetUsd) return { tone: "needed", text: `over budget by about ${usd(gap)}` };
  if (total.high <= budgetUsd) return { tone: "saved", text: `inside budget, about ${usd(-gap)} to spare` };
  return { tone: "maybe", text: `could land anywhere from ${usd(budgetUsd - total.low)} under budget to ${usd(total.high - budgetUsd)} over` };
}

export type RentView = {
  asking: number;
  low: number;
  high: number;
  /** 0..100 positions on the bar */
  pAsk: number;
  pLow: number;
  pHigh: number;
  band: SiteRent["band"];
  gapPerYr: number;
  uncertain: boolean;
};

export function rentView(rent: SiteRent): RentView {
  const asking = rent.askingNnnEquivPerSfYr;
  const lo = Math.min(asking, rent.intervalLowPerSfYr) * 0.85;
  const hi = Math.max(asking, rent.intervalHighPerSfYr) * 1.1;
  const p = (n: number) => ((n - lo) / (hi - lo)) * 100;
  return {
    asking,
    low: rent.intervalLowPerSfYr,
    high: rent.intervalHighPerSfYr,
    pAsk: p(asking),
    pLow: p(rent.intervalLowPerSfYr),
    pHigh: p(rent.intervalHighPerSfYr),
    band: rent.band,
    gapPerYr: rent.gapPerYr,
    uncertain: rent.basisUncertain,
  };
}

export type TenantBar = { name: string; food: boolean; sameSuite: boolean; outcome: Tenancy["outcome"]; years: number | null; widthPct: number; span: string };

const yearOf = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) : null);

/** the six most recent tenancies as bars sized by years in the space; the length is null when neither dates nor years are recorded */
export function tenantBars(history: Tenancy[], max = 6): { bars: TenantBar[]; more: number } {
  const sorted = [...history].sort((a, b) => (b.moveIn ?? "").localeCompare(a.moveIn ?? ""));
  const shown = sorted.slice(0, max);
  const longest = Math.max(1, ...shown.map((t) => t.years ?? 0));
  const bars = shown.map((t): TenantBar => {
    const from = yearOf(t.moveIn);
    const to = t.current ? "now" : yearOf(t.moveOut);
    return {
      name: t.name,
      food: t.isFood,
      sameSuite: t.sameSuite,
      outcome: t.outcome,
      years: t.years,
      widthPct: t.years == null ? 6 : Math.max(6, (t.years / longest) * 100),
      span: from == null ? "dates not recorded" : `${from} to ${to ?? "unknown"}`,
    };
  });
  return { bars, more: Math.max(0, sorted.length - shown.length) };
}

/** the Guide's first line in the Overview: verdict, biggest cost, biggest unknown, all from the same payload as the tiles */
export function overviewParagraph(site: Site, brief: OwnerBrief, impact: LayoutImpact, rent: SiteRent | null): string {
  const a = impact.analysis;
  const parts: string[] = [];
  const budget = budgetWords(impact.total, brief.budgetUsd);
  parts.push(`${site.address}: all-in about ${usdRange(impact.total)}${budget ? `, ${budget.text}` : ""}.`);
  const cost = [...a.xray.lines].filter((l) => l.status === "needed").sort((x, y) => y.range.mid - x.range.mid)[0];
  if (cost) parts.push(`Biggest cost is ${cost.label.toLowerCase()}, ${usdRange(cost.range)}.`);
  const unknown = [...a.xray.lines].filter((l) => l.status === "maybe").sort((x, y) => y.range.high - x.range.high)[0];
  if (unknown) parts.push(`Biggest unknown is ${unknown.label.toLowerCase()}, up to ${usd(unknown.range.high)}: ask the landlord.`);
  if (rent && !rent.basisUncertain && rent.band !== "in line") parts.push(`The asking rent is ${rent.band} for this block.`);
  return parts.join(" ");
}
