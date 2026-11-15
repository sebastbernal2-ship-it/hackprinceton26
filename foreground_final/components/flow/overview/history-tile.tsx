"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "../motion";
import { NotInData, Tile } from "../tile";
import { tenantBars } from "./data";
import type { TileProps } from "./types";

/** "Who was here": the tenant lifeline, newest first. Food tenants are bold, the same suite is marked. Opens Deal (the history ask). */
export function HistoryTile({ deal, onOpen, index }: TileProps) {
  const reduce = useReducedMotion();
  const { bars, more } = tenantBars(deal.site.tenantHistory);
  const g = deal.impact.analysis.graveyard;
  return (
    <Tile title="Who was here" source="CoStar tenant records, Foreground graveyard model" opens="deal" onOpen={onOpen} index={index}>
      {bars.length === 0 ? (
        <NotInData what="Tenant history" />
      ) : (
        <ul className="space-y-1.5">
          {bars.map((b, i) => (
            <li key={`${b.name}-${i}`} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className={cn("truncate", b.food ? "font-medium text-text" : "text-text-3")}>
                  {b.name}
                  {b.sameSuite ? <span className="ml-1 rounded-full bg-live-wash px-1.5 text-live">same suite</span> : null}
                </span>
                <span className="shrink-0 text-text-3 tabular-nums">
                  {b.years != null ? `${b.years} yr` : "length unknown"}
                  {b.outcome === "closed" ? ", closed" : b.outcome === "current" ? ", open now" : ""}
                </span>
              </div>
              <motion.div
                className={cn("mt-0.5 h-1.5 origin-left rounded-full", b.food ? (b.outcome === "current" ? "bg-live" : "bg-text") : "bg-[oklch(1_0_0/0.18)]", b.years == null && "opacity-50")}
                style={{ width: `${b.widthPct}%` }}
                title={b.span}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: DUR.reveal, ease: EASE.out, delay: 0.2 + i * 0.05 }}
              />
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? <p className="flow-label mt-1 text-text-3">and {more} earlier</p> : null}
      <p className="mt-auto pt-2 text-sm text-text-2">{g.summary}</p>
    </Tile>
  );
}
