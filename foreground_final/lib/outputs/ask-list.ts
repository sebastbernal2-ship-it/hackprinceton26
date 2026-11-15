import { breakeven } from "@/lib/engine/breakeven";
import { operatedSeats } from "@/lib/engine/seats";
import type { CostLine, Range, SiteAnalysis } from "@/lib/engine/types";
import { monthYear, num, usd, usdRange } from "@/lib/format";
import { formatRentRange, rentFor, type SiteRent } from "@/lib/ml/rent";
import type { Site } from "@/lib/sites/schema";

/**
 * Landlord ask list. Pure: derived only from the site and its analysis, so every number traces to the X-Ray,
 * the time-to-open estimate, the break-even model or the tenant records.
 */

export type AskKind = "line-credit" | "ti-allowance" | "free-rent" | "rent-level" | "inspection" | "history";
export type AskPriority = "high" | "medium" | "low";

export type Ask = {
  id: string;
  kind: AskKind;
  title: string;
  /** the reason, with the numbers */
  why: string;
  /** dollars to the owner if the landlord agrees; null for a clause with no dollar figure */
  value: Range | null;
  /** one-time dollars, or dollars per year of the lease */
  basis: "one-time" | "per-year" | null;
  priority: AskPriority;
  /** where the numbers come from */
  source: string;
  /** for a rent-level ask: the rent asked for, $/SF/yr */
  askedRentPerSfYr?: number;
};

const PRIORITY_WEIGHT: Record<AskPriority, number> = { high: 3, medium: 2, low: 1 };

/** X-Ray systems that belong to the building, so a landlord can credit or build them. */
const LANDLORD_SYSTEMS: CostLine["kind"][] = ["hood", "grease-trap", "electrical", "gas", "sewer", "ada"];
/** Findings a contractor can settle before signing. */
const INSPECTABLE: CostLine["kind"][] = ["hood", "grease-trap", "restrooms", "ada", "electrical", "gas", "sewer", "walk-in"];

/** "Kitchen hood" -> "kitchen hood", but "ADA restroom" stays. */
const lower = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

const sumRange = (rs: Range[]): Range => ({
  low: rs.reduce((t, r) => t + r.low, 0),
  mid: rs.reduce((t, r) => t + r.mid, 0),
  high: rs.reduce((t, r) => t + r.high, 0),
});

function lineCredits(a: SiteAnalysis): Ask[] {
  const budget = a.brief.budgetUsd;
  return a.xray.lines
    .filter((l) => l.status === "needed" && LANDLORD_SYSTEMS.includes(l.kind))
    .map((l) => {
      const big = l.kind === "hood" || (budget !== undefined && l.range.mid >= budget * 0.12);
      return {
        id: `credit-${l.id}`,
        kind: "line-credit" as const,
        title: `Landlord pays or credits: ${lower(l.label)}`,
        why: `The X-Ray finds no ${lower(l.label)} in the space and puts the cost at ${usdRange(l.range)} to you. It is part of the building, so ask the landlord to install it or credit the cost.`,
        value: l.range,
        basis: "one-time" as const,
        priority: big ? ("high" as const) : ("medium" as const),
        source: l.source,
      };
    });
}

function tiAllowance(site: Site, a: SiteAnalysis): Ask | null {
  const budget = a.brief.budgetUsd;
  if (budget === undefined) return null;
  const gapMid = a.xray.total.mid - budget;
  if (gapMid <= 0) return null;
  const sf = site.space.sf;
  const value: Range = { low: gapMid, mid: gapMid, high: Math.max(gapMid, a.xray.total.high - budget) };
  const perSf = (n: number) => `$${num(n / sf, 2)}`;
  return {
    id: "ti-allowance",
    kind: "ti-allowance",
    title: `Tenant-improvement allowance of ${perSf(value.low)}/SF`,
    why: `The X-Ray puts opening at ${usdRange(a.xray.total)} (midpoint ${usd(a.xray.total.mid)}) against your ${usd(budget)} budget, a gap of ${usd(gapMid)}. Over ${num(sf)} SF that is ${perSf(value.low)}/SF at the midpoint, up to ${perSf(value.high)}/SF at the high end. Line-item credits count toward this; ask for whichever is larger, not both.`,
    value,
    basis: "one-time",
    priority: "high",
    source: "Estimate: X-Ray total midpoint minus your budget",
  };
}

