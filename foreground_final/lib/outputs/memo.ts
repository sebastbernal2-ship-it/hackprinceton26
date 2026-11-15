import type { OwnerBrief, Range, ScenarioName, SiteAnalysis } from "@/lib/engine/types";
import { fixText, floorLabel, num, serviceLabel, usd } from "@/lib/format";
import type { Site } from "@/lib/sites/schema";
import type { Ask } from "./ask-list";

/** Deal memo data. Pure: the page renders it, nothing here formats markup. */

export type MemoFact = { label: string; value: string; source: string };

export type MemoScenario = {
  name: ScenarioName;
  annualSalesUsd: number;
  annualProfitUsd: number;
  paybackYears: number | null;
  threeYearCashUsd: number;
};

export type DealMemo = {
  title: string;
  subtitle: string;
  facts: MemoFact[];
  xray: {
    total: Range;
    budgetUsd: number | null;
    overBudget: boolean | null;
    /** total midpoint minus budget; null without a budget */
    gapUsd: number | null;
    savedByExisting: Range;
    needed: { label: string; range: Range }[];
    maybe: { label: string; range: Range }[];
    saved: { label: string; range: Range }[];
  };
  breakeven: {
    verdict: string;
    salesNeededUsd: number;
    coversPerDay: number;
    turnsPerDay: number;
    avgCheckUsd: number;
    occupancyUsd: number;
  };
  scenarios: { rows: MemoScenario[]; verdict: string };
  risks: string[];
  asks: Ask[];
  sources: string[];
};

export function buildMemo(site: Site, analysis: SiteAnalysis, asks: Ask[], brief: OwnerBrief = analysis.brief): DealMemo {
  const s = site.space;
  const x = analysis.xray;
  const budget = brief.budgetUsd ?? null;
  const be = analysis.breakeven;
  const byStatus = (status: "needed" | "maybe" | "saved") =>
    x.lines.filter((l) => l.status === status).map((l) => ({ label: l.label, range: l.range }));

  const facts: MemoFact[] = [
    { label: "Address", value: `${site.address}, ${site.city}, ${site.state}${site.postcode ? ` ${site.postcode}` : ""}`, source: "CoStar listing" },
    { label: "Suite", value: [s.suite ? `Suite ${s.suite}` : null, floorLabel(s.floor)].filter(Boolean).join(", ") || "Not given", source: "CoStar listing" },
    { label: "Space", value: `${num(s.sf)} SF`, source: "CoStar listing" },
    {
      label: "Asking rent",
      value: s.rentPerSfYr != null ? `$${num(s.rentPerSfYr, 2)}/SF/yr ${serviceLabel(s.serviceType) ?? ""}`.trim() : "Not quoted",
      source: "CoStar listing",
    },
    { label: "Occupancy cost", value: `${usd(analysis.occupancy.annualUsd.mid)} a year`, source: `Estimate: ${analysis.occupancy.basis}` },
    { label: "Seats that fit", value: `${analysis.seats.seats}`, source: `Estimate: ${analysis.seats.basis}` },
    { label: "Time to open", value: `${analysis.timeToOpen.months.low}-${analysis.timeToOpen.months.high} months`, source: `Estimate: ${analysis.timeToOpen.basis}` },
  ];

  const risks: string[] = [];
  if (x.overBudget === true && budget !== null) risks.push(`Opening cost midpoint ${usd(x.total.mid)} is ${usd(x.total.mid - budget)} over your ${usd(budget)} budget.`);
  if (be.verdict !== "comfortable") risks.push(`Break-even needs ${num(be.coversPerDay)} covers a day (${num(be.turnsPerDay, 1)} turns per seat): ${be.verdict}.`);
  const maybes = byStatus("maybe");
  if (maybes.length) risks.push(`Not confirmed: ${maybes.map((m) => m.label.toLowerCase()).join(", ")}.`);
  if (analysis.graveyard.sameSuiteFailures > 0) {
    const n = analysis.graveyard.sameSuiteFailures;
    risks.push(`${n} food tenant${n === 1 ? "" : "s"} left this suite. ${analysis.graveyard.summary}`);
  }
  if (analysis.trend.rating === "headwind") risks.push("The block's trend signals read as a headwind.");
  for (const f of analysis.score.flags) if (!risks.includes(f)) risks.push(f);

  const sources = [...site.sources, ...site.neighborhood.sources].map((x2) => x2.label);
  sources.push("Foreground cost benchmarks (data/benchmarks.json)");
  if (site.matterport) sources.push("Matterport scan");
  if (site.aerial) sources.push("Vexcel aerial imagery");

  const names: ScenarioName[] = ["slow", "base", "strong"];
  return {
    title: `Deal memo: ${site.address}${s.suite ? `, Suite ${s.suite}` : ""}`,
    subtitle: `${brief.concept.replace("-", " ")}, ${brief.seats ?? analysis.seats.seats} seats${budget !== null ? `, ${usd(budget)} budget` : ""}`,
    facts,
    xray: {
      total: x.total,
      budgetUsd: budget,
      overBudget: x.overBudget,
      gapUsd: budget === null ? null : x.total.mid - budget,
      savedByExisting: x.saved,
      needed: byStatus("needed"),
      maybe: maybes,
      saved: byStatus("saved"),
    },
    breakeven: {
      verdict: be.verdict,
      salesNeededUsd: be.salesNeededUsd,
      coversPerDay: be.coversPerDay,
      turnsPerDay: be.turnsPerDay,
      avgCheckUsd: be.avgCheckUsd,
      occupancyUsd: analysis.occupancy.annualUsd.mid,
    },
    scenarios: {
      rows: names.map((n) => {
        const sc = analysis.scenarios.scenarios[n];
        return {
          name: n,
          annualSalesUsd: sc.annualSalesUsd,
          annualProfitUsd: sc.annualProfitUsd,
          paybackYears: sc.paybackYears,
          threeYearCashUsd: sc.years[sc.years.length - 1]?.cumulativeCashUsd ?? 0,
        };
      }),
      verdict: fixText(analysis.scenarios.verdict),
    },
    risks,
    asks,
    sources,
  };
}
