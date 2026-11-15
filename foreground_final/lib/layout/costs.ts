import { benchmarks, breakeven, occupancy, scenarios, withSeatCaveat, analyzeSite, operatedSeats } from "@/lib/engine";
import type { Breakeven, OwnerBrief, Range, Scenarios, SiteAnalysis } from "@/lib/engine/types";
import type { Site } from "@/lib/sites/schema";
import { dist } from "./geometry";
import type { Layout } from "./types";
import { seatCount } from "./validate";

const L = benchmarks.layout;
const CONTINGENCY = benchmarks.contingency.value;

export type LayoutCostLine = { id: string; label: string; range: Range; reason: string; source: string };

const range = (low: number, high: number): Range => ({ low, mid: (low + high) / 2, high });
const m = (n: number) => `${n.toFixed(1)} m`;

/**
 * What the drawn plan adds on top of the X-Ray: bar and counter millwork by the metre, restrooms and walk-ins
 * beyond the first, a patio, and relocating an existing cook line away from its hood.
 */
export function layoutCosts(layout: Layout): { lines: LayoutCostLine[]; total: Range } {
  const lines: LayoutCostLine[] = [];
  const of = (type: string) => layout.items.filter((i) => i.type === type);
  const length = (type: string) => of(type).reduce((s, i) => s + Math.max(i.w, i.d), 0);

  const bar = length("bar-counter");
  if (bar > 0)
    lines.push({
      id: "bar-counter",
      label: "Bar counter",
      range: range(bar * L.barCounterPerM.low, bar * L.barCounterPerM.high),
      reason: `${m(bar)} of plumbed bar at $${L.barCounterPerM.low.toLocaleString("en-US")}-${L.barCounterPerM.high.toLocaleString("en-US")} a metre.`,
      source: L.barCounterPerM.source.label,
    });
  const counter = length("counter");
  if (counter > 0)
    lines.push({
      id: "counter",
      label: "Service counter",
      range: range(counter * L.serviceCounterPerM.low, counter * L.serviceCounterPerM.high),
      reason: `${m(counter)} of order counter at $${L.serviceCounterPerM.low}-${L.serviceCounterPerM.high.toLocaleString("en-US")} a metre.`,
      source: L.serviceCounterPerM.source.label,
    });
  const restrooms = of("restroom").length;
  if (restrooms > 1)
    lines.push({
      id: "extra-restroom",
      label: restrooms === 2 ? "Second restroom" : `${restrooms - 1} more restrooms`,
      range: range((restrooms - 1) * L.extraRestroom.low, (restrooms - 1) * L.extraRestroom.high),
      reason: "A new plumbed, accessible room each. The first restroom is the X-Ray's ADA restroom line.",
      source: L.extraRestroom.source.label,
    });
  const walkIns = of("walk-in").length;
  if (walkIns > 1)
    lines.push({
      id: "extra-walk-in",
      label: walkIns === 2 ? "Second walk-in cooler" : `${walkIns - 1} more walk-in coolers`,
      range: range((walkIns - 1) * L.extraWalkIn.low, (walkIns - 1) * L.extraWalkIn.high),
      reason: "Beyond the one walk-in the X-Ray already prices.",
      source: L.extraWalkIn.source.label,
    });
  if (of("patio-table").length > 0)
    lines.push({
      id: "patio",
      label: "Patio set-up",
      range: range(L.patioSetup.low, L.patioSetup.high),
      reason: "Permit, barriers and outdoor furniture. Needs the landlord's and the city's consent.",
      source: L.patioSetup.source.label,
    });

  const line = of("kitchen-line")[0];
  if (layout.kitchenAnchor && line) {
    const moved = dist([line.x, line.y], layout.kitchenAnchor);
    if (moved > L.relocationToleranceM.value) {
      lines.push({
        id: "hood-relocation",
        label: "Hood relocation",
        range: range(L.hoodRelocation.low, L.hoodRelocation.high),
        reason: `The cook line sits ${m(moved)} from the existing hood: new roof penetration, duct run and fire suppression.`,
        source: L.hoodRelocation.source.label,
      });
      lines.push({
        id: "kitchen-plumbing",
        label: "Gas and drains rerouted",
        range: range(L.kitchenPlumbingReroute.low, L.kitchenPlumbingReroute.high),
        reason: "Gas, floor drains and grease waste follow the cook line to its new spot.",
        source: L.kitchenPlumbingReroute.source.label,
      });
    }
  }

  const sum = lines.reduce((t, l) => ({ low: t.low + l.range.low, mid: t.mid + l.range.mid, high: t.high + l.range.high }), { low: 0, mid: 0, high: 0 });
  if (lines.length)
    lines.push({
      id: "layout-contingency",
      label: `Contingency (${CONTINGENCY * 100}%)`,
      range: { low: sum.low * CONTINGENCY, mid: sum.mid * CONTINGENCY, high: sum.high * CONTINGENCY },
      reason: "The same cushion the X-Ray applies.",
      source: benchmarks.contingency.source.label,
    });
  const k = 1 + CONTINGENCY;
  return { lines, total: { low: sum.low * k, mid: sum.mid * k, high: sum.high * k } };
}

export type LayoutImpact = {
  /** seats drawn on the plan */
  seats: number;
  /** seats the money model runs on: the engine caps drawn seats at what its SF benchmark says fits */
  seatsUsed: number;
  capped: boolean;
  analysis: SiteAnalysis;
  extras: { lines: LayoutCostLine[]; total: Range };
  /** X-Ray total plus layout extras */
  total: Range;
  overBudget: boolean | null;
  breakeven: Breakeven;
  /** three-year outlook with the layout extras added to the build-out to pay back */
  scenarios: Scenarios;
};

/** The business read of a drawn plan: the engine's analysis on the plan's seats and concept, plus layout costs. */
export function layoutImpact(site: Site, brief: OwnerBrief, layout: Layout): LayoutImpact {
  const seats = seatCount(layout);
  const planBrief: OwnerBrief = { ...brief, concept: layout.concept, seats };
  const analysis = analyzeSite(site, planBrief);
  const extras = layoutCosts(layout);
  const x = analysis.xray.total;
  const total = { low: x.low + extras.total.low, mid: x.mid + extras.total.mid, high: x.high + extras.total.high };
  const seatsUsed = operatedSeats(analysis.seats, planBrief);

  let outlook = analysis.scenarios;
  if (extras.total.mid > 0) {
    const occ = occupancy(site);
    const cases = scenarios({ sf: site.space.sf, annualOccupancyUsd: occ.annualUsd.mid, buildoutUsd: total.mid, concept: layout.concept });
    const even = breakeven({
      annualOccupancyUsd: occ.annualUsd.mid,
      seats: seatsUsed,
      concept: layout.concept,
      caseSalesUsd: { base: cases.scenarios.base.annualSalesUsd, strong: cases.scenarios.strong.annualSalesUsd },
    });
    outlook = withSeatCaveat(cases, even, seatsUsed, site.space.sf);
  }
  return {
    seats,
    seatsUsed,
    capped: seats > seatsUsed,
    analysis,
    extras,
    total,
    overBudget: brief.budgetUsd === undefined ? null : total.mid > brief.budgetUsd,
    breakeven: analysis.breakeven,
    scenarios: outlook,
  };
}
