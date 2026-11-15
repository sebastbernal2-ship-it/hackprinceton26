"use client";

import { motion, useReducedMotion } from "motion/react";
import { usd, usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountUp } from "../count-up";
import { DUR, EASE } from "../motion";
import { Tile, TONE_TEXT } from "../tile";
import { biggestLines, budgetWords, moneyScale, WORDS } from "./data";
import type { TileProps } from "./types";

/** "The money": the all-in range against the budget as a bar, and the three lines that move it most. Opens Numbers. */
export function MoneyTile({ deal, onOpen, index }: TileProps) {
  const reduce = useReducedMotion();
  const { impact, brief } = deal;
  const scale = moneyScale(impact.total, brief.budgetUsd);
  const words = budgetWords(impact.total, brief.budgetUsd);
  const lines = biggestLines(impact.analysis);
  return (
    <Tile title="The money" source="Foreground X-Ray engine, benchmarks.json" opens="numbers" onOpen={onOpen} index={index}>
      <p className="text-[1.5rem] leading-none font-semibold tracking-[-0.02em] text-text">
        <CountUp to={impact.total.low} format={usd} delay={0.2} /> – <CountUp to={impact.total.high} format={usd} delay={0.2} />
      </p>
      <div className="relative mt-3 h-2 rounded-full bg-[oklch(1_0_0/0.08)]" aria-hidden>
        <motion.div
          className="absolute inset-y-0 origin-left rounded-full bg-text"
          style={{ left: `${scale.low}%`, width: `${Math.max(2, scale.high - scale.low)}%` }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: DUR.draw, ease: EASE.out, delay: 0.3 }}
        />
        {scale.budget !== null ? <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-live" style={{ left: `${scale.budget}%` }} /> : null}
      </div>
      <p className="mt-2 text-sm text-text-2">
        {brief.budgetUsd !== undefined ? <>Budget {usd(brief.budgetUsd)}</> : "No budget given"}
        {words ? <span className={cn("ml-1", TONE_TEXT[words.tone])}>: {words.text}</span> : null}
      </p>
      <ul className="mt-auto space-y-1 pt-2">
        {lines.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-text">{l.label}</span>
            <span className={cn("shrink-0 tabular-nums", TONE_TEXT[l.status])}>
              {usdRange(l.range)} <span className="flow-label">{WORDS[l.status]}</span>
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
