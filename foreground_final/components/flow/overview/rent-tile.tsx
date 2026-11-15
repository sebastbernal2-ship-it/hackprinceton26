"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { usd } from "@/lib/format";
import { rentFor } from "@/lib/ml/rent";
import { cn } from "@/lib/utils";
import { CountUp } from "../count-up";
import { DUR, EASE } from "../motion";
import { NotInData, Tile, TONE_TEXT } from "../tile";
import { rentView } from "./data";
import type { TileProps } from "./types";

/** "The rent": the asking rent against the fair-rent model's band, the gap a year, the band in words. Opens Deal (the rent ask). */
export function RentTile({ deal, onOpen, index }: TileProps) {
  const reduce = useReducedMotion();
  const rent = useMemo(() => rentFor(deal.site.id), [deal.site.id]);
  if (!rent) {
    return (
      <Tile title="The rent" source="Foreground fair-rent model" opens="deal" onOpen={onOpen} index={index}>
        <NotInData what="Fair-rent estimate" />
      </Tile>
    );
  }
  const v = rentView(rent);
  const tone = v.uncertain ? "maybe" : v.band === "above market" ? "needed" : v.band === "below market" ? "saved" : null;
  return (
    <Tile title="The rent" source={`Foreground fair-rent model, ${Math.round(rent.intervalLevel * 100)}% interval, NNN basis`} opens="deal" onOpen={onOpen} index={index}>
      <p className="text-[1.5rem] leading-none font-semibold tracking-[-0.02em] text-text">
        <CountUp to={v.asking} format={(n) => `$${n.toFixed(0)}`} delay={0.2} />
        <span className="ml-1 text-sm font-medium text-text-2">/SF/yr asking</span>
      </p>
      <div className="relative mt-4 h-2 rounded-full bg-[oklch(1_0_0/0.08)]" aria-hidden>
        <motion.div
          className="absolute inset-y-0 origin-left rounded-full bg-live-wash outline outline-1 outline-live"
          style={{ left: `${v.pLow}%`, width: `${v.pHigh - v.pLow}%` }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: DUR.draw, ease: EASE.out, delay: 0.3 }}
        />
        <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-text" style={{ left: `${v.pAsk}%` }} />
      </div>
      <p className="mt-2 text-sm text-text-2">
        Fair band ${v.low.toFixed(0)} to ${v.high.toFixed(0)}/SF/yr
      </p>
      <p className={cn("mt-auto pt-2 text-sm", tone ? TONE_TEXT[tone] : "text-text")}>
        {v.uncertain
          ? "Quoted gross, so the band is shaky. Ask what the NNN rent is."
          : v.band === "in line"
            ? "In line with the fair band."
            : `${v.band === "above market" ? "Above" : "Below"} the fair band: about ${usd(Math.abs(v.gapPerYr))} a year ${v.band === "above market" ? "over" : "under"}.`}
      </p>
    </Tile>
  );
}
