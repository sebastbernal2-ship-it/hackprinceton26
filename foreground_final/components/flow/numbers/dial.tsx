"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Concept } from "@/lib/engine/types";
import { CountUp } from "../count-up";
import { DUR, EASE } from "../motion";
import { dialScale } from "./data";

const VERDICT = {
  comfortable: { word: "Comfortable", cls: "text-saved" },
  stretch: { word: "A stretch", cls: "text-maybe" },
  unlikely: { word: "Unlikely on these seats", cls: "text-needed" },
} as const;

/** a point on the semicircle (0 = left end, 1 = right end) */
const pt = (f: number, r: number): [number, number] => [100 - r * Math.cos(Math.PI * f), 100 - r * Math.sin(Math.PI * f)];
const arc = (a: number, b: number, r = 80) => {
  const [x1, y1] = pt(a, r);
  const [x2, y2] = pt(b, r);
  return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`;
};

/** Break-even as a dial: turns a seat needs each day, on the concept's own comfortable / stretch / unlikely bands. */
export function BreakevenDial({ concept, covers, turns, seats, verdict }: { concept: Concept; covers: number; turns: number; seats: number; verdict: keyof typeof VERDICT }) {
  const reduce = useReducedMotion();
  const s = dialScale(concept, turns);
  const [nx, ny] = pt(s.value, 80);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center">
      <svg viewBox="0 0 200 112" className="w-full max-w-[250px]" role="img" aria-label={`Break-even needs ${turns.toFixed(1)} turns a day. Comfortable up to ${s.comfortableMax}, a stretch up to ${s.stretchMax}.`}>
        <path d={arc(0, s.a)} fill="none" stroke="var(--color-saved)" strokeOpacity="0.35" strokeWidth="10" />
        <path d={arc(s.a, s.b)} fill="none" stroke="var(--color-maybe)" strokeOpacity="0.35" strokeWidth="10" />
        <path d={arc(s.b, 1)} fill="none" stroke="var(--color-needed)" strokeOpacity="0.35" strokeWidth="10" />
        <motion.path
          d={arc(0, Math.max(0.001, s.value))}
          fill="none"
          stroke="var(--color-text)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: DUR.draw, ease: EASE.out, delay: 0.3 }}
        />
        <motion.circle cx={nx} cy={ny} r="6" fill="var(--color-stage)" stroke="var(--color-text)" strokeWidth="2.5" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + DUR.draw }} />
      </svg>
      <p className="-mt-9 text-center text-[1.75rem] leading-none font-semibold tracking-[-0.02em] text-text">
        <CountUp to={covers} format={(n) => String(Math.round(n))} delay={0.3} />
        <span className="ml-1 text-sm font-medium text-text-2">covers a day</span>
      </p>
      <p className="mt-1 text-center text-xs text-text-2">
        {seats} seats x {turns.toFixed(1)} turns
      </p>
      <p className={`mt-auto pt-2 text-sm font-medium ${VERDICT[verdict].cls}`}>{VERDICT[verdict].word}</p>
    </div>
  );
}
