"use client";

import { usd, usdRange } from "@/lib/format";
import type { DealMemo } from "@/lib/outputs/memo";

/** The one-page deal memo, as a preview. The printable page is /site/[id]/offer with the plan's concept, seats and budget. */
export function MemoPreview({ memo, href }: { memo: DealMemo; href: string }) {
  const x = memo.xray;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-f-sm bg-text p-3 text-stage">
        <p className="text-sm leading-tight font-semibold">{memo.title}</p>
        <p className="text-[0.6875rem] leading-tight text-stage/70">{memo.subtitle}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-stage/15 pt-2 text-[0.6875rem] leading-tight">
          {memo.facts.slice(2, 6).map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-stage/60">{f.label}</dt>
              <dd className="truncate font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-stage/15 pt-2 text-[0.6875rem] leading-snug">
          <p>
            <span className="font-semibold">All-in {usdRange(x.total)}</span>
            {x.budgetUsd !== null ? `, budget ${usd(x.budgetUsd)}` : ""}
            {x.gapUsd !== null ? (x.gapUsd > 0 ? `, ${usd(x.gapUsd)} over` : `, ${usd(-x.gapUsd)} to spare`) : ""}.
          </p>
          <p className="mt-0.5">
            Break-even {Math.round(memo.breakeven.coversPerDay)} covers a day, {memo.breakeven.verdict}.
          </p>
          {memo.risks[0] ? <p className="mt-0.5 text-stage/70">{memo.risks[0]}</p> : null}
        </div>
        <ol className="list-decimal space-y-0.5 border-t border-stage/15 pt-2 pl-4 text-[0.6875rem] leading-snug">
          {memo.asks.slice(0, 3).map((a) => (
            <li key={a.id}>{a.title}</li>
          ))}
        </ol>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="flow-source truncate text-text-3">Foreground deal memo, {memo.sources.length} sources</p>
        <a href={href} target="_blank" rel="noreferrer" className="flow-label shrink-0 rounded-full border border-line-strong bg-glass-fill px-3 py-1.5 text-text transition-transform duration-100 active:scale-[0.97]">
          Open to print
        </a>
      </div>
    </div>
  );
}
