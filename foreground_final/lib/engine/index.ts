import type { Site } from "@/lib/sites/schema";
import { breakeven } from "./breakeven";
import { graveyard } from "./graveyard";
import { occupancy } from "./occupancy";
import { scenarios, withSeatCaveat } from "./scenarios";
import { scoreSite } from "./score";
import { fitSeats, operatedSeats } from "./seats";
import { timeToOpen } from "./time-to-open";
import { blockTrend, DEFAULT_TODAY } from "./trend";
import type { OwnerBrief, SiteAnalysis } from "./types";
import { xray } from "./xray";

export * from "./types";
export { benchmarks } from "./benchmarks";
export { breakeven, graveyard, occupancy, scenarios, withSeatCaveat, scoreSite, fitSeats, operatedSeats, timeToOpen, blockTrend, xray };

/**
 * One call the UI and agent use: everything the site page and ranking need.
 * Pure: `today` is injected (default 2026-11-14) so results never depend on the clock.
 *
 * Break-even uses the occupancy midpoint, the same cost shares as the scenarios, and the seats the owner will
 * operate: min(seats that fit, brief.seats). Its verdict is never rosier than the scenarios, and the scenario
 * verdict carries a seat caveat when break-even is unlikely on those seats (see withSeatCaveat).
 * Scenarios use the listing SF, the occupancy midpoint and the X-Ray total midpoint as the build-out to pay back.
 */
export function analyzeSite(site: Site, brief: OwnerBrief, today: Date = DEFAULT_TODAY): SiteAnalysis {
  const seats = fitSeats(site, brief.concept, brief.seats);
  const costs = xray(site, brief);
  const occ = occupancy(site);
  const operated = operatedSeats(seats, brief);
  const cases = scenarios({
    sf: site.space.sf,
    annualOccupancyUsd: occ.annualUsd.mid,
    buildoutUsd: costs.total.mid,
    concept: brief.concept,
  });
  const even = breakeven({
    annualOccupancyUsd: occ.annualUsd.mid,
    seats: operated,
    concept: brief.concept,
    caseSalesUsd: {
      base: cases.scenarios.base.annualSalesUsd,
      strong: cases.scenarios.strong.annualSalesUsd,
    },
  });
  const outlook = withSeatCaveat(cases, even, operated, site.space.sf);
  const trend = blockTrend(site, today);
  const history = graveyard(site);

  return {
    siteId: site.id,
    brief,
    seats,
    xray: costs,
    occupancy: occ,
    breakeven: even,
    scenarios: outlook,
    trend,
    graveyard: history,
    timeToOpen: timeToOpen(site, occ),
    score: scoreSite({
      site,
      brief,
      seats,
      xray: costs,
      breakeven: even,
      scenarios: outlook,
      trend,
      graveyard: history,
    }),
  };
}
