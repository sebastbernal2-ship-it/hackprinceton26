"use client";

import { useEffect, useState } from "react";
import { BASIS_LABEL, fetchCosts, money, unknownCount, type CostLineItem, type CostsResponse, type CostStatus } from "../lib/costs";

const STATUS_TONE: Record<CostStatus, string> = {
  observed: "bg-match-soft text-match",
  estimated: "border border-dashed border-foreground/30 text-foreground/70",
  unknown: "border border-foreground/15 text-foreground/45",
};

export default function CostPanel({ listingId, onData }: { listingId: number; onData?: (lines: CostLineItem[]) => void }) {
  const [state, setState] = useState<{ id: number; data: CostsResponse | null } | null>(null);

  useEffect(() => {
    let live = true;
    fetchCosts(listingId).then(
      (data) => {
        if (!live) return;
        setState({ id: listingId, data });
        onData?.(data.lines);
      },
      () => live && setState({ id: listingId, data: null }),
    );
    return () => {
      live = false;
    };
  }, [listingId, onData]);

  const current = state?.id === listingId ? state : null;
  const data = current?.data;
  const missing = data ? unknownCount(data.lines) : 0;

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="costs-title">
      <h2 id="costs-title" className="text-lg font-medium tracking-tight">Repair, utility and equipment costs</h2>
      <p className="mt-1 text-sm text-foreground/50">
        Estimates carry a low / expected / high range and a written rationale. They are not quotes. Unknown means no price basis, never zero.
      </p>
      {!current && <p className="mt-3 text-sm text-foreground/50">Loading costs.</p>}
      {current && !data && <p className="mt-3 text-sm text-foreground/60">Cannot say: the cost service did not answer.</p>}
      {data?.notice && <p role="note" className="mt-3 rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2 text-sm">{data.notice}</p>}
      {data && data.lines.length === 0 && <p className="mt-3 text-sm text-foreground/60">No cost lines available.</p>}
      {data && data.lines.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-foreground/50">
                <tr>
                  <th className="py-2 pr-3 font-normal">Item</th>
                  <th className="py-2 pr-3 font-normal">Basis</th>
                  <th className="py-2 pr-3 text-right font-normal">Low</th>
                  <th className="py-2 pr-3 text-right font-normal">Expected</th>
                  <th className="py-2 pr-3 text-right font-normal">High</th>
                  <th className="py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <Row key={line.itemId} line={line} />
                ))}
              </tbody>
            </table>
          </div>
          {data.totals ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Total title="One-time total" range={data.totals.oneTime} suffix="" />
              <Total title="Monthly total" range={data.totals.monthly} suffix="/mo" />
            </div>
          ) : (
            <p className="mt-4 text-sm text-foreground/60">No total: too many lines lack a price to sum honestly.</p>
          )}
          {data.totals && missing > 0 && (
            <p className="mt-2 text-xs text-foreground/50">Totals exclude {missing} line{missing === 1 ? "" : "s"} with unknown price. One-time and monthly costs are never mixed.</p>
          )}
        </>
      )}
    </section>
  );
}

function Row({ line }: { line: CostLineItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-foreground/10 align-top">
        <td className="py-2 pr-3">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-left font-medium underline-offset-2 hover:underline">
            {line.label}
          </button>
          <span className="block text-xs text-foreground/45">{line.category}{line.quantity !== null ? ` · ${line.quantity} ${line.unit}` : ""}</span>
        </td>
        <td className="py-2 pr-3 text-foreground/60">{BASIS_LABEL[line.basis]}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{money(line.low)}</td>
        <td className="py-2 pr-3 text-right font-medium tabular-nums">{money(line.expected)}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{money(line.high)}</td>
        <td className="py-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[line.status]}`}>{line.status[0].toUpperCase() + line.status.slice(1)}</span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="pb-3 text-xs leading-relaxed text-foreground/60">
            {line.rationale} <span className="text-foreground/40">Source: {line.source} · As of {line.asOf}</span>
          </td>
        </tr>
      )}
    </>
  );
}

function Total({ title, range, suffix }: { title: string; range: { low: number; expected: number; high: number }; suffix: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 p-4">
      <p className="text-sm text-foreground/55">{title}</p>
      <p className="mt-1 text-xl font-medium tabular-nums">{money(range.expected)}{suffix}</p>
      <p className="text-xs text-foreground/50">Range {money(range.low)} to {money(range.high)}{suffix}</p>
    </div>
  );
}
