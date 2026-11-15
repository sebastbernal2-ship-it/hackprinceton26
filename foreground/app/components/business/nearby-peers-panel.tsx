"use client";

import { useEffect, useState } from "react";
import {
  KIND_LABEL, OUTCOME_LABEL, chipFor, distanceText, fetchBusinessPeers, indexBand, intervalText, outcomeCounts, pct, topNeighbours,
  type BusinessPeers, type Chip,
} from "../../lib/business-peers";
import PeerRings from "./peer-rings";

const CHIP_STYLE: Record<Chip, string> = {
  observed: "border-match/50 bg-match-soft text-match",
  estimated: "border-foreground/25 bg-foreground/5 text-foreground/70",
  derived: "border-foreground/25 bg-foreground/5 text-foreground/70",
  demo: "border-accent/60 bg-accent/10 text-accent",
};
const Tag = ({ chip }: { chip: Chip }) => (
  <span className={`ml-1.5 inline-block rounded-full border px-1.5 py-px align-middle text-[10px] font-medium uppercase tracking-wide ${CHIP_STYLE[chip]}`} data-testid={`tag-${chip}`}>{chip === "demo" ? "DEMO" : chip}</span>
);
const OUTCOME_DOT: Record<string, string> = { open: "bg-match", closed: "bg-accent", moved: "bg-foreground/40" };

