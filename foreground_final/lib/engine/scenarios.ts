import { benchmarks, cite, usd } from "./benchmarks";
import type { Breakeven, Concept, Range, Scenario, ScenarioName, ScenarioYear, Scenarios } from "./types";

export type CostShares = { food: number; labor: number; other: number };

export type ScenariosInput = {
  /** leased area the sales-per-SF band applies to */
  sf: number;
  annualOccupancyUsd: number;
  /** build-out to pay back (X-Ray total midpoint) */
  buildoutUsd: number;
  concept: Concept;
  /** sales per SF per year for slow/base/strong; defaults to the concept's benchmark band */
  band?: Range;
  /** defaults: food 30%, labor 31%, other 23% of sales */
  shares?: CostShares;
  /** share of steady-state sales reached in year 1; default 0.8 */
  year1Ramp?: number;
};

const CASES: [ScenarioName, keyof Range][] = [
  ["slow", "low"],
  ["base", "mid"],
  ["strong", "high"],
];

/**
 * Three-year slow/base/strong outlook. Never a promise: each case is a point in the benchmark band.
 *
 *   sales  = sales per SF x SF
 *   profit = sales x (1 - food - labor - other) - occupancy     (occupancy is fixed; the rest scale with sales)
 *
 * Yearly rows: year 1 runs at 80% of steady-state sales while the restaurant ramps up
 * (benchmarks.year1Ramp, a Foreground estimate); years 2 and 3 run at steady state with no growth.
 * Cumulative cash starts at minus the build-out and adds each year's profit.
 *
 * paybackYears is read off that same cumulative-cash curve (see payback), so it always agrees with the rows:
 * payback <= 3 exactly when year-3 cumulative cash is not negative. With year1Ramp = 1 it reduces to
 * build-out / annual profit, which is how the plan-doc worked example states it.
 */
export function scenarios(input: ScenariosInput): Scenarios {
  const band = input.band ?? benchmarks.salesPerSfYr[input.concept];
  const shares = input.shares ?? {
    food: benchmarks.costShares.food.value,
    labor: benchmarks.costShares.labor.value,
    other: benchmarks.costShares.other.value,
  };
  const ramp = input.year1Ramp ?? benchmarks.year1Ramp.value;
  const margin = 1 - shares.food - shares.labor - shares.other;
  const profitAt = (salesUsd: number) => salesUsd * margin - input.annualOccupancyUsd;

  const build = (name: ScenarioName, salesPerSfYr: number): Scenario => {
    const annualSalesUsd = salesPerSfYr * input.sf;
    const annualProfitUsd = profitAt(annualSalesUsd);
    let cash = -input.buildoutUsd;
    const years = ([1, 2, 3] as const).map((year): ScenarioYear => {
      const salesUsd = year === 1 ? annualSalesUsd * ramp : annualSalesUsd;
      const profitUsd = profitAt(salesUsd);
      cash += profitUsd;
      return { year, salesUsd, profitUsd, cumulativeCashUsd: cash };
    });
    return {
      name,
      salesPerSfYr,
      annualSalesUsd,
      occupancySharePct: annualSalesUsd > 0 ? (input.annualOccupancyUsd / annualSalesUsd) * 100 : 0,
      annualProfitUsd,
      paybackYears: payback(input.buildoutUsd, years[0].profitUsd, annualProfitUsd),
      years,
    };
  };

  const [slow, base, strong] = CASES.map(([name, key]) => build(name, band[key]));
  const pct = (share: number) => `${Math.round(share * 100)}%`;

  return {
    scenarios: { slow, base, strong },
    assumptions: [
      cite(
        `Sales of $${Math.round(band.low)} / $${Math.round(band.mid)} / $${Math.round(band.high)} per SF per year (${
          input.concept
        })`,
        input.band ? { source: { label: "Supplied by caller" } } : benchmarks.salesPerSfYr[input.concept],
      ),
      cite(`Food cost ${pct(shares.food)} of sales`, benchmarks.costShares.food),
      cite(`Labor ${pct(shares.labor)} of sales`, benchmarks.costShares.labor),
      cite(`Other operating costs ${pct(shares.other)} of sales`, benchmarks.costShares.other),
      cite(`Year 1 at ${pct(ramp)} of steady sales; years 2-3 steady, no growth`, benchmarks.year1Ramp),
    ],
    verdict: verdict(slow, base, strong),
  };
}

