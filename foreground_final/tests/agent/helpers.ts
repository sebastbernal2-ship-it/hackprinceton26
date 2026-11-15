import type { OwnerBrief, Range, SiteAnalysis } from "@/lib/engine/types";
import type { Site } from "@/lib/sites/schema";

const r = (low: number, high: number): Range => ({ low, mid: (low + high) / 2, high });

/**
 * Small deterministic stand-in for analyzeSite so agent tests do not depend on the engine's numbers.
 * A present hood saves money, an absent or unknown one costs it; rent drives break-even.
 */
export function fakeAnalysis(site: Site, brief: OwnerBrief): SiteAnalysis {
  const hood = site.findings.find((f) => f.kind === "hood")?.status ?? "unknown";
  const hoodLine = hood === "present" ? r(0, 5_000) : r(40_000, 90_000);
  const base = r(site.space.sf * 20, site.space.sf * 40);
  const total = r(base.low + hoodLine.low, base.high + hoodLine.high);
  const seats = Math.min(brief.seats ?? 40, Math.floor(site.space.sf / 25));
  const occupancy = (site.space.rentPerSfYr ?? 30) * site.space.sf * 1.25;
  const salesNeeded = occupancy / 0.08;
  const coversPerDay = salesNeeded / 16 / 360;
  const turns = coversPerDay / Math.max(seats, 1);
  const sameSuite = site.tenantHistory.filter((t) => t.isFood && t.sameSuite && !t.current).length;
  const food = site.tenantHistory.filter((t) => t.isFood);
  const scenario = (name: "slow" | "base" | "strong", salesPerSf: number) => {
    const sales = salesPerSf * site.space.sf;
    const profit = sales * 0.3 - occupancy;
    return {
      name, salesPerSfYr: salesPerSf, annualSalesUsd: sales, occupancySharePct: (occupancy / sales) * 100,
      annualProfitUsd: profit, paybackYears: profit > 0 ? total.mid / profit : null,
      years: ([1, 2, 3] as const).map((year) => ({ year, salesUsd: sales, profitUsd: profit, cumulativeCashUsd: profit * year - total.mid })),
    };
  };
  const verdict = turns < 2 ? "comfortable" : turns < 3.5 ? "stretch" : "unlikely";
  const overBudget = brief.budgetUsd ? total.mid > brief.budgetUsd : null;
  return {
    siteId: site.id,
    brief,
    seats: { seats, basis: "25 SF per seat (test)" },
    xray: {
      lines: [
        { id: "base", label: "Base build-out", kind: "base-buildout", status: "needed", range: base, reason: "per SF", source: "estimate" },
        { id: "hood", label: "Type 1 hood", kind: "hood", status: hood === "present" ? "saved" : hood === "absent" ? "needed" : "maybe", range: hoodLine, reason: `hood ${hood}`, source: "estimate" },
      ],
      total,
      saved: hood === "present" ? r(40_000, 90_000) : r(0, 0),
      overBudget,
    },
    occupancy: { annualUsd: r(occupancy * 0.95, occupancy * 1.05), extrasPerSfYr: 7, basis: "NNN + extras (test)" },
    breakeven: { avgCheckUsd: 16, salesNeededUsd: salesNeeded, coversPerDay, turnsPerDay: turns, verdict, assumptions: [] },
    scenarios: {
      scenarios: { slow: scenario("slow", 250), base: scenario("base", 400), strong: scenario("strong", 550) },
      assumptions: [],
      verdict: "Works only if sales reach the base case",
    },
    trend: { rating: "neutral", score: 0, signals: [{ label: "Food openings", direction: "flat", detail: "test", source: "test" }] },
    graveyard: {
      foodTenants: food.length, closedHere: food.filter((t) => t.outcome === "closed").length, sameSuiteFailures: sameSuite,
      medianYears: 4, summary: `${food.length} food tenants at this address`,
    },
    timeToOpen: { months: r(3, 6), deadRentUsd: r(occupancy / 4, occupancy / 2), basis: "test" },
    score: {
      score: Math.max(0, Math.min(100, 80 - turns * 10 - (overBudget ? 25 : 0) - sameSuite * 10)),
      reasons: ["test reason"],
      flags: overBudget ? ["over budget"] : [],
    },
  };
}
