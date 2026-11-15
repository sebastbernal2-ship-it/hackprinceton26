import type { Site } from "@/lib/sites/schema";
import { plural, usd } from "./benchmarks";
import { operatedSeats } from "./seats";
import type { BlockTrend, Breakeven, Graveyard, OwnerBrief, Scenarios, SeatFit, SiteScore, XRay } from "./types";

export type ScoreInput = {
  site: Site;
  brief: OwnerBrief;
  seats: SeatFit;
  xray: XRay;
  breakeven: Breakeven;
  scenarios: Scenarios;
  trend: BlockTrend;
  graveyard: Graveyard;
};

/**
 * Site score, 0-100, for ranking sites against one brief. Starts at 40, then:
 *   break-even:   comfortable +15, stretch 0, unlikely -15 (turns on the seats the owner will operate)
 *   base case:    payback <= 3 yr +15, <= 5 yr +5, longer -5, loses money -15
 *   slow case:    still profitable +5
 *   budget:       X-Ray midpoint within budget +10, over -15, no budget given 0
 *   existing kit: +3 per saved X-Ray line, up to +10
 *   block trend:  trend score x 10 (-10..+10)
 *   same suite:   -5 per food tenant that has left this suite (closed or moved out), up to -10
 *   seats:        fits fewer seats than the owner wants -5
 *   city:         not the city the owner asked for -20
 *   scan:         3D scan is of a neighbouring suite -2
 * Clamped to 0..100 and rounded. Weights are a Foreground estimate.
 */
export function scoreSite(input: ScoreInput): SiteScore {
  const { site, brief, seats, xray, breakeven, scenarios, trend, graveyard } = input;
  const reasons: string[] = [];
  const flags: string[] = [];
  let score = 40;
  const operated = operatedSeats(seats, brief);

  const turns = breakeven.turnsPerDay.toFixed(1);
  if (breakeven.verdict === "comfortable") {
    score += 15;
    reasons.push(`Rent is covered at ${turns} turns a day on ${operated} seats`);
  } else if (breakeven.verdict === "stretch") {
    reasons.push(`Covering rent takes ${turns} turns a day on ${operated} seats, a stretch`);
  } else {
    score -= 15;
    flags.push(`Rent is hard to cover: needs ${turns} turns a day on ${operated} seats`);
  }

  const { slow, base } = scenarios.scenarios;
  if (base.paybackYears === null) {
    score -= 15;
    flags.push("Loses money even in the base case");
  } else {
    score += base.paybackYears <= 3 ? 15 : base.paybackYears <= 5 ? 5 : -5;
    // same two questions as the scenario verdict: profitable (yearly signs) vs pays back (year-3 cash sign)
    const earns = `Base case earns about ${usd(base.annualProfitUsd)} a year at steady state`;
    const years = base.paybackYears.toFixed(1);
    reasons.push(
      base.years[2].cumulativeCashUsd >= 0
        ? `${earns} and pays back the build-out in ${years} years`
        : `${earns} but does not pay back the build-out within 3 years (about ${years} at this pace)`,
    );
  }
  if (slow.annualProfitUsd > 0) {
    score += 5;
    reasons.push(
      slow.years.every((y) => y.profitUsd > 0)
        ? "Profitable every year, even in the slow case"
        : `Slow case turns profitable from year 2, after losing about ${usd(-slow.years[0].profitUsd)} in year 1`,
    );
  }

  if (xray.overBudget === true) {
    score -= 15;
    flags.push(`Over budget by ${usd(xray.total.mid - (brief.budgetUsd as number))} at the build-out midpoint`);
  } else if (xray.overBudget === false) {
    score += 10;
    reasons.push(`Build-out midpoint ${usd(xray.total.mid)} fits the budget`);
  }

  const saved = xray.lines.filter((l) => l.status === "saved");
  if (saved.length > 0) {
    score += Math.min(10, saved.length * 3);
    reasons.push(`Existing ${saved.map((l) => l.label.toLowerCase()).join(", ")} saves about ${usd(xray.saved.mid)}`);
  }

  score += trend.score * 10;
  reasons.push(`Block trend: ${trend.rating}`);

  if (graveyard.sameSuiteFailures > 0) {
    score -= Math.min(10, graveyard.sameSuiteFailures * 5);
    flags.push(`${plural(graveyard.sameSuiteFailures, "food tenant")} ${graveyard.sameSuiteFailures === 1 ? "has" : "have"} left this same suite`);
  }

  if (brief.seats !== undefined && seats.seats < brief.seats) {
    score -= 5;
    flags.push(`Fits about ${seats.seats} seats, not the ${brief.seats} you want`);
  }

  if (brief.city && brief.city !== site.city) {
    score -= 20;
    flags.push(`Site is in ${site.city}, not ${brief.city}`);
  }

  if (site.matterport && !site.matterport.scanOfExactSuite) {
    score -= 2;
    flags.push("3D scan shows a neighbouring suite, not this one");
  }

  return { score: Math.round(Math.min(100, Math.max(0, score))), reasons, flags };
}
