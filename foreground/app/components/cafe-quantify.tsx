"use client";

import { useEffect, useMemo, useState } from "react";
import type { Asset } from "../lib/assets";
import { buildDiligence } from "../lib/act";
import { useBrief } from "../lib/brief";
import { fetchLayoutCost, fitSummary, freshResponse, layoutCostItems, nameFor, pct, scenarioKey, type LayoutCost } from "../lib/layout-cost";
import { range } from "../lib/total-cost";
import ActChecklist from "./act-checklist";

type Props = {
  kit: Asset[];
  onKit: (items: Asset[]) => void;
  area: string;
  onArea: (v: string) => void;
  linkedBuilding: boolean;
};

const input = "mt-1 w-40 rounded-lg border border-foreground/20 bg-background px-3 py-2 tabular-nums";

/**
 * Quantify and Re-plan for a café scan: costs come from the pieces actually placed in the layout (POST /api/layout-cost).
 * Unpriced pieces and exclusions are listed, never $0. Re-plan changes an assumption (budget, area, piece count) and shows
 * the saved baseline next to the new P(over budget), computed by the API, not by the page.
 */
export default function CafeQuantify({ kit, onKit, area, onArea, linkedBuilding }: Props) {
  const brief = useBrief();
  const [budget, setBudget] = useState("");
  const [stored, setStored] = useState<{ key: string; data: LayoutCost } | null>(null);
  const [failed, setFailed] = useState(false);
  const [baseline, setBaseline] = useState<{ p: number | null; budget: string; area: string; pieces: number; median: number | null } | null>(null);

  const sqft = Number(area) > 0 ? Number(area) : null;
  const budgetN = Number(budget) > 0 ? Number(budget) : null;
  const items = useMemo(() => layoutCostItems(kit), [kit]);
  const key = scenarioKey(items, sqft, budgetN);
  // Show a response only for the scenario that produced it: while inputs change and the request is in flight, nothing old is shown.
  const data = freshResponse(stored, key);
  const recalculating = items.length > 0 && data === null && !failed;
  const fit = useMemo(() => fitSummary(kit, sqft), [kit, sqft]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      fetchLayoutCost(items, sqft, budgetN).then(
        (d) => { if (live) { setStored({ key, data: d }); setFailed(false); } },
        () => { if (live) { setStored(null); setFailed(true); } },
      );
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [items, sqft, budgetN, key]);

  const unpricedNames = (data?.unpriced ?? []).map((u) => nameFor(kit, u.assetId));
  const diligence = buildDiligence({ unpricedPieces: unpricedNames, assumedArea: sqft !== null, linkedBuilding });
  const changed = (a: Asset, delta: 1 | -1) => {
    if (delta === 1) return onKit([...kit, a]);
    const i = kit.findLastIndex((k) => k.assetId === a.assetId);
    if (i >= 0) onKit(kit.filter((_, j) => j !== i));
  };
  const distinct = [...new Map(kit.map((a) => [a.assetId, a])).values()];

  return (
    <>
      <section className="mt-8 rounded-[1.75rem] border border-foreground/15 p-6 sm:p-8" aria-labelledby="lc-title" data-testid="layout-cost">
        <h2 id="lc-title" className="text-lg font-medium tracking-tight">Layout cost</h2>
        <p className="mt-1 text-sm text-foreground/55">
          Priced from the pieces you selected for this layout. Ranges, not quotes. Install, freight, permits and repairs are not included.
        </p>
        {kit.length > 0 && fit.noFloor && (
          <p className="mt-3 text-xs text-foreground/60" data-testid="fit-warning">No floor area entered, so fit is not tested: all {fit.total} selected pieces are priced as selected.</p>
        )}
        {fit.unplaced.length > 0 && (
          <p className="mt-3 text-xs text-foreground/60" data-testid="fit-warning">
            {fit.unplaced.length} of {fit.total} selected pieces do not fit the assumed floor ({fit.unplaced.map((u) => u.name).join(", ")}). They are still priced here as selected; remove them or enlarge the area to match your layout.
          </p>
        )}
        {recalculating && <p role="status" className="mt-3 text-xs text-foreground/50">Updating the estimate for your changes...</p>}
        {failed && <p role="alert" className="mt-4 text-sm text-foreground/60">Pending: the cost service did not answer. Nothing below is zero; it is unknown.</p>}
        {kit.length === 0 && (
          <p className="mt-4 text-sm text-foreground/60">No equipment placed yet. Close this panel and use <b>Load cafe reference kit</b> in the layout section, then come back.</p>
        )}
        {data && data.lines.length > 0 && (
          <table className="mt-5 w-full text-sm">
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.assetId} className="border-t border-foreground/10 align-top">
                  <td className="py-3 pr-3">{nameFor(kit, l.assetId)} x {l.quantity}
                    <span className="ml-2 rounded-full border border-foreground/20 px-2 py-0.5 text-[0.7rem]">{l.status}</span>
                    <p className="mt-1 break-all text-xs text-foreground/45">{l.source}</p>
                  </td>
                  <td className="whitespace-nowrap py-3 text-right tabular-nums">{range(l)}</td>
                </tr>
              ))}
              {data.fitout && (
                <tr className="border-t border-foreground/10 align-top">
                  <td className="py-3 pr-3">Interior fit-out x {data.fitout.squareFeet.toLocaleString()} sq ft
                    <span className="ml-2 rounded-full border border-dashed border-foreground/30 px-2 py-0.5 text-[0.7rem]">estimated</span>
                    <p className="mt-1 text-xs text-foreground/45">{data.fitout.source}</p>
                  </td>
                  <td className="whitespace-nowrap py-3 text-right tabular-nums">{range(data.fitout)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {data && data.unpriced.length > 0 && (
          <div className="mt-4 rounded-xl bg-foreground/[0.04] p-4 text-sm" data-testid="unpriced">
            <p className="font-medium">Unpriced, not free ({data.unpriced.length})</p>
            <ul className="mt-1 list-disc pl-5 text-foreground/70">
              {data.unpriced.map((u) => <li key={u.assetId}>{nameFor(kit, u.assetId)} x {u.quantity}: {u.reason}. Left out of every total.</li>)}
            </ul>
          </div>
        )}
        {data && (data.equipment || data.fitout) && (
          <div className="mt-4 grid gap-4 rounded-2xl bg-foreground/[0.04] p-5 sm:grid-cols-3">
            <div><p className="text-xs text-foreground/50">Priced equipment</p><p className="mt-1 font-medium tabular-nums">{range(data.equipment)}</p></div>
            <div><p className="text-xs text-foreground/50">Fit-out</p><p className="mt-1 font-medium tabular-nums">{data.fitout ? range(data.fitout) : "Unknown (enter an area)"}</p></div>
            <div><p className="text-xs text-foreground/50">Build-out with 10-20% contingency (p5 to p95)</p>
              <p className="mt-1 text-xl font-medium tracking-tight tabular-nums">{data.buildout ? range({ low: data.buildout.p5, high: data.buildout.p95 }) : "Unknown"}</p></div>
          </div>
        )}
        {data && <p className="mt-3 text-xs text-foreground/45">{data.totalStatus === "complete" ? "All parts priced." : `Partial: ${data.totalStatus.replace("partial: ", "")}.`} {data.notice}</p>}
      </section>

      <section className="mt-8 rounded-[1.75rem] border border-dashed border-foreground/25 p-6 sm:p-8" aria-labelledby="rp-title" data-testid="cafe-replan">
        <p className="text-xs text-foreground/50">Step 7 · Re-plan</p>
        <h2 id="rp-title" className="text-lg font-medium tracking-tight">Change an assumption</h2>
        <p className="mt-1 text-sm text-foreground/55">
          {brief.length > 0
            ? <>Saved intake brief: {brief.map((b) => `"${b.answer}"`).join(", ")}. It states no budget, seats or size, so the values below are assumptions you set, not facts.</>
            : "No saved intake brief in this tab. The values below are assumptions you set, not facts."}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm"><span className="block text-foreground/55">Build-out budget (USD)</span>
            <input type="number" min={1} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 200000" className={input} /></label>
          <label className="text-sm"><span className="block text-foreground/55">Area to fit out (sq ft)</span>
            <input type="number" min={1} value={area} onChange={(e) => onArea(e.target.value)} placeholder="e.g. 1200" className={input} /></label>
        </div>
        {distinct.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm" aria-label="Equipment in this scenario">
            {distinct.map((a) => (
              <li key={a.assetId} className="flex items-center gap-3">
                <span className="w-64 truncate">{a.name}</span>
                <button type="button" aria-label={`Remove one ${a.name}`} onClick={() => changed(a, -1)} className="h-7 w-7 rounded-full border border-foreground/25">-</button>
                <span className="w-6 text-center tabular-nums">{kit.filter((k) => k.assetId === a.assetId).length}</span>
                <button type="button" aria-label={`Add one ${a.name}`} onClick={() => changed(a, 1)} className="h-7 w-7 rounded-full border border-foreground/25">+</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 text-sm" aria-live="polite">
          {!budgetN ? <p className="text-foreground/60">Enter a budget to see P(over budget). Without one it is unknown, not zero.</p>
            : !data?.buildout ? <p className="text-foreground/60">Pending: nothing priced to compare with the budget.</p>
            : (
              <>
                <p>P(build-out over {range({ low: budgetN, high: budgetN })}): <span className="font-medium tabular-nums" data-testid="p-over">{pct(data.pOverBudget)}</span>
                  {baseline && <span className="text-foreground/55"> (baseline {pct(baseline.p)} at budget {baseline.budget || "none"}, {baseline.area || "no"} sq ft, {baseline.pieces} pieces)</span>}</p>
                <p className="mt-1 text-xs text-foreground/50">Median build-out {range({ low: data.buildout.p50, high: data.buildout.p50 })}. Only priced pieces and the assumed fit-out are counted.</p>
                <button type="button" disabled={recalculating} onClick={() => setBaseline({ p: data.pOverBudget, budget, area, pieces: kit.length, median: data.buildout?.p50 ?? null })}
                  className="mt-3 rounded-full border border-foreground/25 px-4 py-1.5 text-sm">Save as baseline</button>
              </>
            )}
        </div>
      </section>

      <ActChecklist items={diligence} />
    </>
  );
}
