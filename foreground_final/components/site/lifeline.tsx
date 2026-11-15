"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { num, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DUR, EASE_OUT, SPRING } from "./motion-tokens";
import { Estimate, Src } from "./primitives";

export type LifeTenant = {
  name: string;
  moveIn: string;
  moveOut: string | null;
  years: number | null;
  suite: string | null;
  sameSuite: boolean;
  current: boolean;
  outcome: "closed" | "moved" | "current" | "unknown";
};

export type LifeCase = { key: "slow" | "base" | "strong"; name: string; points: number[] /* cash at years 1..3 */ };

const CASE_STYLE = {
  slow: { color: "var(--needed)", dash: "6 4" },
  base: { color: "var(--ink)", dash: undefined },
  strong: { color: "var(--saved)", dash: "2 3" },
} as const;

/** "left" unless CoStar records the tenant as closed: we never call a departure a failure. */
export const DEPARTURE = {
  closed: "closed",
  moved: "left",
  unknown: "left, reason unknown",
  current: "open now",
} as const;

function yearFrac(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.getUTCFullYear() + d.getUTCMonth() / 12 + (d.getUTCDate() - 1) / 365;
}

/** Today's date, read on the client only (the server render stays cacheable; the chart draws after mount anyway). */
const noop = () => () => {};
let todayIso: string | null = null;
const readToday = () => (todayIso ??= new Date().toISOString().slice(0, 10));
function useToday(): string | null {
  return useSyncExternalStore(noop, readToday, () => null);
}

const LANE = 26;
const CASH_H = 170;
const GAP = 34;
const TOP = 30;

/**
 * Past and future on one line. Left of the "today" stake: every food tenant at the address, each bar ending where
 * it closed (red void mark) or left (ink tick). Right of it: your build-out, then the slow / base / strong cash
 * curves for three years after opening. The time scale changes at the stake (two decades left, three-odd years
 * right) and both scales are labelled. A scrubber moves through time and the readout answers "who was here, or
 * where would my cash be, at this moment".
 */
export function Lifeline(props: Omit<Parameters<typeof Chart>[0], "today">) {
  const today = useToday();
  if (!today) return <div aria-busy="true" className="min-h-[24rem] rounded-sm bg-paper-2/60" />;
  return <Chart {...props} today={today} />;
}

