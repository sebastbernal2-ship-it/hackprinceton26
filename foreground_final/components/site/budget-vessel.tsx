"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import type { CostLine, Range } from "@/lib/engine/types";
import { usd, usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { niceMax, niceStep } from "./dimension-line";
import { lineKey } from "./focus-key";
import { linkProps, useFocusedFinding } from "./focus-store";
import { DUR, EASE_OUT, SPRING, stagger } from "./motion-tokens";

const H = 300; // px, vessel figure height
const VESSEL_W = 44; // % of the plot width
const SAVED_LEFT = 56; // % where the lifted-out column starts
const LIFT_DUR = 1.3;
const LIFT_X = `${((SAVED_LEFT / VESSEL_W) * 100).toFixed(2)}%`;

export type VesselLine = Pick<CostLine, "id" | "label" | "status" | "range" | "findingId">;


/**
 * The budget as a vessel. Cost lines drop in as blocks (mid estimate; unknowns at the half share the total counts);
 * the rim is the owner's budget. Lines the space already has are dropped in too, then lift out over the wall into
 * the "already there" column, leaving a green trace of what they saved. Anything above the rim is hatched red, the
 * encroachment mark. Changing the brief re-flows the blocks (layout springs keyed by line id).
 */
export function BudgetVessel({
  lines,
  total,
  budget,
  maybeShare = 0.5,
}: {
  lines: VesselLine[];
  total: Range;
  budget: number | null;
  maybeShare?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const focused = useFocusedFinding();

  const counted = lines
    .filter((l) => l.status !== "saved")
    .map((l) => ({ ...l, v: l.status === "maybe" ? l.range.mid * maybeShare : l.range.mid }))
    .sort((a, b) => Number(a.id === "contingency") - Number(b.id === "contingency") || Number(a.status === "maybe") - Number(b.status === "maybe") || b.v - a.v);
  const saved = lines.filter((l) => l.status === "saved").map((l) => ({ ...l, v: l.range.mid })).sort((a, b) => b.v - a.v);

  const stackTop = counted.reduce((s, l) => s + l.v, 0);
  const savedSum = saved.reduce((s, l) => s + l.v, 0);
  const cap = niceMax(Math.max(stackTop, total.high, budget ?? 0, savedSum) * 1.08);
  const y = (v: number) => (v / cap) * H;
  const step = niceStep(cap);
  const ticks = Array.from({ length: Math.floor(cap / step) + 1 }, (_, i) => i * step);

  const below = (arr: { v: number }[], i: number) => arr.slice(0, i).reduce((s, l) => s + l.v, 0);
  const blocks = counted.map((l, i) => ({ ...l, bottom: y(below(counted, i)), h: Math.max(2, y(l.v) - 1.5), i }));
  // saved blocks start stacked on top of the counted ones (as if you had to buy them), then lift out
  const hOf = (v: number) => Math.max(2, y(v) - 1.5);
  const lifted = saved.map((l, k) => {
    const h = hOf(l.v);
    const from = y(stackTop + below(saved, k));
    const above = saved.slice(0, k).reduce((s, o) => s + hOf(o.v) + 6, 0);
    const finalBottom = H - above - h; // stacked down from the top of the column
    return { ...l, h, from, finalBottom, k, d: finalBottom - from };
  });

  const rim = budget != null ? y(budget) : null;
  const over = budget != null && stackTop > budget;
  const play = inView || reduce;
  const dropDelay = (i: number) => 0.15 + stagger(i);
  const liftDelay = (k: number) => dropDelay(blocks.length + k) + LIFT_DUR * 0.55;

  return (
    <figure
      ref={ref}
      className="m-0"
      aria-label={`Cost blocks stacked against your budget: ${usd(stackTop)} most likely${budget ? ` in a ${usd(budget)} vessel` : ""}; ${usd(savedSum)} already in the space.`}
    >
      <div className="relative ml-12" style={{ height: H }}>
        {/* scale */}
        <div aria-hidden className="absolute inset-y-0 -left-12 w-12">
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 translate-y-1/2 font-mono text-[0.625rem] text-ink-2" style={{ bottom: y(t) }}>
              {usd(t)}
            </span>
          ))}
        </div>
        <div aria-hidden className="absolute inset-0">
          {ticks.slice(1).map((t) => (
            <span key={t} className="absolute inset-x-0 border-t border-dotted border-rule" style={{ bottom: y(t) }} />
          ))}
        </div>

        {/* the vessel: walls up to the rim, open above it */}
        <motion.div
          layout
          transition={SPRING.reflow}
          aria-hidden
          className="absolute bottom-0 left-0 border-x-[1.5px] border-b-[1.5px] border-ink bg-paper-2/70"
          style={{ width: `${VESSEL_W}%`, height: rim ?? H, borderStyle: rim == null ? "dashed" : "solid" }}
        />

        {/* counted blocks */}
        {blocks.map((b) => {
          const key = lineKey(b);
          const active = focused === key;
          return (
            <motion.div
              key={b.id}
              layout="position"
              {...linkProps(key)}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -H * 0.55 }}
              animate={play ? { opacity: 1, y: 0 } : undefined}
              transition={{
                default: reduce ? { duration: DUR.quick } : { ...SPRING.drop, delay: dropDelay(b.i) },
                layout: SPRING.reflow,
              }}
              data-active={active}
              className={cn(
                "absolute left-0 overflow-hidden rounded-[1px] border px-1.5 text-[0.6875rem] leading-tight transition-colors",
                b.status === "maybe"
                  ? "border-dashed border-maybe-ink bg-maybe-wash text-maybe-ink"
                  : b.id === "contingency"
                    ? "border-ink-2 bg-paper text-ink-2"
                    : "border-needed bg-needed-wash text-ink",
                active && "outline-2 outline-offset-1 outline-ink",
              )}
              style={{ bottom: b.bottom, height: b.h, width: `${VESSEL_W}%` }}
              title={`${b.label}: ${usdRange(b.range)}${b.status === "maybe" ? " (counted at half)" : ""}`}
            >
              {b.h >= 15 ? (
                <span className="flex h-full items-center justify-between gap-1 overflow-hidden whitespace-nowrap">
                  <span className="truncate font-medium">{shortLabel(b.label)}</span>
                  {b.h >= 15 ? <span className="lettering shrink-0 font-semibold">{usd(b.v)}</span> : null}
                </span>
              ) : null}
            </motion.div>
          );
        })}

        {/* overflow above the rim: the encroachment hatch */}
        {over && rim != null ? (
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={play ? { opacity: 1 } : undefined}
            transition={{ duration: DUR.state, ease: EASE_OUT, delay: reduce ? 0 : dropDelay(blocks.length) + 0.25 }}
            className="hatch-needed pointer-events-none absolute left-0 border-t-2 border-needed/0 opacity-80"
            style={{ bottom: rim, height: y(stackTop) - rim, width: `${VESSEL_W}%` }}
          />
        ) : null}

        {/* the rim = your budget */}
        {rim != null ? (
          <motion.div layout transition={SPRING.reflow} aria-hidden className="absolute left-0 flex items-center" style={{ bottom: rim - 1, width: `calc(${VESSEL_W}% + 0.5rem)` }}>
            <span className="h-[3px] w-full bg-ink" />
          </motion.div>
        ) : null}
        {rim != null ? (
          <span className="absolute text-[0.6875rem] whitespace-nowrap text-ink-2" style={{ bottom: rim + 3, left: 0 }}>
            Rim = your budget <span className="font-semibold text-ink">{usd(budget!)}</span>
          </span>
        ) : null}

        {/* green traces: lifted-out lines and the path they took */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
          {lifted.map((s) => {
            const x0 = VESSEL_W;
            const y0 = H - s.from - s.h / 2;
            const x1 = SAVED_LEFT;
            const y1 = H - s.finalBottom - s.h / 2;
            const cx = (x0 + x1) / 2;
            const cy = Math.min(y0, y1) - 12;
            return (
              <motion.path
                key={s.id}
                d={`M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`}
                fill="none"
                stroke="var(--saved)"
                strokeWidth={1.25}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: reduce ? 1 : 0, opacity: 0 }}
                animate={play ? { pathLength: 1, opacity: 1 } : undefined}
                transition={{ duration: reduce ? DUR.quick : DUR.draw, ease: EASE_OUT, delay: reduce ? 0 : liftDelay(s.k) }}
              />
            );
          })}
        </svg>

        {saved.length > 0 ? (
          <span className="absolute top-0 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-saved" style={{ left: `${SAVED_LEFT}%`, transform: "translateY(-120%)" }}>
            Already there
          </span>
        ) : null}

        {lifted.map((s) => {
          const key = lineKey(s);
          const active = focused === key;
          return (
            <motion.div
              key={s.id}
              layout="position"
              {...linkProps(key)}
              initial={reduce ? { opacity: 0, x: LIFT_X, y: 0 } : { opacity: 0, x: "0%", y: s.d - H * 0.55 }}
              animate={
                play
                  ? reduce
                    ? { opacity: 1, x: LIFT_X, y: 0 }
                    : { opacity: [0, 1, 1, 1], x: ["0%", "0%", "0%", LIFT_X], y: [s.d - H * 0.55, s.d, s.d, 0] }
                  : undefined
              }
              transition={{
                default: reduce
                  ? { duration: DUR.quick }
                  : { duration: LIFT_DUR, times: [0, 0.35, 0.55, 1], ease: [EASE_OUT, "linear", EASE_OUT], delay: dropDelay(blocks.length + s.k) },
                layout: SPRING.reflow,
              }}
              data-active={active}
              className={cn(
                "absolute left-0 overflow-hidden rounded-[1px] border border-dashed border-saved bg-saved-wash px-1.5 text-[0.6875rem] leading-tight text-saved",
                active && "outline-2 outline-offset-1 outline-ink",
              )}
              style={{ bottom: s.finalBottom, height: s.h, width: `${VESSEL_W}%` }}
              title={`${s.label}: ${usdRange(s.range)} not spent`}
            >
              {s.h >= 15 ? (
                <span className="flex h-full items-center justify-between gap-1 overflow-hidden whitespace-nowrap">
                  <span className="truncate font-medium">{shortLabel(s.label)}</span>
                  <span className="lettering shrink-0 font-semibold line-through decoration-1">{usd(s.v)}</span>
                </span>
              ) : null}
            </motion.div>
          );
        })}
      </div>
      <figcaption className="mt-2 ml-12 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-ink-2">
        <Key cls="border-needed bg-needed-wash">You pay</Key>
        <Key cls="border-dashed border-maybe-ink bg-maybe-wash">Unknown, at half</Key>
        <Key cls="border-dashed border-saved bg-saved-wash">Already there</Key>
        {over ? <Key cls="hatch-needed border-needed">Over the rim</Key> : null}
      </figcaption>
    </figure>
  );
}

function Key({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("inline-block h-2.5 w-3.5 rounded-[1px] border", cls)} />
      {children}
    </span>
  );
}

function shortLabel(label: string) {
  return label.replace(/\s*\(.*?\)\s*/g, " ").trim();
}