function freeRent(a: SiteAnalysis): Ask {
  const t = a.timeToOpen;
  const monthly = a.occupancy.annualUsd.mid / 12;
  const months = Math.ceil(t.months.high);
  return {
    id: "free-rent",
    kind: "free-rent",
    title: `Free rent until permits issue (up to ${months} months)`,
    why: `Getting open takes ${t.months.low}-${t.months.high} months, and you owe about ${usd(monthly)} a month in occupancy the whole time with no sales. That dead rent is ${usdRange(t.deadRentUsd)}. Ask for rent to start when permits issue or the space opens, whichever is first.`,
    value: t.deadRentUsd,
    basis: "one-time",
    priority: t.deadRentUsd.mid >= 40_000 ? "high" : "medium",
    source: t.basis,
  };
}

/** Largest annual occupancy at which break-even reads "comfortable", by bisection on the real break-even model. */
function comfortableOccupancy(a: SiteAnalysis, seats: number): number {
  const base = a.scenarios.scenarios.base.annualSalesUsd;
  const strong = a.scenarios.scenarios.strong.annualSalesUsd;
  const ok = (occ: number) =>
    breakeven({ annualOccupancyUsd: occ, seats, concept: a.brief.concept, caseSalesUsd: { base, strong } }).verdict ===
    "comfortable";
  let lo = 0;
  let hi = a.occupancy.annualUsd.mid;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) lo = m;
    else hi = m;
  }
  return lo;
}

function rentLevel(site: Site, a: SiteAnalysis): Ask | null {
  if (a.breakeven.verdict === "comfortable") return null;
  const { sf, rentPerSfYr } = site.space;
  if (rentPerSfYr === null) return null;
  const seats = operatedSeats(a.seats, a.brief);
  const rawTarget = comfortableOccupancy(a, seats) / sf - a.occupancy.extrasPerSfYr;
  // Round down to a quarter dollar; never ask for less than half of asking, because below that rent is not the problem.
  const target = Math.max(Math.floor(Math.min(rawTarget, rentPerSfYr) * 4) / 4, 0);
  const floor = rentPerSfYr * 0.5;
  const asked = Math.max(target, floor);
  if (asked >= rentPerSfYr) return null;
  const reaches = target >= floor;
  const annualAtAsk = (rentPerSfYr - asked) * sf;
  const annualAtTarget = (rentPerSfYr - target) * sf;
  const value: Range = {
    low: Math.min(annualAtAsk, annualAtTarget),
    mid: (annualAtAsk + annualAtTarget) / 2,
    high: Math.max(annualAtAsk, annualAtTarget),
  };
  const be = a.breakeven;
  return {
    id: "rent-level",
    kind: "rent-level",
    title: `Rent of $${num(asked, 2)}/SF/yr instead of $${num(rentPerSfYr, 2)}`,
    why:
      `At the asking rent you need ${num(be.coversPerDay)} covers a day, ${num(be.turnsPerDay, 1)} turns per seat, to break even, which the model rates ${be.verdict}. ` +
      (reaches
        ? `Break-even reads comfortable at about $${num(target, 2)}/SF/yr, so that is the target; it saves ${usd(annualAtAsk)} a year over ${num(sf)} SF.`
        : `Rent alone does not get this to comfortable (that would take about $${num(Math.max(rawTarget, 0), 2)}/SF/yr), but a cut to $${num(asked, 2)} is the most worth asking for; it saves ${usd(annualAtAsk)} a year.`),
    value,
    basis: "per-year",
    priority: be.verdict === "unlikely" ? "high" : "medium",
    source: "Estimate: break-even model re-run at lower rent",
    askedRentPerSfYr: asked,
  };
}

