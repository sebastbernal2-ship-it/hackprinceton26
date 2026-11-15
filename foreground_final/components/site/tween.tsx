"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { num, pct, usd } from "@/lib/format";
import { DUR, EASE_OUT } from "./motion-tokens";

export type TweenKind = "usd" | "int" | "dec1" | "dec2" | "pct1" | "sf";

const FORMAT: Record<TweenKind, (n: number) => string> = {
  usd: (n) => usd(n),
  int: (n) => num(Math.round(n)),
  dec1: (n) => num(n, 1),
  dec2: (n) => num(n, 2),
  pct1: (n) => pct(n, 1),
  sf: (n) => `${num(Math.round(n))} SF`,
};

/**
 * A figure that counts to its value when it first scrolls into view, and rolls from the old value when it changes.
 * Server HTML carries the final value, so the number is right before hydration and without JS. Frames write
 * textContent directly (no React render per frame). Screen readers get the final value only.
 */
export function Tween({
  value,
  kind = "int",
  from = 0,
  delay = 0,
  className,
}: {
  value: number;
  kind?: TweenKind;
  /** where the first count starts */
  from?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduce = useReducedMotion();
  const fmt = FORMAT[kind];

  // Below the fold at mount: park at the start value so the count is seen when it arrives.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const below = el.getBoundingClientRect().top > window.innerHeight;
    // Above the fold, count only while the hero entrance is still playing; later (a slow hydration, a soft
    // navigation) the value the reader already sees stays put.
    const early = performance.now() < 2500;
    if (below || early) {
      el.textContent = fmt(from);
      shown.current = from;
    } else {
      shown.current = value;
    }
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = fmt(value);
      shown.current = value;
      return;
    }
    if (!inView) return;
    const start = shown.current ?? from;
    if (start === value) {
      el.textContent = fmt(value);
      return;
    }
    const first = shown.current === from && start === from;
    const controls = animate(start, value, {
      duration: first ? DUR.tween : DUR.state * 1.5,
      ease: EASE_OUT,
      delay: first ? delay : 0,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = fmt(v);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduce, fmt, from, delay]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums">
        {fmt(value)}
      </span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}

/** "$74k – $177k" with both ends counting. */
export function TweenRange({ low, high, delay = 0, className }: { low: number; high: number; delay?: number; className?: string }) {
  if (Math.round(low) === Math.round(high)) return <Tween value={low} kind="usd" delay={delay} className={className} />;
  return (
    <span className={className}>
      <Tween value={low} kind="usd" delay={delay} />
      <span aria-hidden> – </span>
      <span className="sr-only"> to </span>
      <Tween value={high} kind="usd" delay={delay} />
    </span>
  );
}
