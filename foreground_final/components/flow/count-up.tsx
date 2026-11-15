"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { DUR, EASE } from "./motion";

/**
 * A figure that counts from 0 (or its previous value) to `to` over DUR.count. Frames write textContent directly,
 * so there is no React render per frame. Reduced motion renders the final value. Server HTML carries the final value.
 */
export function CountUp({ to, format, delay = 0, className }: { to: number; format: (n: number) => string; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = format(to);
      shown.current = to;
      return;
    }
    const c = animate(shown.current ?? 0, to, {
      duration: DUR.count,
      ease: EASE.out,
      delay: shown.current === null ? delay : 0,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = format(v);
      },
      onComplete: () => {
        shown.current = to;
        el.textContent = format(to);
      },
    });
    return () => c.stop();
    // format is a pure function of the value; callers pass inline arrows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, reduce, delay]);
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(to)}
    </span>
  );
}
