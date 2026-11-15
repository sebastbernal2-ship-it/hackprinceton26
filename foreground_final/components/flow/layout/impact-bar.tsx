"use client";

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { usd, usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deltasBetween, type FigureDeltas, type Figures } from "./impact";

/** a number that rolls to its new value (0.4 s), straight to it under reduced motion */
function Rolling({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const span = useRef<HTMLSpanElement>(null);
  useMotionValueEvent(mv, "change", (v) => {
    if (span.current) span.current.textContent = format(v);
  });
  useEffect(() => {
    const c = animate(mv, value, reduce ? { duration: 0 } : { type: "spring", duration: 0.45, bounce: 0 });
    return () => c.stop();
  }, [value, reduce, mv]);
  return (
    <span ref={span} className="tabular-nums">
      {format(value)}
    </span>
  );
}

const signed = (n: number, f: (v: number) => string) => `${n > 0 ? "+" : "-"}${f(Math.abs(n))}`;
const BREAKEVEN_WORD = { comfortable: "within reach", stretch: "a stretch", unlikely: "unlikely" } as const;

function Delta({ n, good, format }: { n: number | undefined; good: "up" | "down"; format: (v: number) => string }) {
  if (!n) return null;
  const better = good === "up" ? n > 0 : n < 0;
  return (
    <span className={cn("flow-source ml-1.5 rounded-full px-1.5 py-0.5", better ? "bg-saved-wash text-saved" : "bg-needed-wash text-needed")}>{signed(n, format)}</span>
  );
}

/**
 * The live impact bar: five figures for the plan as it stands now, each with a chip against the suggested plan
 * for 2.5 s after a change. All values come from `layoutImpact` (the engine); nothing here is computed locally.
 */
export function ImpactBar({ now, suggested, budgetUsd }: { now: Figures; suggested: Figures; budgetUsd?: number }) {
  const [chips, setChips] = useState<FigureDeltas | null>(null);
  const last = useRef<Figures>(now);
  useEffect(() => {
    if (last.current === now) return;
    last.current = now;
    setChips(deltasBetween(suggested, now));
    const t = window.setTimeout(() => setChips(null), 2500);
    return () => window.clearTimeout(t);
  }, [now, suggested]);

  const money = (n: number) => usd(n);
  return (
    <section aria-label="What this plan costs and earns" className="glass pointer-events-auto grid h-[72px] shrink-0 grid-cols-5 items-center rounded-f-lg px-3">
      <Figure label="Seats" source="plan">
        <Rolling value={now.seats} format={(n) => String(Math.round(n))} />
        <Delta n={chips?.seats} good="up" format={(v) => String(Math.round(v))} />
        {now.capped ? <span className="flow-source ml-1.5 rounded-full bg-maybe-wash px-1.5 py-0.5 text-maybe-ink">capped at {now.seatsUsed}</span> : null}
      </Figure>
      <Figure label="All-in" source={now.overBudget == null ? "engine x-ray + layout" : now.overBudget ? "over your budget" : "within budget"} tone={now.overBudget ? "needed" : undefined}>
        <span className="tabular-nums">{usdRange(now.allIn)}</span>
        <Delta n={chips?.allIn} good="down" format={money} />
      </Figure>
      <Figure label="Break-even" source={BREAKEVEN_WORD[now.verdict]} tone={now.verdict === "unlikely" ? "needed" : now.verdict === "stretch" ? "maybe" : undefined}>
        <Rolling value={now.coversPerDay} format={(n) => `${Math.round(n)} covers/day`} />
        <Delta n={chips?.coversPerDay} good="down" format={(v) => String(Math.round(v))} />
      </Figure>
      <Figure label="Year-3 profit" source="base case" tone={now.year3Profit <= 0 ? "needed" : undefined}>
        <Rolling value={now.year3Profit} format={(n) => usd(n)} />
        <Delta n={chips?.year3Profit} good="up" format={money} />
      </Figure>
      <Figure label="Layout extras" source={budgetUsd ? "on top of the x-ray" : "bar, counters, patio"}>
        <span className="tabular-nums">{now.extras.mid > 0 ? usdRange(now.extras) : "None"}</span>
        <Delta n={chips?.extras} good="down" format={money} />
      </Figure>
    </section>
  );
}

function Figure({ label, source, tone, children }: { label: string; source: string; tone?: "needed" | "maybe"; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2">
      <span className="flow-label text-text-3">{label}</span>
      <span className="flex flex-wrap items-center text-[0.9375rem] font-semibold leading-tight text-text">{children}</span>
      <span className={cn("flow-source truncate", tone === "needed" ? "text-needed" : tone === "maybe" ? "text-maybe" : "text-text-3")}>{source}</span>
    </div>
  );
}
