// Pure helpers behind the Quantify page: input parsing, request identity, and before/after deltas.
// No network and no React here so the wiring (which input changes which request or number) is unit-tested.
import type { Range } from "./cost-side";
import { budgetStatus } from "./cost-side";

/** Positive number from typed text, else null (empty, zero, negative and NaN are all "not entered"). */
export function parsePositive(text: string | null | undefined): number | null {
  const n = Number(text);
  return text != null && text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Seats: a whole number 1..500, else null. */
export function parseSeats(text: string): number | null {
  const n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
}

/** Seat count to prefill: the 3D layout's count, else the planner's, else empty. */
export const defaultSeats = (layoutSeats: number | null | undefined, plannerSeats: number): string =>
  layoutSeats && layoutSeats > 0 ? String(layoutSeats) : plannerSeats > 0 ? String(plannerSeats) : "";

/** Area to prefill: the shared planner area when set, else the listing's own area (an editable assumption), else empty. */
export const defaultArea = (shared: string, listingSqft: number | undefined): string =>
  parsePositive(shared) ? shared : listingSqft && listingSqft > 0 ? String(Math.round(listingSqft)) : "";

/** Budget in effect: what was typed (even if cleared to empty = none), else the intake brief's budget. */
export const resolveBudget = (typed: string | null, fromBrief: number | null): number | null => (typed !== null ? parsePositive(typed) : fromBrief);

/** The rent part of a total-cost request: an own rate overrides; a named option is sent by id; "own" without a rate falls back to default. */
export function rentRequest(source: string | null, ownRate: string): { rent: number | null; rentSource: string | null } {
  if (source === "own") return { rent: parsePositive(ownRate), rentSource: null };
  return { rent: null, rentSource: source };
}

export type TotalCostInputs = { pid: number | null; sqft: number | null; source: string | null; ownRate: string; months: number; fromLayout: boolean };
/** Identity of a total-cost request. Every input that changes the answer must appear here or the page shows a stale result. */
export const totalCostKey = (i: TotalCostInputs): string | null =>
  i.pid ? JSON.stringify([i.pid, i.sqft, rentRequest(i.source, i.ownRate), i.months, i.fromLayout]) : null;

/** All-in build-out: priced pieces and fit-out (p5 to p95) plus the hidden systems counted at their share. */
export const allInRange = (buildout: { p5: number; p95: number } | null, hidden: Range): Range | null =>
  buildout ? { low: buildout.p5 + hidden.low, high: buildout.p95 + hidden.high } : null;

export const mid = (r: Range | null | undefined): number | null => (r ? (r.low + r.high) / 2 : null);

/** Budget less the middle of the all-in range: positive is headroom, negative is overrun. */
export const budgetGap = (allIn: Range | null, budget: number | null): number | null => (allIn && budget ? budget - (allIn.low + allIn.high) / 2 : null);

export { budgetStatus };

/** Change between two settled values; null when there is no earlier value or the rounded values are equal. */
export function delta(prev: number | null | undefined, next: number | null | undefined): number | null {
  if (prev == null || next == null) return null;
  const d = Math.round(next) - Math.round(prev);
  return d === 0 ? null : d;
}

const usd0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
/** "+$12,400" / "-$3,000"; months use fmtDeltaMonths. */
export const fmtDelta = (d: number): string => `${d > 0 ? "+" : "-"}$${usd0.format(Math.abs(d))}`;
export const fmtDeltaMonths = (d: number): string => `${d > 0 ? "+" : "-"}${Math.abs(d)} mo`;

/** Per-line changes between two responses, keyed by line id: "new" for a line that was not there, else the change in its midpoint. */
export function lineDeltas(prev: Record<string, number> | null, next: Record<string, number>): Record<string, number | "new"> {
  const out: Record<string, number | "new"> = {};
  if (!prev) return out;
  for (const [id, v] of Object.entries(next)) {
    if (!(id in prev)) out[id] = "new";
    else {
      const d = delta(prev[id], v);
      if (d !== null) out[id] = d;
    }
  }
  return out;
}

export type Inputs = { seats: string; area: string; budget: string; rent: string; period: number; kit: number };
const LABEL: Record<keyof Inputs, string> = { seats: "Seats", area: "Area", budget: "Budget", rent: "Rent basis", period: "Period (months)", kit: "Equipment pieces" };
/** Human text for what the person just changed, for the "recalculated" line. Null when nothing differs. */
export function describeChange(prev: Inputs, next: Inputs): string | null {
  const parts = (Object.keys(LABEL) as (keyof Inputs)[]).filter((k) => prev[k] !== next[k]).map((k) => `${LABEL[k]} ${prev[k] || "none"} to ${next[k] || "none"}`);
  return parts.length ? parts.join(", ") : null;
}

/** Break-even wording: base-case payback in months. */
export function paybackText(months: number | null): string {
  return months === null ? "No payback at these seats" : months > 120 ? "Over 10 years" : `${months} months`;
}