export default function NearbyPeersPanel({ listingId }: { listingId: number }) {
  const [state, setState] = useState<{ id: number; data: BusinessPeers | null } | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    fetchBusinessPeers(listingId).then((data) => live && setState({ id: listingId, data }));
    return () => { live = false; };
  }, [listingId]);

  const cur = state?.id === listingId ? state : null;
  const d = cur?.data ?? null;
  const k = d?.knn;
  const nb = d?.neighbourhood ?? null;
  const knnDemo = k?.status === "demo";
  const neighbours = k?.neighbours ?? [];
  const shown = all ? topNeighbours(neighbours, neighbours.length) : topNeighbours(neighbours, 8);
  const counts = nb ? outcomeCounts(nb.nearbyFood) : null;

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="peers-title" data-testid="nearby-peers">
      <h2 id="peers-title" className="text-lg font-medium tracking-tight">Nearby businesses: peers and competition</h2>
      <p className="mt-1 text-xs text-foreground/55">
        How food businesses near this site fared (CoStar tenancy records for kit-listed buildings, anonymised), and a transparent context index: successful businesses
        nearby help, a direct competitor right next door hurts, competitors elsewhere in the region are information. Context, not a forecast or a fit score.
      </p>
      {!cur && <p className="mt-3 text-sm text-foreground/50">Loading nearby businesses.</p>}
      {cur && !d && <p className="mt-3 text-sm text-foreground/60" data-testid="peers-unavailable">Cannot say: the business-peers analysis is not built or did not answer for this site.</p>}
      {d && k && (
        <>
          {d.demo && (
            <p role="note" className="mt-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm" data-testid="peers-demo-note">
              <Tag chip="demo" />{d.demoNote ?? "DEMO DATA: some nearby businesses below are invented for the demo site."}
            </p>
          )}

          <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
            <div>
              {nb ? (
                <>
                  <PeerRings items={nb.nearbyFood} adjacentM={nb.config.adjacent_m} />
                  <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-foreground/65" aria-label="Diagram legend">
                    <li><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-match align-middle" />open</li>
                    <li><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-accent align-middle" />closed</li>
                    <li><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-foreground/40 align-middle" />moved / other exit</li>
                    <li><i className="mr-1 inline-block h-2.5 w-2.5 bg-foreground/60 align-middle" />direct competitor</li>
                    <li><i className="mr-1 inline-block h-2.5 w-2.5 rotate-45 bg-foreground/60 align-middle" />partial</li>
                    <li><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-foreground/60 align-middle" />other food</li>
                    <li><i className="mr-1 inline-block h-2.5 w-2.5 bg-accent/30 align-middle" />too-close zone</li>
                  </ul>
                  {counts && (
                    <p className="mt-1 text-center text-xs text-foreground/55" data-testid="ring-counts">
                      {nb.nearbyFood.length >= 60 ? "The nearest 60" : nb.nearbyFood.length} food businesses within {nb.config.region_mi} mi: {counts.open} open, {counts.closed} closed, {counts.moved} moved; {counts.direct} direct competitors.
                      {nb.nearbyFood.some((f) => f.demo) && <> Dashed outlines are DEMO.</>}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-foreground/60" data-testid="peers-no-location">Cannot say: this site has no coordinates on file, so there is no ring diagram or neighbourhood index. Only the market-level prior below applies.</p>
              )}
            </div>

            <div>
              {nb && (
                <div data-testid="neighbourhood-index">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h3 className="text-sm font-medium">Neighbourhood context index<Tag chip={chipFor("index", nb.status === "demo")} /></h3>
                    {nb.index != null ? <span className="text-2xl font-medium tabular-nums">{nb.index.toFixed(0)}<span className="text-sm text-foreground/50"> / 100</span></span> : <span className="text-sm text-foreground/60">cannot say (nothing within 1 mi in the kit)</span>}
                    {nb.index != null && <span className="text-xs text-foreground/55">{indexBand(nb.index)}; 50 is neutral</span>}
                  </div>
                  <p className="mt-1 text-xs text-foreground/50">{nb.label}</p>
                  {nb.adjacentCompetitor && (
                    <p role="alert" className="mt-2 rounded-lg border border-accent/60 bg-accent/10 px-3 py-2 text-sm font-medium" data-testid="adjacent-warning">
                      Adjacent competitor: {nb.warnings.find((w) => w.code === "adjacent_competitor")?.text}
                    </p>
                  )}
                  {nb.warnings.filter((w) => w.code !== "adjacent_competitor").map((w) => (
                    <p key={w.code} className="mt-1 text-xs text-foreground/60" data-testid={`warn-${w.code}`}>Notice: {w.text}</p>
                  ))}
                  <ul className="mt-2 space-y-1.5 text-sm" aria-label="Index drivers" data-testid="index-drivers">
                    {nb.drivers.map((dr) => (
                      <li key={dr.name} className="grid grid-cols-[3.6rem_1fr] gap-2">
                        <span className={`tabular-nums font-medium ${dr.points < 0 ? "text-accent" : "text-match"}`}>{dr.points > 0 ? "+" : ""}{dr.points.toFixed(1)}</span>
                        <span><span className="font-medium">{dr.name}.</span> <span className="text-foreground/65">{dr.detail}</span></span>
                      </li>
                    ))}
                    {nb.drivers.length === 0 && <li className="text-foreground/60">No drivers: no kit data near this site.</li>}
                  </ul>
                  <p className="mt-1 text-xs text-foreground/50">
                    Direct competitors within {nb.bands["0.25mi"]?.directCompetitorsOpen ?? 0} / {nb.bands["0.5mi"]?.directCompetitorsOpen ?? 0} / {nb.bands["1mi"]?.directCompetitorsOpen ?? 0} (0.25 / 0.5 / 1 mi);
                    successful non-competing businesses {nb.bands["0.25mi"]?.successfulNonCompeting ?? 0} / {nb.bands["0.5mi"]?.successfulNonCompeting ?? 0} / {nb.bands["1mi"]?.successfulNonCompeting ?? 0}.
                    {nb.nearestDirectCompetitorM != null && <> Nearest open direct competitor {nb.nearestDirectCompetitorM >= 1609 ? `${(nb.nearestDirectCompetitorM / 1609.344).toFixed(1)} mi` : `${nb.nearestDirectCompetitorM} m`}.</>}
                  </p>
                  <details className="mt-2 rounded-lg border border-foreground/15 p-2 text-xs">
                    <summary className="cursor-pointer font-medium">Thresholds, sensitivity and sources</summary>
                    <p className="mt-1.5">{nb.optimumBand}</p>
                    <p className="mt-1.5">Adjacent = within {nb.config.adjacent_m} m. {nb.sources}</p>
                    {nb.sensitivity && (
                      <>
                        <p className="mt-1.5 font-medium">Sensitivity: index {nb.sensitivity.range ? `${nb.sensitivity.range[0].toFixed(0)}-${nb.sensitivity.range[1].toFixed(0)}` : "n/a"} across alternative thresholds{nb.sensitivity.warningStable ? "; adjacency warning unchanged" : "; adjacency warning changes with the threshold"}.</p>
                        <ul className="mt-1 columns-1 sm:columns-2">
                          {nb.sensitivity.variants.map((v) => <li key={v.name}>{v.name}: {v.index == null ? "n/a" : v.index.toFixed(0)}{v.adjacentCompetitor ? " (adjacent flag)" : ""}</li>)}
                        </ul>
                      </>
                    )}
                  </details>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6" data-testid="knn-summary">
            <h3 className="text-sm font-medium">How comparable food businesses fared<Tag chip={chipFor("aggregate", knnDemo)} /></h3>
            <p className="mt-1 text-xs text-foreground/55">
              {k.mode === "market_prior_only" ? "No coordinates for this site: the same-market average over all kit food tenancies, with no neighbours." :
                `Weighted over the ${k.nNeighbours} most similar kit food tenancies (nearest ${distanceText(k.nearestMi ?? 0)}, furthest ${distanceText(k.farthestMi ?? 0)}; effective ${k.effectiveN?.toFixed(0)}). Intervals are 5th-95th percentile bootstrap over neighbours.`}
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[26rem] text-left text-sm" data-testid="survival-table">
                <thead className="text-xs text-foreground/50"><tr><th className="py-1 pr-3 font-normal">Still operating after</th><th className="pr-3 font-normal">Neighbours</th><th className="font-normal">Same-market prior</th></tr></thead>
                <tbody>
                  {["1", "2", "3", "5"].map((h) => k.survival[h] && (
                    <tr key={h} className="border-t border-foreground/10">
                      <td className="py-1.5 pr-3">{h} year{h === "1" ? "" : "s"}</td>
                      <td className="pr-3 tabular-nums">{intervalText(k.survival[h])}{k.survival[h].source && !k.survival[h].evaluable && <span className="text-xs text-foreground/45"> (prior used: few neighbours observed this long)</span>}</td>
                      <td className="tabular-nums text-foreground/60">{k.marketPrior ? pct(k.marketPrior.survival[h]) : "-"}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-foreground/10"><td className="py-1.5 pr-3">Closed within 2 years</td><td className="pr-3 tabular-nums">{intervalText(k.closure2y)}</td><td className="tabular-nums text-foreground/60">{k.marketPrior ? pct(k.marketPrior.closure2y) : "-"}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-sm" data-testid="knn-extra">
              {k.shareStillOpen && <>Share of neighbours still open: {intervalText(k.shareStillOpen)}. </>}
              {k.medianCompletedTenureYears && <>Median tenure of ended tenancies: {intervalText(k.medianCompletedTenureYears, false)} <span className="text-xs text-foreground/50">(biased short: open tenancies excluded)</span>. </>}
              {k.medianTenureKM != null && <>Kaplan-Meier median tenure {k.medianTenureKM} y. </>}
              {k.sameKind && k.sameKind.n > 0 && <>Same-kind neighbours: {k.sameKind.n} ({k.sameKind.open} open, {k.sameKind.closed} closed, {k.sameKind.moved} moved).</>}
            </p>
            {k.evaluation && (
              <p role="note" className="mt-2 rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2 text-xs" data-testid="knn-evaluation">
                <span className="font-medium">Evaluation, stated plainly.</span> {k.evaluation.plainly} Held-out {k.evaluation.heldOutWindow[0]}-{k.evaluation.heldOutWindow[1]} starts ({k.evaluation.nTargets} tenancies, {k.evaluation.nClosed2y} closures within 2 years):
                Brier for closure {k.evaluation.closure2y.brierKnn.toFixed(3)} vs prior {k.evaluation.closure2y.brierMarketPrior.toFixed(3)}; for any end within 2 years {k.evaluation.ended2y.brierKnn.toFixed(3)} vs prior {k.evaluation.ended2y.brierMarketPrior.toFixed(3)} (lower is better). {k.evaluation.verdict.join(" ")}
              </p>
            )}
          </div>

          {neighbours.length > 0 && (
            <div className="mt-6" data-testid="neighbour-table">
              <h3 className="text-sm font-medium">Neighbours used<Tag chip="observed" /></h3>
              <p className="mt-1 text-xs text-foreground/55">Anonymised CoStar tenancies. &quot;Same kind&quot; means the kind inferred from the company name matches the concept (a heuristic, unverified).</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead className="text-foreground/50"><tr><th className="py-1 pr-3 font-normal">Peer</th><th className="pr-3 font-normal">Distance</th><th className="pr-3 font-normal">Same kind</th><th className="pr-3 font-normal">Kind</th><th className="pr-3 font-normal">Outcome</th><th className="pr-3 font-normal">Tenure</th><th className="pr-3 font-normal">Opened</th><th className="font-normal">Weight</th></tr></thead>
                  <tbody>
                    {shown.map((n) => (
                      <tr key={n.id} className="border-t border-foreground/10" data-testid="neighbour-row">
                        <td className="py-1.5 pr-3 tabular-nums">{n.id}{n.demo && <Tag chip="demo" />}</td>
                        <td className="pr-3 tabular-nums">{distanceText(n.distanceMi)}</td>
                        <td className="pr-3">{n.sameKind ? "yes" : n.relation === "partial" ? "partly" : "no"}</td>
                        <td className="pr-3">{KIND_LABEL[n.kind] ?? n.kind}</td>
                        <td className="pr-3"><i className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${OUTCOME_DOT[n.outcome]}`} />{OUTCOME_LABEL[n.outcome]}</td>
                        <td className="pr-3 tabular-nums">{n.years.toFixed(1)} y</td>
                        <td className="pr-3 tabular-nums">{n.startYear}</td>
                        <td className="tabular-nums">{(n.weight * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {neighbours.length > 8 && (
                <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 rounded-full border border-foreground/20 px-3 py-1 text-xs text-foreground/70" aria-expanded={all}>
                  {all ? "Show the nearest 8" : `Show all ${neighbours.length}`}
                </button>
              )}
            </div>
          )}
          {d.coverage && <p className="mt-3 text-xs text-foreground/45" data-testid="peers-coverage">{d.coverage.kitBuildingsWithin1mi} kit buildings and {d.coverage.tenanciesWithin1mi} tenancies within 1 mi. {d.coverage.note}</p>}
          <p className="mt-1 text-xs text-foreground/45">{d.notice}</p>
          <details className="mt-1 text-xs text-foreground/50"><summary className="cursor-pointer">Where each label comes from</summary>
            <ul className="mt-1 list-disc pl-4">{Object.entries(d.labels).map(([a, b]) => <li key={a}><span className="font-medium">{a}</span>: {b}</li>)}</ul>
          </details>
          <p className="mt-1 text-xs text-foreground/40">Direct competitors are same-kind food businesses; partial substitutes are related kinds; everything else is a complement or general draw.</p>
        </>
      )}
    </section>
  );
}