function Chart({
  tenants,
  today,
  openMonths,
  startCash,
  cases,
  suite,
}: {
  tenants: LifeTenant[];
  today: string;
  openMonths: number;
  startCash: number;
  cases: LifeCase[];
  suite: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const reduce = useReducedMotion();
  const inView = useInView(box, { once: true, amount: 0.35 });
  const play = inView || Boolean(reduce);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tToday = yearFrac(today);
  const tOpen = tToday + openMonths / 12;
  const tEnd = tOpen + 3;
  const food = [...tenants].sort((a, b) => a.moveIn.localeCompare(b.moveIn));
  const tMin = food.length ? Math.floor(Math.min(...food.map((t) => yearFrac(t.moveIn)))) : Math.floor(tToday) - 5;

  const [t, setT] = useState(tToday);

  const narrow = w < 560;
  const L = 8;
  const Rpad = narrow ? 8 : 92;
  const plotW = Math.max(10, w - L - Rpad);
  const P = narrow ? 0.5 : 0.58;
  const xStake = L + P * plotW;
  const x = (v: number) =>
    v <= tToday ? L + ((v - tMin) / (tToday - tMin || 1)) * P * plotW : xStake + ((v - tToday) / (tEnd - tToday)) * (1 - P) * plotW;
  const tFromX = (px: number) => {
    const c = Math.max(L, Math.min(L + plotW, px));
    return c <= xStake ? tMin + ((c - L) / (P * plotW)) * (tToday - tMin) : tToday + ((c - xStake) / ((1 - P) * plotW)) * (tEnd - tToday);
  };

  const lanesH = Math.max(1, food.length) * LANE;
  const cashTop = TOP + lanesH + GAP;
  const H = cashTop + CASH_H + 26;

  const all = cases.flatMap((c) => c.points).concat(startCash, 0);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const yc = (v: number) => cashTop + ((hi + pad - v) / (hi - lo + pad * 2)) * CASH_H;

  // cash at time t for a case: 0 today → startCash at opening → year points
  const cashAt = (c: LifeCase, at: number) => {
    if (at <= tToday) return 0;
    if (at <= tOpen) return ((at - tToday) / (tOpen - tToday || 1)) * startCash;
    const pts = [startCash, ...c.points];
    const yv = Math.min(3, at - tOpen);
    const i = Math.min(2, Math.floor(yv));
    return pts[i] + (pts[i + 1] - pts[i]) * (yv - i);
  };

  const pastTicks: number[] = [];
  const span = tToday - tMin;
  const tickStep = span > 14 ? 4 : span > 7 ? 2 : 1;
  for (let yv = Math.ceil(tMin); yv < tToday - 0.6; yv += tickStep) pastTicks.push(yv);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key.startsWith("Page") || e.shiftKey ? 1 : 1 / 12;
    let next = t;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown") next -= step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp") next += step;
    else if (e.key === "Home") next = tMin;
    else if (e.key === "End") next = tEnd;
    else return;
    e.preventDefault();
    setT(Math.max(tMin, Math.min(tEnd, next)));
  };

  const [drag, setDrag] = useState(false);
  const fromPointer = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setT(tFromX(e.clientX - r.left));
  };

  const readout = describe(t, { tToday, tOpen, food, cases, cashAt });

  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-ink-2">
        <span>
          <span className="font-semibold text-ink">Who was here</span> · food tenants at this address <Src>CoStar tenant records</Src>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-ink">What has to be true for you</span> · three years after opening <Estimate />
        </span>
      </div>

      <div
        ref={box}
        className={cn("relative w-full touch-pan-y select-none", drag ? "cursor-grabbing" : "cursor-ew-resize")}
        style={{ height: H }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(true);
          fromPointer(e);
        }}
        onPointerMove={(e) => drag && fromPointer(e)}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
      >
        {w > 0 ? (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden className="absolute inset-0 overflow-visible">
            {/* past scale */}
            <line x1={L} x2={xStake} y1={TOP - 12} y2={TOP - 12} stroke="var(--rule-strong)" />
            {pastTicks.map((tk) => (
              <g key={tk}>
                <line x1={x(tk)} x2={x(tk)} y1={TOP - 16} y2={H - 26} stroke="var(--rule)" strokeDasharray="1 3" />
                <text x={x(tk)} y={TOP - 18} textAnchor="middle" fontSize={10} fill="var(--ink-2)" style={{ fontFamily: "var(--font-geist-mono)" }}>
                  {tk}
                </text>
              </g>
            ))}
            {/* future scale */}
            {[
              { v: tOpen, label: "Open" },
              { v: tOpen + 1, label: "Yr 1" },
              { v: tOpen + 2, label: "Yr 2" },
              { v: tOpen + 3, label: "Yr 3" },
            ].map((tk) => (
              <g key={tk.label}>
                <line x1={x(tk.v)} x2={x(tk.v)} y1={TOP - 16} y2={H - 26} stroke="var(--rule)" strokeDasharray="1 3" />
                <text x={x(tk.v)} y={TOP - 18} textAnchor="middle" fontSize={10} fill="var(--ink-2)" style={{ fontFamily: "var(--font-geist-mono)" }}>
                  {tk.label}
                </text>
              </g>
            ))}

            {/* tenant bars */}
            {food.map((tn, i) => {
              const a = yearFrac(tn.moveIn);
              const end = tn.current ? tToday : tn.moveOut ? yearFrac(tn.moveOut) : a + (tn.years ?? 0.5);
              const yv = TOP + i * LANE + 16;
              const here = tn.sameSuite;
              const closed = tn.outcome === "closed";
              const color = here ? (closed ? "var(--needed)" : "var(--maybe)") : tn.current ? "var(--saved)" : "var(--ink-2)";
              const x0 = x(a);
              const x1 = Math.max(x0 + 3, x(Math.min(end, tToday)));
              const active = t >= a && t <= end && t <= tToday;
              return (
                <g key={`${tn.name}-${tn.moveIn}`}>
                  <text
                    x={Math.min(x0, xStake - 4)}
                    y={yv - 6}
                    textAnchor={x0 > xStake - 120 ? "end" : "start"}
                    fontSize={11}
                    fontWeight={active || here ? 600 : 400}
                    fill={here && closed ? "var(--needed)" : "var(--ink)"}
                    style={{ fontStretch: "88%" }}
                  >
                    {tn.name.length > 34 ? `${tn.name.slice(0, 32)}…` : tn.name}
                    {here ? ` · suite ${suite ?? tn.suite}` : ""}
                  </text>
                  <motion.rect
                    x={x0}
                    y={yv - 1}
                    width={x1 - x0}
                    height={6}
                    rx={1}
                    fill={color}
                    style={{ transformBox: "fill-box", originX: 0 }}
                    initial={{ scaleX: reduce ? 1 : 0, opacity: reduce ? 0 : 1 }}
                    animate={play ? { scaleX: 1, opacity: 1 } : undefined}
                    transition={{ duration: reduce ? DUR.quick : DUR.draw, ease: EASE_OUT, delay: reduce ? 0 : 0.15 + i * 0.12 }}
                  />
                  {!tn.current ? (
                    closed ? (
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={play ? { opacity: 1 } : undefined}
                        transition={{ duration: DUR.quick, delay: reduce ? 0 : 0.15 + i * 0.12 + DUR.draw * 0.8 }}
                      >
                        {/* survey void mark: where it closed */}
                        <line x1={x1 - 5} x2={x1 + 5} y1={yv - 3} y2={yv + 7} stroke="var(--needed)" strokeWidth={2} />
                        <line x1={x1 - 5} x2={x1 + 5} y1={yv + 7} y2={yv - 3} stroke="var(--needed)" strokeWidth={2} />
                      </motion.g>
                    ) : (
                      <motion.line
                        x1={x1}
                        x2={x1}
                        y1={yv - 5}
                        y2={yv + 9}
                        stroke="var(--ink)"
                        strokeWidth={1.5}
                        initial={{ opacity: 0 }}
                        animate={play ? { opacity: 1 } : undefined}
                        transition={{ duration: DUR.quick, delay: reduce ? 0 : 0.15 + i * 0.12 + DUR.draw * 0.8 }}
                      />
                    )
                  ) : null}
                </g>
              );
            })}

            {/* cash band */}
            <line x1={xStake} x2={L + plotW} y1={yc(0)} y2={yc(0)} stroke="var(--ink)" strokeWidth={1.25} />
            {!narrow ? (
              <text x={L + plotW + 6} y={yc(0) + 3.5} fontSize={10} fill="var(--ink)">
                cash back to zero
              </text>
            ) : null}
            <text x={xStake - 6} y={yc(0) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-2)">
              $0
            </text>
            <text x={xStake - 6} y={yc(startCash) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-2)">
              {usd(startCash)}
            </text>
            {/* building: today → opening */}
            <motion.path
              d={`M ${xStake} ${yc(0)} L ${x(tOpen)} ${yc(startCash)}`}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              initial={{ opacity: 0 }}
              animate={play ? { opacity: 1 } : undefined}
              transition={{ duration: DUR.state, delay: reduce ? 0 : 0.15 + food.length * 0.12 + 0.5 }}
            />
            {cases.map((c, k) => {
              const pts = [startCash, ...c.points].map((v, i) => `${x(tOpen + i)},${yc(v)}`);
              const s = CASE_STYLE[c.key];
              const endY = yc(c.points[2]);
              return (
                <g key={c.key}>
                  {/* drawn solid first (pathLength), its dash pattern takes over once it lands */}
                  <motion.polyline
                    points={pts.join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={c.key === "base" ? 2.5 : 2}
                    strokeLinejoin="round"
                    initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 0 : 1 }}
                    animate={play ? { pathLength: 1, opacity: s.dash ? 0 : 1 } : undefined}
                    transition={{
                      pathLength: { duration: DUR.draw * 1.2, ease: EASE_OUT, delay: reduce ? 0 : 0.15 + food.length * 0.12 + 0.75 + k * 0.12 },
                      opacity: { duration: DUR.quick, delay: reduce ? 0 : s.dash ? 0.15 + food.length * 0.12 + 0.75 + k * 0.12 + DUR.draw * 1.2 : 0 },
                    }}
                  />
                  {s.dash ? (
                    <motion.polyline
                      points={pts.join(" ")}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeDasharray={s.dash}
                      strokeLinejoin="round"
                      initial={{ opacity: 0 }}
                      animate={play ? { opacity: 1 } : undefined}
                      transition={{ duration: DUR.quick, delay: reduce ? 0 : 0.15 + food.length * 0.12 + 0.75 + k * 0.12 + DUR.draw * 1.2 }}
                    />
                  ) : null}
                  {!narrow ? (
                    <text x={L + plotW + 6} y={endY + 3.5 + (c.key === "slow" ? 6 : c.key === "strong" ? -6 : 0)} fontSize={10.5} fontWeight={600} fill={s.color}>
                      {c.name} {usd(c.points[2])}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* today stake: settles like a marker driven into the ground */}
            <motion.g
              initial={reduce ? { opacity: 0 } : { y: -18, opacity: 0 }}
              animate={play ? { y: 0, opacity: 1 } : undefined}
              transition={reduce ? { duration: DUR.quick } : { ...SPRING.settle, delay: 0.15 + food.length * 0.12 + 0.2 }}
            >
              <line x1={xStake} x2={xStake} y1={TOP - 26} y2={H - 20} stroke="var(--ink)" strokeWidth={2} />
              <path d={`M ${xStake - 6} ${TOP - 30} L ${xStake + 6} ${TOP - 30} L ${xStake} ${TOP - 22} Z`} fill="var(--needed)" />
              <text x={xStake + 6} y={H - 8} fontSize={10.5} fontWeight={600} fill="var(--ink)">
                Today
              </text>
            </motion.g>

            {/* scrubber */}
            <g>
              <line x1={x(t)} x2={x(t)} y1={TOP - 8} y2={H - 26} stroke="var(--focus-ring, oklch(0.52 0.16 250))" strokeWidth={1.25} />
              {t > tToday
                ? cases.map((c) => (
                    <circle key={c.key} cx={x(t)} cy={yc(cashAt(c, t))} r={3.5} fill="var(--paper)" stroke={CASE_STYLE[c.key].color} strokeWidth={2} />
                  ))
                : null}
            </g>
          </svg>
        ) : null}

        {w > 0 ? (
          <div
            role="slider"
            tabIndex={0}
            aria-label="Move through time"
            aria-valuemin={Math.round(tMin)}
            aria-valuemax={Math.round(tEnd)}
            aria-valuenow={Math.round(t * 10) / 10}
            aria-valuetext={readout.sr}
            onKeyDown={onKey}
            className="absolute flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-paper bg-ink text-on-ink transition-transform duration-150 hover:scale-110 active:scale-95"
            style={{ left: x(t), top: H - 40 }}
          >
            <svg viewBox="0 0 20 12" width="14" height="9" aria-hidden>
              <path d="M6 1 1 6l5 5M14 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </div>
        ) : null}
      </div>

      {/* readout: who was here, or where your cash would be */}
      <div aria-live="polite" className="grid min-h-[4.5rem] gap-x-8 gap-y-2 border-y border-rule py-3 sm:grid-cols-[10rem_1fr]">
        <p className="lettering text-2xl font-semibold leading-none">{readout.when}</p>
        <div className="text-sm">{readout.body}</div>
      </div>
      <figcaption className="text-xs text-ink-2">
        Drag along the line, or focus the handle and use the arrow keys (Page keys jump a year). The time scale changes at
        the stake: years of record to the left, your next {num(openMonths / 12 + 3, 1)} years to the right.
      </figcaption>
    </figure>
  );
}

function monthLabel(t: number) {
  const y = Math.floor(t);
  const m = Math.min(11, Math.floor((t - y) * 12));
  return new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function describe(
  t: number,
  ctx: {
    tToday: number;
    tOpen: number;
    food: LifeTenant[];
    cases: LifeCase[];
    cashAt: (c: LifeCase, at: number) => number;
  },
): { when: string; body: React.ReactNode; sr: string } {
  const { tToday, tOpen, food, cases, cashAt } = ctx;
  if (t <= tToday + 1 / 24) {
    const open = food.filter((tn) => {
      const a = yearFrac(tn.moveIn);
      const b = tn.current ? tToday : tn.moveOut ? yearFrac(tn.moveOut) : a + (tn.years ?? 0.5);
      return t >= a && t <= b;
    });
    const when = Math.abs(t - tToday) < 1 / 24 ? "Today" : monthLabel(t);
    const names = open.map((tn) => `${tn.name}${tn.sameSuite ? " (this suite)" : ""}, ${DEPARTURE[tn.current ? "current" : tn.outcome]}${tn.moveOut && !tn.current ? ` ${tn.moveOut.slice(0, 4)}` : ""}`);
    return {
      when,
      sr: `${when}: ${open.length ? `food tenants trading: ${names.join("; ")}` : "no food tenant on record"}`,
      body: open.length ? (
        <ul className="flex flex-col gap-0.5">
          {open.map((tn) => (
            <li key={`${tn.name}-${tn.moveIn}`}>
              <span className={cn("font-semibold", tn.sameSuite && tn.outcome === "closed" && "text-needed")}>{tn.name}</span>
              {tn.sameSuite ? <span className="text-maybe-ink"> · this suite</span> : null}
              <span className="text-ink-2">
                {" "}
                · {tn.moveIn.slice(0, 4)}–{tn.current ? "now" : (tn.moveOut ?? "?").slice(0, 4)} · {DEPARTURE[tn.current ? "current" : tn.outcome]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-ink-2">No food tenant on record at this moment.</span>
      ),
    };
  }
  if (t < tOpen) {
    const when = monthLabel(t);
    const v = cashAt(cases[0], t);
    return {
      when,
      sr: `${when}: building out, about ${usd(v)} spent`,
      body: (
        <span>
          Building out. About <span className="font-semibold">{usd(v)}</span> spent so far, midpoint of the X-Ray total, before the first sale. <Estimate />
        </span>
      ),
    };
  }
  const yrs = t - tOpen;
  const when = `Year ${num(Math.min(3, yrs), 1)}`;
  const vals = cases.map((c) => ({ c, v: cashAt(c, t) }));
  return {
    when,
    sr: `${when} after opening: ${vals.map(({ c, v }) => `${c.name} ${usd(v)}`).join(", ")}`,
    body: (
      <dl className="flex flex-wrap gap-x-8 gap-y-1">
        {vals.map(({ c, v }) => (
          <div key={c.key} className="flex items-baseline gap-2">
            <dt className="text-xs font-medium uppercase tracking-[0.06em]" style={{ color: CASE_STYLE[c.key].color }}>
              {c.name}
            </dt>
            <dd className={cn("lettering text-xl font-semibold tabular-nums", v < 0 && "text-needed")}>{usd(v)}</dd>
          </div>
        ))}
        <div className="flex items-baseline">
          <Estimate />
        </div>
      </dl>
    ),
  };
}
