import { occupancy, scenarios, withSeatCaveat } from "@/lib/engine";
import type { OwnerBrief, Range } from "@/lib/engine/types";
import { assess } from "@/lib/feasibility";
import type { Assessment, Change } from "@/lib/feasibility/types";
import { applyOps, autoLayout, layoutImpact, type Layout, type LayoutImpact, type Op } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";
import type { Numbers, Snapshot } from "./types";

const WEEKS_PER_MONTH = 4.345;
const add = (a: Range, b: Range): Range => ({ low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high });
const sub = (a: Range, b: Range): Range => ({ low: a.low - b.low, mid: a.mid - b.mid, high: a.high - b.high });

function snapshot(site: Site, impact: LayoutImpact, extra: Range, extraWeeks: Range, budgetUsd: number | undefined): { snap: Snapshot; outlook: string } {
  const total = add(impact.total, extra);
  const concept = impact.analysis.brief.concept;
  // the same three-year model the engine runs, with the imagined work added to the build-out to pay back
  const occ = occupancy(site).annualUsd.mid;
  const cases = withSeatCaveat(scenarios({ sf: site.space.sf, annualOccupancyUsd: occ, buildoutUsd: total.mid, concept }), impact.breakeven, impact.seatsUsed, site.space.sf);
  const base = cases.scenarios.base;
  const t = impact.analysis.timeToOpen.months;
  const m = (w: number) => w / WEEKS_PER_MONTH;
  return {
    snap: {
      concept,
      seats: impact.seats,
      total,
      overBudget: budgetUsd === undefined ? null : total.mid > budgetUsd,
      salesNeededUsd: impact.breakeven.salesNeededUsd,
      coversPerDay: impact.breakeven.coversPerDay,
      turnsPerDay: impact.breakeven.turnsPerDay,
      verdict: impact.breakeven.verdict,
      paybackYears: base.paybackYears,
      year3CashUsd: base.years[2].cumulativeCashUsd,
      monthsToOpen: { low: t.low + m(extraWeeks.low), mid: t.mid + m(extraWeeks.mid), high: t.high + m(extraWeeks.high) },
    },
    outlook: cases.verdict,
  };
}

const ZERO: Range = { low: 0, mid: 0, high: 0 };

export type Evaluation = { layout: Layout; notes: string[]; assessment: Assessment; numbers: Numbers; costDelta: Range };

/**
 * Everything derived from a change list, in one pure call. The server runs it for the first answer; the panel
 * runs it again when the owner edits or switches off a line item.
 *
 *   plan after   = base plan + layout ops (a "use" change re-plans the room for the new concept)
 *   checks       = lib/feasibility on the enabled changes and the plan after
 *   before       = engine + plan costs on the base plan
 *   after        = engine + plan costs on the plan after, plus change lines and counted checks
 *   costDelta    = after.total - before.total
 *   time to open = engine months + (longest permit + work) weeks from the checks
 */
export function evaluate(input: { site: Site; brief: OwnerBrief; changes: Change[]; layoutOps: Op[]; baseLayout?: Layout | null }): Evaluation {
  const { site, brief } = input;
  const base = input.baseLayout ?? autoLayout(site, brief);
  const live = input.changes.filter((c) => c.enabled);
  const concept = [...live].reverse().find((c) => c.kind === "use" && c.concept)?.concept;
  // layout ops belong to layout and use changes: with none of those switched on, the plan stays as it was
  const planned = live.some((c) => c.kind === "layout" || c.kind === "use" || c.kind === "exterior");
  const ops: Op[] = planned ? [...input.layoutOps] : [];
  if (concept && concept !== base.concept && !ops.some((op) => op.op === "setConcept")) ops.unshift({ op: "setConcept", concept });
  const applied = ops.length ? applyOps(base, ops, { site, brief }) : { layout: base, notes: [] };

  const assessment = assess({ site, brief, changes: input.changes, layout: applied.layout, layoutOps: ops });
  const before = snapshot(site, layoutImpact(site, brief, base), ZERO, ZERO, brief.budgetUsd);
  const after = snapshot(site, layoutImpact(site, brief, applied.layout), assessment.cost.total, assessment.time.totalWeeks, brief.budgetUsd);
  return {
    layout: applied.layout,
    notes: applied.notes,
    assessment,
    numbers: { before: before.snap, after: after.snap, outlook: after.outlook },
    costDelta: sub(after.snap.total, before.snap.total),
  };
}
