import type { OwnerBrief } from "@/lib/engine";
import type { Range } from "@/lib/engine/types";
import { layoutImpact, type Layout, type LayoutImpact } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";

/**
 * The business read of the CURRENT plan: seats, all-in, break-even, year-3 profit, layout extras. Pure and
 * browser-safe (no I/O), so the Layout chapter, Numbers and Deal all call it on the same layout. It is the engine's
 * `layoutImpact` (lib/layout/costs.ts); this file adds the five figures the impact bar shows and their deltas.
 */
export { layoutImpact };
export type { LayoutImpact };

export type Figures = {
  seats: number;
  seatsUsed: number;
  capped: boolean;
  allIn: Range;
  overBudget: boolean | null;
  coversPerDay: number;
  verdict: LayoutImpact["breakeven"]["verdict"];
  /** base-case profit in year 3 */
  year3Profit: number;
  extras: Range;
};

export function figuresOf(impact: LayoutImpact): Figures {
  const base = impact.scenarios.scenarios.base;
  return {
    seats: impact.seats,
    seatsUsed: impact.seatsUsed,
    capped: impact.capped,
    allIn: impact.total,
    overBudget: impact.overBudget,
    coversPerDay: impact.breakeven.coversPerDay,
    verdict: impact.breakeven.verdict,
    year3Profit: base.years.find((y) => y.year === 3)?.profitUsd ?? base.annualProfitUsd,
    extras: impact.extras.total,
  };
}

export type FigureDeltas = { seats: number; allIn: number; coversPerDay: number; year3Profit: number; extras: number };

/** change from `before` to `after`; null when both are the same plan, so the bar shows no chip */
export function deltasBetween(before: Figures, after: Figures): FigureDeltas | null {
  const d: FigureDeltas = {
    seats: after.seats - before.seats,
    allIn: Math.round(after.allIn.mid - before.allIn.mid),
    coversPerDay: Math.round(after.coversPerDay - before.coversPerDay),
    year3Profit: Math.round(after.year3Profit - before.year3Profit),
    extras: Math.round(after.extras.mid - before.extras.mid),
  };
  return Object.values(d).every((v) => v === 0) ? null : d;
}

/** convenience for callers that only hold the pieces */
export function figuresFor(site: Site, brief: OwnerBrief, layout: Layout): Figures {
  return figuresOf(layoutImpact(site, brief, layout));
}
