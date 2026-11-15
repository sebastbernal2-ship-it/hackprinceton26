import { benchmarks } from "@/lib/engine/benchmarks";
import type { Concept, ScenarioName } from "@/lib/engine/types";
import { usd } from "@/lib/format";
import type { LayoutImpact, Layout, DaySim } from "@/lib/layout";
import { seatPoints } from "@/lib/layout";
import type { SiteRent } from "@/lib/ml/rent";
import type { PlanDot } from "../plan-mini";

export const CASES: ScenarioName[] = ["slow", "base", "strong"];

/** the three profit-by-year series of the (layout-adjusted) outlook */
export function profitSeries(impact: Pick<LayoutImpact, "scenarios">): Record<ScenarioName, [number, number, number]> {
  const s = impact.scenarios.scenarios;
  const pick = (k: ScenarioName) => s[k].years.map((y) => Math.round(y.profitUsd)) as [number, number, number];
  return { slow: pick("slow"), base: pick("base"), strong: pick("strong") };
}

/** where the base line crosses $0 between years, as a fractional year index (0..2), or null */
export function zeroCrossing(series: number[]): number | null {
  for (let i = 0; i < series.length - 1; i++) {
    if (series[i] < 0 !== series[i + 1] < 0) return i + series[i] / (series[i] - series[i + 1]);
  }
  return null;
}

/** the dial's axis for a concept: turns a day at which the verdict changes (benchmarks.turnsVerdict) */
export function dialScale(concept: Concept, turns: number) {
  const lim = benchmarks.turnsVerdict[concept];
  const max = lim.stretchMax * 1.5;
  const f = (n: number) => Math.max(0, Math.min(1, n / max));
  return { comfortableMax: lim.comfortableMax, stretchMax: lim.stretchMax, a: f(lim.comfortableMax), b: f(lim.stretchMax), value: f(turns) };
}

/** the risks list, each a sentence built from the engine's numbers for the plan as drawn */
export function risksFor(impact: LayoutImpact, rent: SiteRent | null): string[] {
  const a = impact.analysis;
  const base = impact.scenarios.scenarios.base;
  const risks: string[] = [];
  if (rent && !rent.basisUncertain && rent.band === "above market") risks.push(`Asking rent is above the fair band, about ${usd(rent.gapPerYr)} a year over.`);
  if (impact.breakeven.verdict === "unlikely") risks.push(`Break-even needs ${impact.breakeven.turnsPerDay.toFixed(1)} turns a day on ${impact.seatsUsed} seats.`);
  if (base.annualProfitUsd <= 0) risks.push("The base case does not turn a profit.");
  if (impact.capped) risks.push(`The plan draws ${impact.seats} seats; the money model runs on ${impact.seatsUsed}, what this much floor fits.`);
  const unknown = a.xray.lines.filter((l) => l.status === "maybe").sort((x, y) => y.range.high - x.range.high)[0];
  if (unknown) risks.push(`${unknown.label}: unknown, up to ${usd(unknown.range.high)}. Ask the landlord.`);
  if (a.graveyard.closedHere > 0) risks.push(a.graveyard.summary);
  if (a.trend.rating === "headwind") risks.push("The block is trending the wrong way.");
  return risks.slice(0, 4);
}

export function sourcesFor(impact: LayoutImpact, rent: SiteRent | null): string[] {
  const all = [...impact.scenarios.assumptions, ...impact.breakeven.assumptions].flatMap((c) => c.source.split(";").map((s) => s.trim()).filter(Boolean));
  const out = [...new Set(all)].slice(0, 3);
  out.push("Foreground layout engine");
  if (rent) out.push("Foreground fair-rent model");
  return out;
}

/** the Guide's first line in Numbers: the base case and the break-even in plain words */
export function numbersRead(impact: LayoutImpact): string {
  const base = impact.scenarios.scenarios.base;
  const even = impact.breakeven;
  const verdict = even.verdict === "comfortable" ? "comfortably within reach" : even.verdict === "stretch" ? "a stretch" : "unlikely on these seats";
  return base.annualProfitUsd > 0
    ? `Base case on your plan: about ${usd(base.annualProfitUsd)} a year profit, ${base.paybackYears ? `paid back in ${base.paybackYears.toFixed(1)} years` : "no payback"}. You need ${Math.round(even.coversPerDay)} covers a day to break even, ${verdict}.`
    : `At base sales your plan does not clear its costs; break-even needs ${Math.round(even.coversPerDay)} covers a day.`;
}

export type FillFrame = { dots: PlanDot[]; served: number; walked: number; waiting: number; seated: number };

/** one frame of the lunch-rush play at `minute` after opening, in plan metres (pure, so it can be tested) */
export function fillFrame(sim: DaySim, layout: Pick<Layout, "items" | "entry">, minute: number): FillFrame {
  const seats = seatPoints(layout);
  const dots: PlanDot[] = [];
  let served = 0;
  let walked = 0;
  let waiting = 0;
  let seated = 0;
  const [ex, ey] = layout.entry;
  for (const g of sim.guests) {
    if (g.arrive > minute) continue;
    if (g.seatAt > minute) {
      dots.push({ x: ex + (waiting % 6) * 0.45 - 1, y: ey + 0.6 + Math.floor(waiting / 6) * 0.45, kind: "waiting" });
      waiting++;
    } else if (g.seat >= 0) {
      served++;
      if (g.leaveAt > minute && seats[g.seat]) {
        dots.push({ x: seats[g.seat][0], y: seats[g.seat][1], kind: "seated" });
        seated++;
      }
    } else walked++;
  }
  return { dots, served, walked, waiting, seated };
}
