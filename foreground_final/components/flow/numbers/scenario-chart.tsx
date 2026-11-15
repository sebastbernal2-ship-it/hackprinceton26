"use client";

import { motion, useReducedMotion } from "motion/react";
import { usd } from "@/lib/format";
import { CountUp } from "../count-up";
import { DUR, EASE, SPRING } from "../motion";
import { CASES, zeroCrossing } from "./data";
import type { ScenarioName } from "@/lib/engine/types";

const W = 560;
const H = 250;
const PAD = { l: 56, r: 28, t: 14, b: 26 };

/** The three scenarios drawn large: profit by year, base in `live`, lines drawn via pathLength, $0 line and the crossing marked. */
export function ScenarioChart({ series }: { series: Record<ScenarioName, [number, number, number]> }) {
  const reduce = useReducedMotion();
  const all = CASES.flatMap((k) => series[k]);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / 2;
  const y = (v: number) => PAD.t + ((hi - v) / span) * (H - PAD.t - PAD.b);
  const path = (k: ScenarioName) => series[k].map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" ");
  const cross = zeroCrossing(series.base);
  const ticks = [hi, (hi + lo) / 2, lo].filter((v, i, a) => a.indexOf(v) === i);
  const label = `Profit by year: slow ${usd(series.slow[2])}, base ${usd(series.base[2])}, strong ${usd(series.strong[2])} in year 3`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} className="block min-h-0 w-full flex-1" preserveAspectRatio="none" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="oklch(1 0 0 / 0.06)" vectorEffect="non-scaling-stroke" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-3)">
              {usd(t)}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        {CASES.map((k, i) => (
          <motion.path
            key={k}
            d={path(k)}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            stroke={k === "base" ? "var(--color-live)" : "var(--color-text-3)"}
            strokeWidth={k === "base" ? 3.5 : 1.75}
            strokeDasharray={k === "slow" ? "6 5" : undefined}
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DUR.draw, ease: EASE.out, delay: 0.3 + i * 0.15 }}
          />
        ))}
        {CASES.map((k) => (
          <circle key={k} cx={x(2)} cy={y(series[k][2])} r={k === "base" ? 5 : 3.5} fill={k === "base" ? "var(--color-live)" : "var(--color-text-3)"} />
        ))}
        {cross !== null ? (
          <motion.circle
            cx={PAD.l + (cross * (W - PAD.l - PAD.r)) / 2}
            cy={y(0)}
            r={6}
            fill="var(--color-stage)"
            stroke="var(--color-text)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...SPRING.pop, delay: 0.3 + DUR.draw + 0.2 }}
          />
        ) : null}
        {[0, 1, 2].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize="11" fill="var(--color-text-3)">
            Year {i + 1}
          </text>
        ))}
      </svg>
      <ul className="mt-2 grid grid-cols-3 gap-2 text-sm font-medium">
        {CASES.map((k, i) => (
          <li key={k} className={k === "base" ? "text-live" : "text-text-2"}>
            <span className="flow-label capitalize">{k}, year 3</span>
            <br />
            <CountUp to={series[k][2]} format={usd} delay={0.3 + i * 0.15} className="text-lg font-semibold" />
          </li>
        ))}
      </ul>
    </div>
  );
}