const HORIZON_YEARS = 3;

/**
 * Years until cumulative cash (minus the build-out at t=0, year 1 at the ramp, then steady profit) reaches zero,
 * interpolating within the year it crosses and continuing past year 3 at the steady rate.
 * Null when steady-state profit is not positive. So payback <= 3 exactly when year-3 cumulative cash >= 0.
 */
function payback(buildoutUsd: number, year1ProfitUsd: number, steadyProfitUsd: number): number | null {
  if (steadyProfitUsd <= 0) return null;
  if (year1ProfitUsd >= buildoutUsd) return year1ProfitUsd > 0 ? buildoutUsd / year1ProfitUsd : 0;
  return 1 + (buildoutUsd - year1ProfitUsd) / steadyProfitUsd;
}

/**
 * Plain-language read of the three curves. Two separate questions, never mixed:
 *  - is it profitable (yearly profit signs, including the ramp year), and
 *  - does it pay back the build-out within the 3 years shown (sign of year-3 cumulative cash).
 */
function verdict(slow: Scenario, base: Scenario, strong: Scenario): string {
  const years = (s: Scenario) => (s.paybackYears as number).toFixed(1);
  const paysBack = (s: Scenario) => s.years[HORIZON_YEARS - 1].cumulativeCashUsd >= 0;
  const perSf = (s: Scenario) => `$${Math.round(s.salesPerSfYr)}/SF`;

  if (strong.annualProfitUsd <= 0) return "Loses money in every case at this rent, even with strong sales.";

  if (base.annualProfitUsd <= 0) {
    const profit = `Profitable only if sales reach the strong case (${perSf(strong)}); the base case loses about ${usd(
      -base.annualProfitUsd,
    )} a year.`;
    return paysBack(strong)
      ? `${profit} The strong case pays back the build-out in ${years(strong)} years.`
      : `${profit} Even the strong case does not pay back the build-out within ${HORIZON_YEARS} years.`;
  }

  let profit: string;
  if (slow.annualProfitUsd <= 0)
    profit = `Profitable only if sales reach the base case (${perSf(base)}); a slow year loses about ${usd(
      -slow.annualProfitUsd,
    )}.`;
  else if (slow.years[0].profitUsd > 0) profit = "Profitable every year, even in the slow case.";
  else
    profit = `Profitable in every case from year 2; the slow case loses about ${usd(-slow.years[0].profitUsd)} in year 1.`;

  let back: string;
  if (paysBack(base)) {
    back = `The base case pays back the build-out in ${years(base)} years`;
    if (slow.annualProfitUsd <= 0) back += ".";
    else if (paysBack(slow)) back += `, the slow case in ${years(slow)}.`;
    else
      back += `; the slow case is still ${usd(-slow.years[HORIZON_YEARS - 1].cumulativeCashUsd)} short after ${HORIZON_YEARS} years.`;
  } else {
    back = `The base case does not pay back the build-out within ${HORIZON_YEARS} years (about ${years(base)} years at this pace)`;
    back += paysBack(strong) ? `; the strong case does, in ${years(strong)} years.` : ".";
  }
  return `${profit} ${back}`;
}

/**
 * Keeps the scenario verdict and the break-even verdict from contradicting each other.
 * Scenarios apply benchmark sales per SF to the whole space; break-even turns use the seats the owner will run.
 * When the scenarios make money but break-even is "unlikely" on those seats, the seats are the limit,
 * so the scenario verdict says so. Otherwise the scenarios are returned unchanged.
 */
export function withSeatCaveat(outlook: Scenarios, even: Breakeven, seats: number, sf: number): Scenarios {
  if (even.verdict !== "unlikely" || seats <= 0 || outlook.scenarios.base.annualProfitUsd <= 0) return outlook;
  return {
    ...outlook,
    verdict: `${outlook.verdict} These cases assume the whole ${sf.toLocaleString(
      "en-US",
    )} SF sells at benchmark rates; on ${seats} seats, break-even alone takes ${even.turnsPerDay.toFixed(1)} turns a day.`,
  };
}
