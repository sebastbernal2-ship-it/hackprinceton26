import { analyzeSite, type OwnerBrief } from "@/lib/engine";
import { usd, usdRange } from "@/lib/format";
import { rentFor } from "@/lib/ml/rent";
import type { Site } from "@/lib/sites/schema";
import type { MessageOf } from "./types";

/** Everything of the `outlookChart` / `offerCta` message except `id` and `at`. */
export type OutlookPayload = Omit<MessageOf<"outlookChart">, "id" | "at">;
export type OfferCtaPayload = Omit<MessageOf<"offerCta">, "id" | "at">;

const r = (n: number) => Math.round(n);

/**
 * Pure: the numbers of the Business outlook message, all from the engine (analyzeSite) and the fair-rent model.
 * The Site comes from the filesystem, so on the client call the `getOutlook` server action (app/flow-actions.ts).
 */
export function buildOutlook(site: Site, brief: OwnerBrief): OutlookPayload {
  const a = analyzeSite(site, brief);
  const { base, slow, strong } = a.scenarios.scenarios;
  const profits = (s: typeof base) => s.years.map((y) => r(y.profitUsd)) as [number, number, number];
  const rent = rentFor(site.id);
  const asking = rent?.askingNnnEquivPerSfYr ?? site.space.rentPerSfYr ?? null;
  const fair = rent ? { low: rent.intervalLowPerSfYr, high: rent.intervalHighPerSfYr } : null;
  const even = a.breakeven;
  const seats = Math.min(a.seats.seats, brief.seats ?? a.seats.seats);

  const risks: string[] = [];
  if (rent && !rent.basisUncertain && rent.band === "above market") risks.push(`Asking rent is above the fair band, about ${usd(rent.gapPerYr)} a year over.`);
  if (even.verdict === "unlikely") risks.push(`Break-even needs ${even.turnsPerDay.toFixed(1)} turns a day on ${seats} seats.`);
  if (base.annualProfitUsd <= 0) risks.push("The base case does not turn a profit.");
  const unknown = a.xray.lines.filter((l) => l.status === "maybe").sort((x, y) => y.range.high - x.range.high)[0];
  if (unknown) risks.push(`${unknown.label}: unknown, up to ${usd(unknown.range.high)}. Ask the landlord.`);
  if (a.graveyard.closedHere > 0) risks.push(a.graveyard.summary);
  if (a.trend.rating === "headwind") risks.push("The block is trending the wrong way.");

  const read =
    base.annualProfitUsd > 0
      ? `Base case: about ${usd(base.annualProfitUsd)} a year profit, ${
          base.paybackYears ? `paid back in ${base.paybackYears.toFixed(1)} years` : "no payback"
        }. You need ${r(even.coversPerDay)} covers a day to break even, ${
          even.verdict === "comfortable" ? "comfortably within reach" : even.verdict === "stretch" ? "a stretch" : "unlikely on these seats"
        }.`
      : `At base sales this space does not clear its costs; break-even needs ${r(even.coversPerDay)} covers a day.`;

  const sources = [
    ...new Set([...a.scenarios.assumptions, ...even.assumptions].flatMap((c) => c.source.split(";").map((s) => s.trim()).filter(Boolean))),
  ].slice(0, 3);
  if (rent) sources.push("Foreground fair-rent model");

  return {
    kind: "outlookChart",
    siteId: site.id,
    read,
    scenarios: {
      slow: { profitByYearUsd: profits(slow) },
      base: { profitByYearUsd: profits(base) },
      strong: { profitByYearUsd: profits(strong) },
    },
    breakevenCoversPerDay: r(even.coversPerDay),
    seats,
    turnsPerDay: Math.round(even.turnsPerDay * 10) / 10,
    rentAskingPerSfYr: asking,
    rentFairPerSfYr: fair,
    verdict: even.verdict,
    risks: risks.slice(0, 3),
    sources,
  };
}

/** the printable deal memo, computed for the owner's own concept, seats and budget (not the engine defaults) */
export function memoHref(siteId: string, brief: OwnerBrief): string {
  const q = new URLSearchParams({ concept: brief.concept });
  if (brief.seats != null) q.set("seats", String(Math.round(brief.seats)));
  if (brief.budgetUsd != null) q.set("budget", String(Math.round(brief.budgetUsd)));
  return `/site/${siteId}/offer?${q.toString()}`;
}

export function buildOfferCta(site: Site, brief: OwnerBrief): OfferCtaPayload {
  const a = analyzeSite(site, brief);
  return {
    kind: "offerCta",
    siteId: site.id,
    summary: `${site.address}: all-in about ${usdRange(a.xray.total)}. I can draft your offer email to the landlord with the questions that matter.`,
    label: "Draft my offer",
    memoHref: memoHref(site.id, brief),
    state: "idle",
  };
}