/** "123 Main St #4 (2,400 SF, $22/SF/yr, 0.3 km)" for the nearest comps. */
function compEvidence(r: SiteRent): string {
  return r.comps
    .slice(0, 3)
    .map((c) => `${c.address}${c.suite ? ` #${c.suite}` : ""} (${num(c.sf)} SF, $${num(c.rentNnnEquivPerSfYr, 2)}/SF/yr${c.serviceType === "GROSS" ? " NNN-equivalent" : ""}, ${num(c.distanceKm, 1)} km)`)
    .join("; ");
}

/**
 * Rent above the fair-rent model's 80% range: ask for the top of that range, citing the nearest comps. Only when the
 * ask is quoted on a basis the model can compare (basisUncertain bands are not trusted).
 */
function fairRent(site: Site): Ask | null {
  const r = rentFor(site.id);
  if (!r || r.band !== "above market" || r.basisUncertain) return null;
  const sf = site.space.sf;
  const asked = Math.floor(r.intervalHighPerSfYr * 4) / 4;
  if (asked >= r.askingNnnEquivPerSfYr) return null;
  const value: Range = { low: (r.askingNnnEquivPerSfYr - asked) * sf, mid: (r.askingNnnEquivPerSfYr - asked) * sf, high: (r.askingNnnEquivPerSfYr - r.fairRentPerSfYr) * sf };
  return {
    id: "rent-level",
    kind: "rent-level",
    title: `Rent of $${num(asked, 2)}/SF/yr instead of $${num(r.askingNnnEquivPerSfYr, 2)}`,
    why:
      `Foreground's fair-rent model puts a space like this at about $${num(r.fairRentPerSfYr, 2)}/SF/yr (80% range ${formatRentRange(r.intervalLowPerSfYr, r.intervalHighPerSfYr)}); the ask is above that range. ` +
      `Ask for the top of the range, $${num(asked, 2)}/SF/yr, which saves ${usd(value.low)} a year over ${num(sf)} SF` +
      (r.comps.length ? `. Nearest comparable asks: ${compEvidence(r)}.` : ".") +
      " This is asking rent and a rough estimate: lead with the comps, not the model.",
    value,
    basis: "per-year",
    priority: "high",
    source: "Estimate: fair-rent model (docs/ml/rent-model-card.md) and CoStar comparable spaces",
    askedRentPerSfYr: asked,
  };
}

function inspection(a: SiteAnalysis): Ask | null {
  const maybes = a.xray.lines.filter((l) => l.status === "maybe" && INSPECTABLE.includes(l.kind));
  if (maybes.length === 0) return null;
  const value = sumRange(maybes.map((l) => l.range));
  const names = maybes.map((l) => lower(l.label));
  const critical = maybes.some((l) => l.kind === "hood" || l.kind === "grease-trap");
  return {
    id: "inspection-contingency",
    kind: "inspection",
    title: "Contractor inspection period before signing",
    why: `The scan and listing cannot confirm: ${names.join(", ")}. If any is missing, the exposure is up to ${usdRange(value)} (the X-Ray counts these at half). Ask for a ${critical ? "30" : "14"}-day inspection period for your contractor, with the right to renegotiate or walk away at no cost if the findings differ.`,
    value,
    basis: "one-time",
    priority: critical ? "high" : "medium",
    source: "X-Ray lines marked Unknown",
  };
}

function history(site: Site): Ask | null {
  const gone = site.tenantHistory.filter((t) => t.isFood && t.sameSuite && !t.current && t.outcome !== "current");
  if (gone.length === 0) return null;
  const parts = gone.map((t) => {
    const when = monthYear(t.moveOut);
    const stay = t.years !== null ? `${t.years} year${t.years === 1 ? "" : "s"}` : null;
    const verb = t.outcome === "closed" ? "closed" : t.outcome === "moved" ? "moved out" : "left";
    return `${t.name} ${verb}${when ? ` in ${when}` : ""}${stay ? ` after ${stay}` : ""}`;
  });
  const closed = gone.filter((t) => t.outcome === "closed").length;
  const note = closed === 0 ? " None is recorded as closed, so the reason is not known." : "";
  return {
    id: "tenant-history",
    kind: "history",
    title: "Ask why the last food tenants left this suite",
    why: `${gone.length} food tenant${gone.length === 1 ? "" : "s"} left this suite: ${parts.join("; ")}.${note} Ask the landlord, in writing, why each left, what rent they paid, and whether any build-out or equipment is still in the space.`,
    value: null,
    basis: null,
    priority: closed > 0 || gone.length > 1 ? "medium" : "low",
    source: "CoStar tenant records",
  };
}

/** Ranked: priority first, then dollar value. */
export function buildAskList(site: Site, analysis: SiteAnalysis): Ask[] {
  // one rent ask: the break-even one, unless the fair-rent model shows a lower number is easier to defend (then the
  // fair-rent ask replaces it); when the break-even ask is already lower it keeps its figure and gains the comps
  const breakevenRent = rentLevel(site, analysis);
  const fair = fairRent(site);
  let rent = breakevenRent;
  if (fair && (!breakevenRent || breakevenRent.askedRentPerSfYr! > fair.askedRentPerSfYr!)) rent = fair;
  else if (fair && breakevenRent)
    rent = { ...breakevenRent, why: `${breakevenRent.why} Nearby comparable asks support this: ${compEvidence(rentFor(site.id)!)}.`, source: `${breakevenRent.source}; CoStar comparable spaces` };
  const asks = [
    tiAllowance(site, analysis),
    ...lineCredits(analysis),
    freeRent(analysis),
    rent,
    inspection(analysis),
    history(site),
  ].filter((x): x is Ask => x !== null);
  return asks.sort(
    (x, y) => PRIORITY_WEIGHT[y.priority] - PRIORITY_WEIGHT[x.priority] || (y.value?.mid ?? -1) - (x.value?.mid ?? -1),
  );
}
