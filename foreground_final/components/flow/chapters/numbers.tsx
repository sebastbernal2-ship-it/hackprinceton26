"use client";

import { useMemo } from "react";
import { usd } from "@/lib/format";
import { rentFor } from "@/lib/ml/rent";
import { cn } from "@/lib/utils";
import { Card } from "../card";
import { useDeal } from "../deal-context";
import { BreakevenDial } from "../numbers/dial";
import { profitSeries, risksFor, sourcesFor } from "../numbers/data";
import { ScenarioChart } from "../numbers/scenario-chart";
import { WillItFill } from "../numbers/will-it-fill";
import { rentView } from "../overview/data";
import { ChapterFrame } from "./chapter-frame";
import type { ChapterProps } from "./types";

/**
 * Chapter 5: the numbers for the plan as drawn. The scenario chart, the break-even dial, the rent against its fair
 * band, "Will it fill?" and the risks. Everything reads `impact` from the deal, so an edited layout moves it.
 */
export function NumbersChapter({ status, onRetry }: ChapterProps) {
  const deal = useDeal();
  const rent = useMemo(() => (deal ? rentFor(deal.site.id) : null), [deal]);
  if (!deal) {
    return <ChapterFrame step={5} title="Numbers" lede="Working out three scenarios for your plan." will={[]} live={null} status={status} onRetry={onRetry} />;
  }
  const { impact, layout } = deal;
  const series = profitSeries(impact);
  const risks = risksFor(impact, rent);
  const covers = Math.max(1, Math.round(impact.breakeven.coversPerDay));
  const rv = rent ? rentView(rent) : null;
  return (
    <section aria-label="The numbers" className="pointer-events-none grid h-full min-h-0 grid-cols-[1.55fr_1fr] gap-3 pt-14 [grid-template-rows:minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Profit by year, three scenarios" source={sourcesFor(impact, rent).join("; ")} index={0}>
        <p className="mb-1 line-clamp-2 text-xs text-text-2">{impact.scenarios.verdict}</p>
        <ScenarioChart series={series} />
      </Card>
      <Card title="Break-even" source="Foreground break-even model, benchmarks.json" index={1}>
        <BreakevenDial concept={layout.concept} covers={covers} turns={impact.breakeven.turnsPerDay} seats={impact.seatsUsed} verdict={impact.breakeven.verdict} />
      </Card>
      <Card title="Will it fill?" source="Foreground layout engine, simulateDay at break-even covers" index={2}>
        <WillItFill layout={layout} concept={layout.concept} covers={covers} />
      </Card>
      <Card title="Rent and risks" source={rent ? `Foreground fair-rent model, NNN basis` : "CoStar listing"} index={3}>
        {rv ? (
          <>
            <p className="text-sm text-text">
              Asking ${rv.asking.toFixed(0)} against a fair band of ${rv.low.toFixed(0)} to ${rv.high.toFixed(0)} /SF/yr.
            </p>
            <div className="relative mt-3 h-2 rounded-full bg-[oklch(1_0_0/0.08)]" aria-hidden>
              <span className="absolute inset-y-0 rounded-full bg-live-wash outline outline-1 outline-live" style={{ left: `${rv.pLow}%`, width: `${rv.pHigh - rv.pLow}%` }} />
              <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-text" style={{ left: `${rv.pAsk}%` }} />
            </div>
            <p className={cn("mt-2 text-xs", rv.uncertain ? "text-maybe" : rv.band === "above market" ? "text-needed" : rv.band === "below market" ? "text-saved" : "text-text-2")}>
              {rv.uncertain ? "Quoted gross: the band is shaky." : rv.band === "in line" ? "In line with the band." : `${usd(Math.abs(rv.gapPerYr))} a year ${rv.band === "above market" ? "above" : "below"} the band.`}
            </p>
          </>
        ) : (
          <p className="text-sm text-maybe">Fair-rent estimate: not in the data</p>
        )}
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-text-2">
          {risks.length ? risks.map((r) => <li key={r}>{r}</li>) : <li>No risk the model can name for this plan.</li>}
        </ul>
      </Card>
    </section>
  );
}
