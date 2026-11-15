import { benchmarks, cite, usdSales } from "./benchmarks";
import type { Breakeven, Concept } from "./types";

export type BreakevenInput = {
  /** rent + CAM + tax + insurance */
  annualOccupancyUsd: number;
  /** seats the owner will operate: min(seats that fit, seats wanted) */
  seats: number;
  concept: Concept;
  avgCheckUsd?: number;
  /** cost shares of sales; defaults to the same benchmarks the scenarios use (food 30%, labor 31%, other 23%) */
  shares?: { food: number; labor: number; other: number };
  /** healthy rent share shown as a reference line only; default 0.08 */
  targetOccupancyShare?: number;
  openDaysPerYear?: number;
  /** annual sales of the base and strong scenarios, so the verdict can never be rosier than the scenarios */
  caseSalesUsd?: { base: number; strong: number };
};

const ORDER: Breakeven["verdict"][] = ["comfortable", "stretch", "unlikely"];
const worse = (a: Breakeven["verdict"], b: Breakeven["verdict"]) => ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b))];

/**
 * True break-even: the sales at which profit is zero under the same cost model the scenarios use.
 *
 *   salesNeeded = occupancy / (1 - food - labor - other)      (16% of sales is left to pay rent by default)
 *   coversPerDay = salesNeeded / average check / open days
 *   turnsPerDay  = coversPerDay / seats the owner will operate
 *
 * The "rent at 8% of sales" rule of thumb is kept only as a cited reference line in the assumptions.
 *
 * Verdict from turns per day (limits per concept in benchmarks.turnsVerdict, a Foreground estimate; break-even
 * should sit well below a normal day, which is about 3.5 turns for counter service):
 *   comfortable: turns/day <= comfortableMax (fast-casual 2, full-service and bar 1.5, quick-service and cafe 3)
 *   stretch:     turns/day <= stretchMax     (fast-casual 3.5, full-service and bar 2.5, quick-service and cafe 5)
 *   unlikely:    above that, or no seats
 * and, when the scenario sales are passed in, never rosier than the scenarios:
 *   break-even sales above the base case   -> at best "stretch"
 *   break-even sales above the strong case -> "unlikely"
 */
export function breakeven(input: BreakevenInput): Breakeven {
  const { concept, seats } = input;
  const shares = input.shares ?? {
    food: benchmarks.costShares.food.value,
    labor: benchmarks.costShares.labor.value,
    other: benchmarks.costShares.other.value,
  };
  const margin = 1 - shares.food - shares.labor - shares.other;
  const rentShare = input.targetOccupancyShare ?? benchmarks.occupancyShare.target;
  const avgCheckUsd = input.avgCheckUsd ?? benchmarks.avgCheckUsd[concept].value;
  const openDays = input.openDaysPerYear ?? benchmarks.openDaysPerYear.value;
  const limits = benchmarks.turnsVerdict[concept];

  const salesNeededUsd = input.annualOccupancyUsd / margin;
  const coversPerDay = salesNeededUsd / avgCheckUsd / openDays;
  const turnsPerDay = seats > 0 ? coversPerDay / seats : 0;

  let verdict: Breakeven["verdict"] = "unlikely";
  if (seats > 0 && turnsPerDay <= limits.comfortableMax) verdict = "comfortable";
  else if (seats > 0 && turnsPerDay <= limits.stretchMax) verdict = "stretch";

  if (input.caseSalesUsd) {
    if (salesNeededUsd >= input.caseSalesUsd.strong) verdict = "unlikely";
    else if (salesNeededUsd >= input.caseSalesUsd.base) verdict = worse(verdict, "stretch");
  }

  const pct = (share: number) => `${Math.round(share * 100)}%`;
  return {
    avgCheckUsd,
    salesNeededUsd,
    coversPerDay,
    turnsPerDay,
    verdict,
    assumptions: [
      cite(
        `Break-even is where profit is zero: after food ${pct(shares.food)}, labor ${pct(shares.labor)} and other costs ${pct(
          shares.other,
        )}, ${pct(margin)} of sales is left to pay occupancy`,
        {
          source: {
            label: `${benchmarks.costShares.food.source.label}; other costs: ${benchmarks.costShares.other.source.label}`,
            url: benchmarks.costShares.food.source.url,
          },
        },
      ),
      cite(
        `To keep rent at ${pct(rentShare)} of sales: ${usdSales(input.annualOccupancyUsd / rentShare)}/yr`,
        benchmarks.occupancyShare,
      ),
      cite(`Average check $${Math.round(avgCheckUsd)} (${concept})`, benchmarks.avgCheckUsd[concept]),
      cite(`Open ${openDays} days a year`, benchmarks.openDaysPerYear),
      cite(
        `Break-even at up to ${limits.comfortableMax} turns a day is comfortable for ${concept}; up to ${limits.stretchMax} is a stretch`,
        benchmarks.turnsVerdict,
      ),
    ],
  };
}
