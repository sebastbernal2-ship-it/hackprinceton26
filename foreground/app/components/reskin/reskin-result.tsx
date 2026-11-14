"use client";

import { BASIS_LABEL, money } from "../../lib/costs";
import { costSummary, type ReskinResult } from "../../lib/reskin";
import Badge from "./badge";
import LayoutPreview from "./layout-preview";

const range = (r: { low: number | null; expected: number | null; high: number | null }) =>
  r.expected === null ? "Unknown" : `${money(r.low)} / ${money(r.expected)} / ${money(r.high)}`;

export default function ReskinResultView({ result, dims }: { result: ReskinResult; dims: Record<string, { w: number; d: number }> }) {
  const s = costSummary(result.costDelta);
  return (
    <div className="mt-5 space-y-7">
      <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-foreground/80" role="note">
        Scenario analysis, not a forecast or a quote. {result.layoutNote ?? ""}
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="removed-h">
          <h3 id="removed-h" className="text-sm font-medium">Removed ({result.removed.length})</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {result.removed.map((e, i) => (
              <li key={`${e.assetId}-${i}`} className="flex items-start justify-between gap-3">
                <span>{e.name}</span><Badge kind={e.dimsStatus}>dims {e.dimsStatus}</Badge>
              </li>
            ))}
            {result.removed.length === 0 && <li className="text-foreground/50">Nothing removed.</li>}
          </ul>
        </section>
        <section aria-labelledby="added-h">
          <h3 id="added-h" className="text-sm font-medium">Added ({result.added.length})</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {result.added.map((e, i) => (
              <li key={`${e.assetId}-${i}`} className="flex items-start justify-between gap-3">
                <span>{e.name}</span><Badge kind={e.dimsStatus}>dims {e.dimsStatus}</Badge>
              </li>
            ))}
            {result.unplaced.length > 0 && <li className="text-accent">{result.unplaced.length} item(s) could not be placed in the space.</li>}
          </ul>
        </section>
      </div>

      <section aria-labelledby="delta-h">
        <h3 id="delta-h" className="text-sm font-medium">Cost delta</h3>
        <p className="mt-1 text-xs text-foreground/50">
          Low / expected / high. {s.unknown} of {result.costDelta.lines.length} lines have no sourced price: they are Unknown and excluded from the total, not zero.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-foreground/50"><tr><th className="py-1 pr-3 font-normal">Line</th><th className="pr-3 font-normal">Status</th><th className="pr-3 font-normal">Range</th><th className="font-normal">Basis</th></tr></thead>
            <tbody>
              {result.costDelta.lines.map((l) => (
                <tr key={l.itemId} className="border-t border-foreground/10 align-top" title={l.rationale}>
                  <td className="py-1.5 pr-3">{l.label}</td>
                  <td className="pr-3"><Badge kind={l.status} /></td>
                  <td className="pr-3 tabular-nums">{range(l)}</td>
                  <td className="text-foreground/50">{BASIS_LABEL[l.basis]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-foreground/20 font-medium">
                <td className="py-1.5 pr-3">Total of priced lines only</td>
                <td className="pr-3"><Badge kind={result.costDelta.totalsStatus === "unknown" ? "unknown" : "estimated"}>{result.costDelta.totalsStatus}</Badge></td>
                <td className="tabular-nums">{range(result.costDelta.totals)}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="feas-h">
        <h3 id="feas-h" className="text-sm font-medium">Feasibility: verify with inspector</h3>
        <p className="mt-1 text-xs text-foreground/50">Assumptions from typical equipment classes, not findings or code determinations.</p>
        <ul className="mt-2 space-y-3 text-sm">
          {result.feasibility.map((f) => (
            <li key={f.id} className="rounded-lg border border-foreground/10 p-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{f.topic}</span><Badge kind="verify">{f.status}</Badge><Badge kind="estimated">{f.labelledAs}</Badge></div>
              <p className="mt-1 text-foreground/70">{f.to}</p>
              <p className="mt-1 text-xs text-foreground/50">Basis: {f.basis}</p>
            </li>
          ))}
        </ul>
      </section>

      {result.adjacency.length > 0 && (
        <section aria-labelledby="adj-h">
          <h3 id="adj-h" className="text-sm font-medium">Adjacency checks</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {result.adjacency.map((a, i) => (
              <li key={i}>{a.a.replace(/_/g, " ")} to {a.b.replace(/_/g, " ")}: <strong>{a.result}</strong>{a.gapM != null ? ` (${a.gapM} m)` : ""} <span className="text-foreground/50">({a.basis})</span></li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="mat-h">
        <h3 id="mat-h" className="text-sm font-medium">Materials applied to the layout view</h3>
        <div className="mt-2"><LayoutPreview result={result} dims={dims} /></div>
        <p className="mt-2 text-xs text-foreground/50">Decor: {result.materials.decor.join(", ")}. Signage: {result.materials.signage}.</p>
      </section>
      <p className="text-xs text-foreground/50">{result.notice}</p>
    </div>
  );
}
