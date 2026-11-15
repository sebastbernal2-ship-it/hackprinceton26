"use client";

import { useMemo } from "react";
import { getSiteSurvival, modelSkill } from "@/lib/ml/survival";
import { cn } from "@/lib/utils";
import { CountUp } from "../count-up";
import { NotInData, Tile } from "../tile";
import { weeksToOpen } from "./data";
import type { TileProps } from "./types";

const TREND_WORD = { tailwind: "Tailwind", neutral: "Neutral", headwind: "Headwind" } as const;
const whole = (n: number) => String(Math.round(n));

/** The strip: block trend, the survival model's three-year read with its top factors, and weeks to open. Opens Numbers. */
export function BlockTile({ deal, onOpen, index, className }: TileProps & { className?: string }) {
  const a = deal.impact.analysis;
  const weeks = weeksToOpen(a.timeToOpen);
  const surv = useMemo(() => getSiteSurvival(deal.site.id), [deal.site.id]);
  const auc = useMemo(() => modelSkill().rocAuc.toFixed(2), []);
  return (
    <Tile title="The block" source={`Block trend and time to open: Foreground engine. Survival: weak signal, out-of-time ROC-AUC ${auc}`} opens="numbers" onOpen={onOpen} index={index} className={cn(className)}>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.5fr_0.9fr] gap-6 overflow-hidden">
        <div className="min-w-0">
          <div className="flow-label text-text-3">Block trend</div>
          <div className="text-base font-semibold text-text">{TREND_WORD[a.trend.rating]}</div>
          <ul className="mt-1 space-y-0.5 text-xs text-text-2">
            {a.trend.signals.slice(0, 1).map((s) => (
              <li key={s.label} className="truncate" title={s.detail}>
                {s.label}: {s.direction}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <div className="flow-label text-text-3">Still open after 3 years (model)</div>
          {surv ? (
            <>
              <div className="text-base font-semibold text-text">
                {surv.displayText} <span className="text-sm font-medium text-text-2">{surv.relativeBand}</span>
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-text-2">
                {surv.topFactors.slice(0, 2).map((f) => (
                  <li key={f.label} className="truncate" title={f.summary}>
                    {f.summary}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <NotInData />
          )}
        </div>
        <div className="min-w-0">
          <div className="flow-label text-text-3">Weeks to open</div>
          <div className="text-base font-semibold text-text">
            <CountUp to={weeks.low} format={whole} delay={0.3} /> to <CountUp to={weeks.high} format={whole} delay={0.3} />
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-text-2" title={a.timeToOpen.basis}>
            {a.timeToOpen.basis}
          </p>
        </div>
      </div>
    </Tile>
  );
}
