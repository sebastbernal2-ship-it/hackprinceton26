import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { BlockTrend as Trend } from "@/lib/engine/types";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Estimate, SourceLabel } from "./primitives";

const RATING = {
  tailwind: { text: "Tailwind", sub: "The block is getting busier.", cls: "text-saved" },
  neutral: { text: "Holding steady", sub: "No strong push either way.", cls: "text-ink" },
  headwind: { text: "Headwind", sub: "The block is losing customers or food businesses.", cls: "text-needed" },
} as const;

const DIR = {
  up: { Icon: ArrowUpRight, cls: "text-saved", label: "rising" },
  flat: { Icon: ArrowRight, cls: "text-ink-2", label: "flat" },
  down: { Icon: ArrowDownRight, cls: "text-needed", label: "falling" },
} as const;

export function BlockTrend({ trend }: { trend: Trend }) {
  const r = RATING[trend.rating];
  const at = ((trend.score + 1) / 2) * 100;
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <p className={cn("lettering text-[2.5rem] font-bold leading-none", r.cls)}>{r.text}</p>
        <p className="mt-2 text-sm text-ink-2">{r.sub}</p>
        <div className="mt-5" role="img" aria-label={`Trend score ${num(trend.score, 2)} on a scale from −1 headwind to 1 tailwind`}>
          <div className="relative h-6">
            <div className="absolute top-1/2 h-0.5 w-full -translate-y-1/2 bg-rule-strong" />
            <div className="absolute top-1 h-4 w-px bg-rule-strong" style={{ left: 0 }} />
            <div className="absolute top-1 h-4 w-px bg-rule-strong" style={{ left: "50%" }} />
            <div className="absolute top-1 right-0 h-4 w-px bg-rule-strong" />
            <div className="absolute top-0 h-6 w-1 -translate-x-1/2 bg-ink" style={{ left: `${at}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-2">
            <span>Headwind</span>
            <span>Tailwind</span>
          </div>
        </div>
        <p className="mt-2">
          <Estimate />
        </p>
      </div>
      <ul className="divide-y divide-rule border-y border-rule lg:col-span-8">
        {trend.signals.length === 0 ? <li className="py-3 text-sm text-ink-2">No market signals for this block yet.</li> : null}
        {trend.signals.map((s, i) => {
          const d = DIR[s.direction];
          return (
            <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-x-3 py-3">
              <d.Icon aria-label={d.label} className={cn("mt-0.5 size-5", d.cls)} />
              <div>
                <p className="font-semibold leading-snug">{s.label}</p>
                <p className="text-sm leading-snug text-ink-2">{s.detail}</p>
                <SourceLabel source={s.source} className="mt-1" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
