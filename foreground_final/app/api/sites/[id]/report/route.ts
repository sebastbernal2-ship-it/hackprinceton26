import { z } from "zod";
import { analyzeSite } from "@/lib/engine";
import { rentFor } from "@/lib/ml/rent";
import { loadSite } from "@/lib/sites/load";
import { engineBrief } from "../../../../lib/server/site-match";
import type { CostReport } from "../../../../lib/cost-report";

const Body = z.object({
  brief: z
    .object({
      concept: z.enum(["quick-service", "fast-casual", "full-service", "cafe", "bar"]).optional(),
      seats: z.number().int().min(4).max(400).optional(),
      budgetUsd: z.number().int().min(1).max(50_000_000).optional(),
    })
    .nullish(),
});


/** POST { brief } -> CostReport: what this space costs to become the owner's restaurant (the engine's cost X-ray). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = loadSite(id);
  if (!site) return Response.json({ error: "Unknown site." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });

  const brief = engineBrief(parsed.data.brief, site);
  const a = analyzeSite(site, brief);
  const rent = rentFor(site.id);
  const report: CostReport = {
    siteId: site.id,
    concept: brief.concept,
    seats: a.seats.seats,
    lines: a.xray.lines.map((l) => ({ id: l.id, label: l.label, status: l.status, low: l.range.low, high: l.range.high, reason: l.reason, source: l.source })),
    total: a.xray.total,
    saved: a.xray.saved,
    overBudget: a.xray.overBudget,
    budgetUsd: brief.budgetUsd ?? null,
    occupancyPerMonth: { low: Math.round(a.occupancy.annualUsd.low / 12), high: Math.round(a.occupancy.annualUsd.high / 12) },
    fairRent: rent ? { band: rent.band, lowPerSfYr: rent.intervalLowPerSfYr, highPerSfYr: rent.intervalHighPerSfYr, askingPerSfYr: site.space.rentPerSfYr } : null,
    breakeven: { coversPerDay: a.breakeven.coversPerDay, turnsPerDay: a.breakeven.turnsPerDay, avgCheckUsd: a.breakeven.avgCheckUsd, verdict: a.breakeven.verdict },
    scenarios: (["slow", "base", "strong"] as const).map((name) => ({
      name,
      annualProfitUsd: a.scenarios.scenarios[name].annualProfitUsd,
      paybackYears: a.scenarios.scenarios[name].paybackYears,
    })),
    outlook: a.scenarios.verdict,
    timeToOpenMonths: { low: a.timeToOpen.months.low, high: a.timeToOpen.months.high },
    history: a.graveyard.summary,
    score: a.score.score,
    reasons: a.score.reasons,
    flags: a.score.flags,
  };
  return Response.json(report);
}
