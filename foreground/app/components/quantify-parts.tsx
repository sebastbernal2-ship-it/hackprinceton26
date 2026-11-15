"use client";

import { useState, type ReactNode } from "react";
import type { LayoutSummary } from "../lib/layout-summary";
import { fmtDelta } from "../lib/quantify-model";

/** A numbered, collapsible step of the Quantify page. Children mount only while open, so closed steps cost nothing. */
export function Section({ n, title, hint, defaultOpen = false, testId, children }: { n?: number; title: string; hint: string; defaultOpen?: boolean; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mt-4 rounded-[1.5rem] border border-foreground/15" data-testid={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-baseline gap-3 px-5 py-4 text-left sm:px-6">
        {n !== undefined && <span className="text-sm tabular-nums text-foreground/40">{n}</span>}
        <span className="text-lg font-medium tracking-tight">{title}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/50">{hint}</span>
        <span aria-hidden="true" className="text-foreground/40">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-foreground/10 px-5 pb-6 pt-4 sm:px-6">{children}</div>}
    </section>
  );
}

/** "+$12,400 vs before" (or "new") next to a number that just moved; the line keeps its highlight until the next change. */
export function Delta({ d, fmt = fmtDelta, testId }: { d: number | "new" | null | undefined; fmt?: (n: number) => string; testId?: string }) {
  if (d === null || d === undefined) return null;
  return <span data-testid={testId} className="ml-2 whitespace-nowrap text-xs font-medium text-accent">{d === "new" ? "new" : `${fmt(d)} vs before`}</span>;
}

/** One headline figure of the sticky summary. `n` restarts the highlight each time the value moves. */
export function Stat({ id, label, value, sub, n, pending, d, fmt }: { id: string; label: string; value: string; sub?: ReactNode; n: number; pending: boolean; d: number | null; fmt?: (n: number) => string }) {
  return (
    <div className="min-w-0" data-testid={`stat-${id}`}>
      <p className="text-[0.7rem] uppercase tracking-wide text-foreground/50">{label}</p>
      <p key={n} className={`mt-0.5 animate-recalc rounded text-base font-medium tabular-nums transition-opacity sm:text-lg ${pending ? "opacity-50" : ""}`} data-testid={`stat-${id}-value`}>{value}</p>
      <p className="text-xs text-foreground/55">{sub}<Delta d={d} fmt={fmt} testId={`stat-${id}-delta`} /></p>
    </div>
  );
}

export const field = "mt-1 rounded-lg border border-foreground/20 bg-background px-3 py-2 tabular-nums";

const nice = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);

/** What the 3D layout contains: scan counts against the owner's changes. Counts are estimates (pieces are named by shape). */
export function LayoutTable({ layout }: { layout: LayoutSummary }) {
  return (
    <div data-testid="layout-summary">
      <p className="text-sm text-foreground/55">
        From your 3D plan: {layout.addedItems.length} piece{layout.addedItems.length === 1 ? "" : "s"} added, {layout.removedTotal} removed, {layout.movedTotal} moved. Scanned pieces are named by shape, so counts are estimates.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="text-left text-foreground/50">
            <tr><th className="pb-2 font-normal">Item</th><th className="pb-2 text-right font-normal">In scan</th><th className="pb-2 text-right font-normal">Removed</th><th className="pb-2 text-right font-normal">Added</th><th className="pb-2 text-right font-normal">In your layout</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {layout.rows.map((r) => (
              <tr key={r.kind} className="border-t border-foreground/10">
                <td className="py-2">{nice(r.kind)}</td><td className="py-2 text-right">{r.kept + r.removed}</td><td className="py-2 text-right">{r.removed || ""}</td>
                <td className="py-2 text-right">{r.added || ""}</td><td className="py-2 text-right font-medium">{r.kept + r.added}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {layout.addedItems.length > 0 && <p className="mt-3 text-xs text-foreground/50">Added furniture ({layout.addedItems.map((a) => a.name).join(", ")}) has no price source yet, so it is not in the cost totals. Unpriced, not free.</p>}
    </div>
  );
}
