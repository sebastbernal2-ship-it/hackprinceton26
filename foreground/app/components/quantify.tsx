"use client";

import { useCallback, useEffect, useState } from "react";
import type { LayoutSummary } from "../lib/layout-summary";
import type { Match } from "../lib/matches";
import CostPanel from "./cost-panel";
import FinancePanel from "./finance/finance-panel";
import Stepper from "./stepper";
import TotalCostPanel from "./total-cost-panel";

type QuantifyProps = { match: Match; layout: LayoutSummary | null; onBackToLayout: () => void; onClose: () => void };

const nice = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);

/**
 * Step 5, Quantify: what the owner's 3D layout contains, the seat count it implies, and the cost engine's lines.
 * Furniture has no price source in the cost engine, so layout items are listed as unpriced, never as $0. The seat
 * count feeds the 36-month scenario and can be overridden; it is an estimate from the segmentation's piece labels.
 */
export default function Quantify({ match, layout, onBackToLayout, onClose }: QuantifyProps) {
  const [seatsInput, setSeatsInput] = useState<string>(layout && layout.seats > 0 ? String(layout.seats) : "");
  const seatsNum = Number(seatsInput);
  const seats = Number.isInteger(seatsNum) && seatsNum >= 1 && seatsNum <= 500 ? seatsNum : null;
  const [monthlyRent, setMonthlyRent] = useState<number | null>(null);
  const onRent = useCallback((m: number | null) => setMonthlyRent(m), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="quantify-title" className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground animate-rise">
      <div className="mx-auto max-w-[68rem] px-6 pb-16 pt-6 sm:px-12">
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onBackToLayout} className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70">
            Back to your layout
          </button>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-foreground/60 transition-opacity hover:opacity-70">
            Back to property
          </button>
        </div>
        <div className="mb-5 mt-6"><Stepper active={4} /></div>
        <h1 id="quantify-title" className="text-[clamp(1.6rem,4vw,2.5rem)] font-medium leading-tight tracking-tight">Quantify</h1>
        <p className="mt-1 text-foreground/50">{match.address}{match.detail ? ` · ${match.detail}` : ""}</p>

        <section className="mt-8 rounded-[1.75rem] bg-foreground/[0.04] p-6 sm:p-8" aria-labelledby="layout-title" data-testid="layout-summary">
          <h2 id="layout-title" className="text-lg font-medium tracking-tight">Your layout</h2>
          {!layout ? (
            <p className="mt-2 text-sm text-foreground/60">No layout yet. Open <b>Scope out your vision</b>, arrange the space, then continue here.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-foreground/55">
                From your 3D plan: {layout.addedItems.length} piece{layout.addedItems.length === 1 ? "" : "s"} added, {layout.removedTotal} removed, {layout.movedTotal} moved.
                Scanned pieces are named by shape, so counts are estimates.
              </p>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="text-left text-foreground/50">
                    <tr><th className="pb-2 font-normal">Item</th><th className="pb-2 text-right font-normal">In scan</th><th className="pb-2 text-right font-normal">Removed</th><th className="pb-2 text-right font-normal">Added</th><th className="pb-2 text-right font-normal">In your layout</th></tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {layout.rows.map((r) => (
                      <tr key={r.kind} className="border-t border-foreground/10">
                        <td className="py-2">{nice(r.kind)}</td>
                        <td className="py-2 text-right">{r.kept + r.removed}</td>
                        <td className="py-2 text-right">{r.removed || ""}</td>
                        <td className="py-2 text-right">{r.added || ""}</td>
                        <td className="py-2 text-right font-medium">{r.kept + r.added}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {layout.addedItems.length > 0 && (
                <p className="mt-4 text-xs text-foreground/50">
                  Added furniture ({layout.addedItems.map((a) => a.name).join(", ")}) has no price source yet, so it is not in the cost totals below. Unpriced, not free.
                </p>
              )}
            </>
          )}

          <div className="mt-6 flex flex-wrap items-end gap-4 border-t border-foreground/10 pt-5">
            <label className="text-sm">
              <span className="block text-foreground/55">Seats</span>
              <input
                type="number" min={1} max={500} inputMode="numeric" value={seatsInput}
                onChange={(e) => setSeatsInput(e.target.value)}
                className="mt-1 w-28 rounded-lg border border-foreground/20 bg-background px-3 py-2 tabular-nums"
              />
            </label>
            <p className="max-w-md pb-2 text-xs text-foreground/50">
              {layout && layout.seats > 0
                ? `Counted from your layout: chairs, stools and armchairs (${layout.seats}).${layout.sofasNotCounted ? ` ${layout.sofasNotCounted} sofa${layout.sofasNotCounted === 1 ? "" : "s"} not counted (seats per sofa unknown).` : ""} Change it if it is off.`
                : "Enter the seats you plan for. It drives the scenario below."}
            </p>
          </div>
        </section>

        {match.demo ? (
          match.costarPropertyId ? (
            <>
              <TotalCostPanel listingId={match.costarPropertyId} onRent={onRent} />
              <p className="mt-6 text-sm text-foreground/55">
                The itemised cost list and the 36-month scenario need a restaurant candidate listing; this demo scan is
                linked to its building&apos;s CoStar record only, so they are not shown.
              </p>
            </>
          ) : (
            <p className="mt-8 text-sm text-foreground/55">
              Costs need a CoStar record. This demo scan has none, so only the layout is shown.
            </p>
          )
        ) : (
          <>
            <TotalCostPanel listingId={match.listingId} initialSquareFeet={match.squareFeet} onRent={onRent} />
            <CostPanel listingId={match.listingId} />
            {seats ? (
              <FinancePanel listingId={match.listingId} seats={seats} rentUnknownAssumption={monthlyRent ?? undefined} />
            ) : (
              <p className="mt-8 text-sm text-foreground/55">Enter a seat count to run the 36-month scenario.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
