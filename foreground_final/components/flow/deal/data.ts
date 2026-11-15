import type { Range, SiteAnalysis } from "@/lib/engine/types";
import { usdRange } from "@/lib/format";
import type { Assessment } from "@/lib/feasibility";
import type { Ask } from "@/lib/outputs/ask-list";
import { weeksToOpen } from "../overview/data";

export type Step = { id: string; label: string; detail: string; weeks: { low: number; high: number } | null; source: string };

const wk = (r: { low: number; high: number }) => ({ low: Math.round(r.low), high: Math.round(r.high) });

/**
 * The timeline under the documents, in order: the offer, each permit the plan triggers (from the last `assess`),
 * the build-out, and the opening, with the engine's months-to-open as the overall range. Pure.
 */
export function nextSteps(assessment: Pick<Assessment, "permits" | "time" | "city">, timeToOpen: SiteAnalysis["timeToOpen"]): Step[] {
  const steps: Step[] = [{ id: "offer", label: "Send the offer and the asks", detail: "The landlord answers the asks before you spend on drawings.", weeks: null, source: "Your offer letter" }];
  for (const p of assessment.permits) steps.push({ id: p.id, label: p.label, detail: p.agency, weeks: wk(p.weeks), source: p.source.label });
  if (assessment.time.workWeeks.high > 0)
    steps.push({ id: "build", label: "Build-out", detail: "Kitchen, finishes and inspections.", weeks: wk(assessment.time.workWeeks), source: assessment.time.basis });
  const open = weeksToOpen(timeToOpen);
  steps.push({ id: "open", label: "Open the doors", detail: `About ${timeToOpen.months.low} to ${timeToOpen.months.high} months from the lease.`, weeks: open, source: timeToOpen.basis });
  return steps;
}

/** the one line the letter folds into when the owner copies it, built from state */
export function sealLine(input: { address: string; seats: number; total: Range; timeToOpen: SiteAnalysis["timeToOpen"] }): string {
  const w = weeksToOpen(input.timeToOpen);
  return `${input.address} - ${input.seats} seats - all-in ${usdRange(input.total)} - open in ~${w.low} to ${w.high} weeks`;
}

/** mailto: link carrying the letter; null when it would be too long for a mail client to take */
export function mailtoHref(subject: string, body: string): string | null {
  const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return href.length > 6000 ? null : href;
}

/** the asks that go in the letter: the checked ones, in priority order */
export function checkedIds(asks: Ask[], unchecked: ReadonlySet<string>): string[] {
  return asks.filter((a) => !unchecked.has(a.id)).map((a) => a.id);
}
