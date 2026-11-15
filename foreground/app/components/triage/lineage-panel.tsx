"use client";

import { useEffect, useState } from "react";
import { fetchLineage, fetchPresence, presenceSplit, tenureBars, type LineageResult, type PresenceResult } from "../../lib/triage";

const BAR: Record<string, string> = {
  open: "bg-match",
  failure: "bg-accent",
  other_exit: "bg-foreground/35",
};

export default function LineagePanel({ listingId }: { listingId: number }) {
  const [state, setState] = useState<{ id: number; lineage: LineageResult | null; presence: PresenceResult | null } | null>(null);
  const [radius, setRadius] = useState("0.25mi");

  useEffect(() => {
    let live = true;
    Promise.all([fetchLineage(listingId), fetchPresence(listingId)]).then(([lineage, presence]) => live && setState({ id: listingId, lineage, presence }));
    return () => { live = false; };
  }, [listingId]);

  const cur = state?.id === listingId ? state : null;
  const L = cur?.lineage;
  const P = cur?.presence;
  const r = P?.radii?.[radius];
  const split = presenceSplit(r);
  const tl = L?.tenants.length ? tenureBars(L.tenants) : null;
  const prior = L?.marketPrior?.failureCumulativeIncidence?.["2"];

  return (
    <div className="mt-6" data-testid="lineage-panel">
      <h3 className="text-base font-medium tracking-tight">Restaurant lineage and day/night presence</h3>
      <p className="mt-1 text-xs text-foreground/50">Observed CoStar tenancy spells for kit-listed buildings only. Tenants are anonymized. Screening context, not a forecast.</p>
      {!cur && <p className="mt-2 text-sm text-foreground/50">Loading lineage.</p>}
      {cur && !L && <p className="mt-2 text-sm text-foreground/60">Lineage unavailable. Cannot say.</p>}
      {L && !L.foodHistoryInKit && <p className="mt-2 text-sm text-foreground/60" data-testid="lineage-none">{L.note}</p>}
      {L && tl && (
        <div className="mt-3">
          <ol className="space-y-1.5" aria-label="Tenure bars">
            {tl.bars.map((b) => (
              <li key={b.tenant} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
                <span className="truncate text-foreground/60" title={b.successorWasFood ? "A food tenant started within a year after this one ended" : undefined}>{b.tenant}{b.successorWasFood ? " ↳" : ""}</span>
                <div className="relative h-5 rounded bg-foreground/5" title={b.label}>
                  {b.unknownDates ? (
                    <span className="px-2 text-foreground/45">dates unknown</span>
                  ) : (
                    <div className={`absolute top-0 h-full rounded ${BAR[b.ending]}`} style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}>
                      <span className="sr-only">{b.label}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex justify-between pl-[4.8rem] text-[11px] text-foreground/45"><span>{tl.minYear}</span><span>{tl.maxYear}</span></div>
          <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-foreground/60">
            <span><i className="mr-1 inline-block h-2 w-3 rounded bg-match align-middle" />open</span>
            <span><i className="mr-1 inline-block h-2 w-3 rounded bg-accent align-middle" />ended: CoStar says closed or bankrupt</span>
            <span><i className="mr-1 inline-block h-2 w-3 rounded bg-foreground/35 align-middle" />ended: other exit (not failure)</span>
            <span>↳ a food tenant followed within a year</span>
          </p>
          <p className="mt-2 text-sm" data-testid="lineage-summary">
            {L.counts?.foodTenants} food tenants, {L.counts?.clearFailure} clear closures, {L.counts?.otherExit} other exits, {L.counts?.open} open.
            Median completed tenure {L.medianCompletedTenureYears ?? "cannot say"}{L.medianCompletedTenureYears != null ? " yr" : ""}
            {L.churnFlag ? " · churn flag (screening rule, unvalidated)" : ""}{L.isSecondGenerationSpace ? " · second-generation space" : ""}.
          </p>
          <p className="text-xs text-foreground/45">{L.medianTenureBasis}</p>
          {prior && (
            <p className="mt-1 text-xs text-foreground/55">
              Market context ({L.marketPrior?.label}): clear-closure incidence by 2 years {Math.round(prior.expected * 100)}% (95% interval {Math.round(prior.low * 100)}-{Math.round(prior.high * 100)}%).
              Not a prediction for this site.
            </p>
          )}
        </div>
      )}
      {P && (
        <div className="mt-4" data-testid="presence">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">Presence</span>
            {Object.keys(P.radii).map((k) => (
              <button key={k} type="button" onClick={() => setRadius(k)} aria-pressed={radius === k}
                className={`rounded-full px-2.5 py-0.5 text-xs ${radius === k ? "bg-foreground text-background" : "border border-foreground/20 text-foreground/60"}`}>{k.replace("mi", " mi")}</button>
            ))}
          </div>
          {split ? (
            <div className="group relative mt-2" tabIndex={0} aria-describedby="presence-tip">
              <div className="flex h-5 overflow-hidden rounded" role="img" aria-label={`Day ${split.dayPct} percent, night ${split.nightPct} percent`}>
                <div className="bg-accent/80 text-[11px] text-background" style={{ width: `${split.dayPct}%` }}>&nbsp;day {split.dayPct}%</div>
                <div className="bg-foreground/70 text-[11px] text-background" style={{ width: `${split.nightPct}%` }}>&nbsp;night {split.nightPct}%</div>
              </div>
              <div id="presence-tip" role="tooltip" className="invisible absolute left-0 top-7 z-10 w-full max-w-md rounded-lg border border-foreground/15 bg-panel p-3 text-xs shadow group-hover:visible group-focus:visible">
                <p className="font-medium">Assumptions</p>
                <ul className="mt-1 list-disc pl-4">{P.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                <p className="mt-1 text-foreground/60">{P.notAFootTrafficMeasure}</p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-foreground/60" data-testid="presence-unknown">Cannot say: day or night population is unobserved in the kit for this radius.</p>
          )}
          {r && (
            <p className="mt-1 text-xs text-foreground/55">
              Shape: {r.shape}. Day workers {r.day.workers ?? "cannot say"} (lower bound, {r.kitBuildingsInRadius} kit buildings; employee-count fill {r.day.employeeFillRate ?? "unknown"}).
              Night {r.night.nightPopulation ? `${r.night.nightPopulation.low}-${r.night.nightPopulation.high}, expected ${r.night.nightPopulation.expected} (assumed factors)` : "cannot say"}.
              Hover or focus the bar for assumptions. Not foot traffic.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
