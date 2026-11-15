"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { niceMax } from "@/components/site/dimension-line";
import { Estimate, SourceLabel } from "@/components/site/primitives";
import type { ScenarioName } from "@/lib/engine/types";
import { num, usd, usdRange } from "@/lib/format";
import type { DaySim, LayoutImpact } from "@/lib/layout";
import type { SimTick } from "./plan";

const EASE = [0.16, 1, 0.3, 1] as const;

/** A figure that rolls to its new value instead of jumping. */
export function Rolling({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduce = useReducedMotion();
  const fmt = useRef(format);
  useEffect(() => {
    fmt.current = format;
  });
  useEffect(() => {
    const from = shown.current;
    if (from === value || reduce) {
      shown.current = value;
      if (node.current) node.current.textContent = fmt.current(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.5,
      ease: EASE,
      onUpdate: (v) => {
        shown.current = v;
        if (node.current) node.current.textContent = fmt.current(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return (
    <span ref={node} className={className}>
      {format(value)}
    </span>
  );
}

const VERDICT = {
  comfortable: { text: "Comfortable", cls: "border-saved text-saved" },
  stretch: { text: "A stretch", cls: "border-maybe-ink border-dashed text-maybe-ink" },
  unlikely: { text: "Unlikely", cls: "border-needed bg-needed text-on-ink" },
} as const;

const CASES: { name: ScenarioName; label: string; color: string; dash?: string }[] = [
  { name: "slow", label: "Slow", color: "var(--needed)", dash: "5 4" },
  { name: "base", label: "Base", color: "var(--ink)" },
  { name: "strong", label: "Strong", color: "var(--saved)", dash: "2 3" },
];

function Delta({ now, was, format, invert }: { now: number; was: number; format: (n: number) => string; invert?: boolean }) {
  const diff = now - was;
  if (Math.abs(diff) < 1e-9 || format(Math.abs(diff)) === format(0)) return null;
  const worse = invert ? diff < 0 : diff > 0;
  return (
    <span className={`font-mono text-[0.6875rem] ${worse ? "text-needed" : "text-saved"}`}>
      {diff > 0 ? "+" : "−"}
      {format(Math.abs(diff))} vs. starting plan
    </span>
  );
}

function BudgetLine({ impact, budget }: { impact: LayoutImpact; budget?: number }) {
  const max = niceMax(Math.max(impact.total.high, budget ?? 0) * 1.08);
  const x = (v: number) => (Math.min(v, max) / max) * 100;
  const { low, mid, high } = impact.total;
  const spring = { type: "spring", bounce: 0, duration: 0.5 } as const;
  return (
    <div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" width="100%" height="34" aria-hidden focusable="false">
        <defs>
          <pattern id="fg-over" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--needed)" strokeWidth="1.6" />
          </pattern>
        </defs>
        {budget ? <rect x={0} y={16} width={x(budget)} height={14} fill="var(--paper-2)" stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
        {budget ? <motion.rect y={16} height={14} fill="url(#fg-over)" initial={false} animate={{ attrX: x(budget), width: Math.max(0, x(high) - x(budget)) }} transition={spring} /> : null}
        <motion.line y1={8} y2={8} stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" initial={false} animate={{ x1: x(low), x2: x(high) }} transition={spring} />
        <motion.line y1={2} y2={14} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" initial={false} animate={{ x1: x(low), x2: x(low) }} transition={spring} />
        <motion.line y1={2} y2={14} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" initial={false} animate={{ x1: x(high), x2: x(high) }} transition={spring} />
        <motion.line y1={4} y2={12} stroke="var(--ink)" strokeWidth={4} vectorEffect="non-scaling-stroke" initial={false} animate={{ x1: x(mid), x2: x(mid) }} transition={spring} />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[0.625rem] text-ink-2">
        <span>$0</span>
        {budget ? <span>budget {usd(budget)}</span> : null}
        <span>{usd(max)}</span>
      </div>
    </div>
  );
}

function Outlook({ impact }: { impact: LayoutImpact }) {
  const W = 300;
  const H = 110;
  const all = CASES.flatMap((c) => impact.scenarios.scenarios[c.name].years.map((y) => y.cumulativeCashUsd)).concat(-impact.total.mid, 0);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const px = (year: number) => 8 + (year / 3) * (W - 56);
  const py = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 24);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Three-year cash, slow, base and strong. ${impact.scenarios.verdict}`}>
      <line x1={8} x2={W - 48} y1={py(0)} y2={py(0)} stroke="var(--rule-strong)" strokeWidth={1} />
      <text x={8} y={py(0) - 4} fontSize={9} fill="var(--ink-2)" className="font-mono">
        paid back
      </text>
      {[0, 1, 2, 3].map((y) => (
        <text key={y} x={px(y)} y={H - 2} fontSize={9} textAnchor="middle" fill="var(--ink-2)" className="font-mono">
          {y === 0 ? "open" : `yr ${y}`}
        </text>
      ))}
      {CASES.map((c) => {
        const s = impact.scenarios.scenarios[c.name];
        const pts: [number, number][] = [[px(0), py(-impact.total.mid)], ...s.years.map((y): [number, number] => [px(y.year), py(y.cumulativeCashUsd)])];
        const end = pts[pts.length - 1];
        return (
          <g key={c.name}>
            <motion.path fill="none" stroke={c.color} strokeWidth={c.name === "base" ? 2 : 1.5} strokeDasharray={c.dash} initial={false} animate={{ d: `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join("L")}` }} transition={{ type: "spring", bounce: 0, duration: 0.5 }} />
            <motion.text fontSize={9} fill={c.color} fontWeight={600} initial={false} animate={{ attrX: end[0] + 4, attrY: end[1] + 3 }} transition={{ type: "spring", bounce: 0, duration: 0.5 }}>
              {c.label}
            </motion.text>
          </g>
        );
      })}
    </svg>
  );
}

export type SimState = { sim: DaySim | null; playing: boolean; speed: number; tick: SimTick | null };

function clockText(openHour: number, minute: number) {
  const total = openHour * 60 + Math.round(minute);
  const h = Math.floor(total / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(total % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function ImpactPanel({
  impact,
  baseline,
  budget,
  simState,
  dayResult,
  onSimToggle,
  onSimRestart,
  onSimSpeed,
}: {
  impact: LayoutImpact;
  baseline: LayoutImpact;
  budget?: number;
  simState: SimState;
  /** the whole day, computed up front, so the verdict does not wait for the animation */
  dayResult: DaySim;
  onSimToggle: () => void;
  onSimRestart: () => void;
  onSimSpeed: (s: number) => void;
}) {
  const be = impact.breakeven;
  const v = VERDICT[be.verdict];
  const over = budget !== undefined && impact.total.mid > budget;
  const { sim, playing, speed, tick } = simState;
  const full = dayResult.walked === 0;
  return (
    <div className="flex flex-col divide-y divide-rule" aria-live="polite" aria-atomic="false">
      <div className="pb-5">
        <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">Seats on this plan</h3>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Rolling value={impact.seats} format={(n) => num(Math.round(n))} className="lettering text-[3.25rem] font-bold leading-none" />
          <Delta now={impact.seats} was={baseline.seats} format={(n) => num(Math.round(n))} invert />
        </p>
        {impact.capped ? (
          <p className="mt-1 text-xs text-maybe-ink">
            The money model counts {impact.seatsUsed}: its benchmark says this floor fits no more. <Estimate />
          </p>
        ) : (
          <p className="mt-1 font-mono text-[0.6875rem] text-ink-2">src counted from the pieces drawn on the plan</p>
        )}
      </div>

      <div className="py-5">
        <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">Build-out for this plan</h3>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="lettering text-[1.75rem] font-semibold leading-none">
            <Rolling value={impact.total.low} format={(n) => usd(n)} /> – <Rolling value={impact.total.high} format={(n) => usd(n)} />
          </span>
          <Estimate />
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3">
          <Delta now={impact.total.mid} was={baseline.total.mid} format={(n) => usd(n)} />
          {over ? <span className="text-xs font-semibold text-needed">Over budget by {usd(impact.total.mid - budget)} at the midpoint</span> : null}
        </p>
        <div className="mt-3">
          <BudgetLine impact={impact} budget={budget} />
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          <li className="flex justify-between gap-3">
            <span>
              Hidden-cost X-Ray, {impact.seatsUsed} seats <a href="#cost" className="text-ink-2 underline hover:text-ink">lines</a>
            </span>
            <span className="lettering shrink-0 font-semibold">{usdRange(impact.analysis.xray.total)}</span>
          </li>
          {impact.extras.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3">
              <span>
                <span className="text-needed">+</span> {l.label}
                <span className="block text-xs text-ink-2">
                  {l.reason} <SourceLabel source={l.source} />
                </span>
              </span>
              <span className="lettering shrink-0 font-semibold">{usdRange(l.range)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="py-5">
        <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">Break-even, turns per seat per day</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Rolling value={be.turnsPerDay} format={(n) => num(n, 1)} className="lettering text-[1.75rem] font-semibold leading-none" />
          <span className={`inline-block rounded-sm border px-2 py-0.5 text-sm font-semibold uppercase tracking-[0.04em] ${v.cls}`}>{v.text}</span>
          <Delta now={be.turnsPerDay} was={baseline.breakeven.turnsPerDay} format={(n) => num(n, 1)} />
        </p>
        <p className="mt-1 text-sm text-ink-2">
          <Rolling value={be.coversPerDay} format={(n) => num(Math.round(n))} /> covers a day at a {usd(be.avgCheckUsd)} check, on {impact.seatsUsed} seats. <Estimate />
        </p>

        <div className="mt-4 rounded-sm border border-rule-strong p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="lettering text-base font-semibold">Will it fill?</h4>
            <div className="flex items-center gap-1">
              <button type="button" onClick={onSimToggle} className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-ink px-3 text-sm font-semibold text-on-ink transition-[transform,background-color] duration-150 hover:bg-ink/90 active:scale-[0.97]">
                {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
                {playing ? "Pause" : sim ? "Resume" : "Run a break-even day"}
              </button>
              {sim ? (
                <>
                  <button type="button" onClick={onSimRestart} aria-label="Restart the day" className="inline-flex size-9 items-center justify-center rounded-sm border border-rule-strong transition-colors hover:border-ink active:scale-[0.97]">
                    <RotateCcw size={14} aria-hidden />
                  </button>
                  <div role="radiogroup" aria-label="Speed" className="flex">
                    {[1, 2, 4].map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => onSimSpeed(s)} className={`h-9 border border-rule-strong px-2 font-mono text-xs first:rounded-l-sm last:rounded-r-sm [&+&]:border-l-0 ${speed === s ? "bg-ink text-on-ink" : "hover:border-ink"}`}>
                        {s}×
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-sm">
            {full ? (
              <>
                Yes. All <strong>{num(dayResult.needed)}</strong> break-even guests find a seat; the room turns {num(dayResult.turns, 1)} times.
              </>
            ) : (
              <>
                <strong className="text-needed">Not on this plan.</strong> Break-even needs {num(dayResult.needed)} guests; the room seats {num(dayResult.served)} and{" "}
                <strong className="text-needed">{num(dayResult.walked)} walk away</strong> from a line that reaches {num(dayResult.peakQueue)}.
              </>
            )}
          </p>
          {sim && tick ? (
            <dl className="mt-2 grid grid-cols-4 gap-2 border-t border-rule pt-2 font-mono text-[0.6875rem] text-ink-2">
              {[
                ["clock", clockText(sim.openHour, tick.minute)],
                ["seated", `${tick.seated}/${sim.seats}`],
                ["in line", String(tick.queue)],
                ["walked", String(tick.walked)],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd className={`text-sm ${k === "walked" && tick.walked > 0 ? "text-needed" : "text-ink"}`}>{val}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="mt-2 text-xs text-ink-2">
            One day, 11 am to 10 pm, lunch and dinner peaks; each guest holds a seat {dayResult.dwell} minutes and waits up to {dayResult.patience}. Every seat fills. <Estimate />
          </p>
        </div>
      </div>

      <div className="pt-5">
        <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">Three years, cash after build-out</h3>
        <p className="mt-1 text-sm font-medium">{impact.scenarios.verdict}</p>
        <Outlook impact={impact} />
        <p className="font-mono text-[0.6875rem] text-ink-2">
          Ranges, not promises. <a href="#money" className="underline hover:text-ink">See the math</a> <Estimate />
        </p>
      </div>
    </div>
  );
}
