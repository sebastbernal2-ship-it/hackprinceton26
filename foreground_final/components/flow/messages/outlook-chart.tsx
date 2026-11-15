"use client";

import { useEffect, useState, type ReactNode } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { usd } from "@/lib/format";
import { DUR, EASE, REDUCED, SPRING, stagger } from "../motion";
import type { MessageRendererProps } from "./registry";

type Case = "slow" | "base" | "strong";
const ORDER: Case[] = ["slow", "base", "strong"];
const W = 512;
const H = 260;
const PAD = { l: 8, r: 24, t: 16, b: 28 };

/** Counts from 0 to `to` over DUR.count; reduced motion renders the final value. */
function Count({ to, format, delay = 0 }: { to: number; format: (n: number) => string; delay?: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) return;
    const c = animate(0, to, { duration: DUR.count, ease: EASE.out, delay, onUpdate: setV });
    return () => c.stop();
  }, [to, reduce, delay]);
  return <span className="tabular-nums">{format(reduce ? to : v)}</span>;
}

const VERDICT = {
  comfortable: { word: "Comfortable", color: "var(--saved)" },
  stretch: { word: "A stretch", color: "var(--maybe)" },
  unlikely: { word: "Unlikely on these seats", color: "var(--needed)" },
} as const;

export function OutlookChartMessage({ message: m }: MessageRendererProps<"outlookChart">) {
  const reduce = useReducedMotion();
  const all = ORDER.flatMap((k) => m.scenarios[k].profitByYearUsd);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / 2;
  const y = (v: number) => PAD.t + ((hi - v) / span) * (H - PAD.t - PAD.b);
  const path = (k: Case) => m.scenarios[k].profitByYearUsd.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" ");

  // where the base line crosses $0, for the break-even marker
  const b = m.scenarios.base.profitByYearUsd;
  let cross: { cx: number; cy: number } | null = null;
  for (let i = 0; i < 2; i++) {
    if (b[i] < 0 !== b[i + 1] < 0) {
      const t = b[i] / (b[i] - b[i + 1]);
      cross = { cx: x(i + t), cy: y(0) };
      break;
    }
  }

  const draw = (i: number) =>
    reduce
      ? {}
      : {
          initial: { pathLength: 0 },
          animate: { pathLength: 1 },
          transition: { duration: DUR.draw, ease: EASE.out, delay: 0.3 + i * 0.15 },
        };
  const fade = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: DUR.state, delay } };

  const v = VERDICT[m.verdict];
  const fair = m.rentFairPerSfYr;
  const ask = m.rentAskingPerSfYr;
  const base3 = b[2];
  const label = `Three year profit: slow ${usd(m.scenarios.slow.profitByYearUsd[2])}, base ${usd(base3)}, strong ${usd(m.scenarios.strong.profitByYearUsd[2])} in year 3`;

  return (
    <div className="w-full max-w-[560px] space-y-4">
      <p className="text-[1.0625rem] leading-[1.5]">{m.read}</p>

      <div className="rounded-[24px] border border-[var(--color-line)] bg-[oklch(1_0_0/0.06)] p-3">
        <div className="mb-1 flex items-center justify-between gap-3 px-1 text-xs font-medium tracking-[0.02em] text-[var(--color-text-2)]">
          <span>Profit per year</span>
          <span style={{ color: v.color }}>{v.word}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="block aspect-[512/260] w-full max-sm:aspect-auto max-sm:h-[220px]" preserveAspectRatio="none" role="img" aria-label={label}>
          <motion.g {...fade(0)}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          </motion.g>
          {ORDER.map((k, i) => (
            <motion.path
              key={k}
              d={path(k)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              stroke={k === "base" ? "var(--color-live)" : "var(--color-text-3)"}
              strokeWidth={k === "base" ? 3 : 1.5}
              {...draw(i)}
            />
          ))}
          {cross && (
            <motion.circle
              cx={cross.cx}
              cy={cross.cy}
              r={5}
              fill="var(--color-stage)"
              stroke="var(--color-text)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              {...(reduce
                ? {}
                : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...SPRING.pop, delay: 0.3 + DUR.draw + 0.3 } })}
            />
          )}
        </svg>
        <div className="flex justify-between px-1 text-xs text-[var(--color-text-3)]" aria-hidden>
          <span>Year 1</span>
          <span>Year 2</span>
          <span>Year 3</span>
        </div>
        <ul className="mt-2 grid grid-cols-3 gap-2 px-1 text-xs font-medium">
          {ORDER.map((k, i) => (
            <li key={k} className={k === "base" ? "font-semibold text-[var(--color-live)]" : "text-[var(--color-text-2)]"}>
              <span className="capitalize">{k}</span>
              <br />
              <Count to={m.scenarios[k].profitByYearUsd[2]} format={(n) => usd(n)} delay={0.3 + i * 0.15} />
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          i={0}
          label="Break-even"
          value={
            <>
              <Count to={m.breakevenCoversPerDay} format={(n) => String(Math.round(n))} />
              <span className="text-sm font-medium text-[var(--color-text-2)]"> covers/day</span>
            </>
          }
          note={`${m.seats} seats x ${m.turnsPerDay.toFixed(1)} turns`}
          reduce={!!reduce}
        />
        <Tile
          i={1}
          label="Rent per SF/yr"
          value={ask != null ? <Count to={ask} format={(n) => `$${Math.round(n)}`} /> : <span>n/a</span>}
          note={fair ? `asking, fair $${Math.floor(fair.low)} to $${Math.ceil(fair.high)}` : "asking"}
          reduce={!!reduce}
          bar={ask != null && fair ? <RentBand ask={ask} fair={fair} /> : null}
        />
        <Tile
          i={2}
          label="Base profit, year 3"
          value={<Count to={base3} format={(n) => usd(n)} />}
          note={base3 > 0 ? "a year, at base sales" : "loss at base sales"}
          reduce={!!reduce}
        />
      </div>

      {m.risks.length > 0 && (
        <ul className="space-y-1.5 text-sm leading-[1.45] text-[var(--color-text-2)]">
          {m.risks.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-[var(--maybe)]" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="font-mono text-[0.6875rem] leading-[1.25] text-[var(--color-text-3)]">Sources: {m.sources.join("; ")}</p>
    </div>
  );
}

function Tile({ i, label, value, note, bar, reduce }: { i: number; label: string; value: ReactNode; note: string; bar?: ReactNode; reduce: boolean }) {
  return (
    <motion.div
      className="rounded-[16px] border border-[var(--color-line)] bg-[oklch(1_0_0/0.06)] p-3 max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:items-baseline max-sm:gap-x-3"
      {...(reduce
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: REDUCED }
        : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { ...SPRING.ui, delay: 0.2 + stagger(i) } })}
    >
      <div className="text-xs font-medium tracking-[0.02em] text-[var(--color-text-3)]">{label}</div>
      <div className="text-[1.5rem] font-semibold leading-none tracking-[-0.02em] max-sm:row-span-2 max-sm:text-right sm:mt-2">{value}</div>
      <div className="text-xs leading-[1.3] text-[var(--color-text-2)] sm:mt-1.5">{note}</div>
      {bar}
    </motion.div>
  );
}

/** a tiny strip: the fair band as a bar, a tick where the asking rent sits */
function RentBand({ ask, fair }: { ask: number; fair: { low: number; high: number } }) {
  const lo = Math.min(ask, fair.low) * 0.9;
  const hi = Math.max(ask, fair.high) * 1.1;
  const p = (n: number) => ((n - lo) / (hi - lo)) * 100;
  const above = ask > fair.high;
  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-[var(--color-line)] max-sm:hidden" aria-hidden>
      <div
        className="absolute inset-y-0 rounded-full bg-[var(--saved-wash)] outline outline-1 outline-[var(--saved)]"
        style={{ left: `${p(fair.low)}%`, width: `${p(fair.high) - p(fair.low)}%` }}
      />
      <div className="absolute -top-0.5 h-2.5 w-0.5 rounded-full" style={{ left: `${p(ask)}%`, background: above ? "var(--needed)" : "var(--color-text)" }} />
    </div>
  );
}
