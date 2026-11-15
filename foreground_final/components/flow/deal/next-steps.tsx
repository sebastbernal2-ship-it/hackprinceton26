"use client";

import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE, stagger } from "../motion";
import type { Step } from "./data";

/** Next steps as a timeline: permits the plan triggers, the build-out, the opening, each with weeks and its source. */
export function NextSteps({ steps }: { steps: Step[] }) {
  const reduce = useReducedMotion();
  return (
    <ol className="relative flex min-h-0 flex-1 items-start gap-0">
      {steps.map((s, i) => (
        <li key={s.id} className="relative min-w-0 flex-1 pr-3">
          <motion.span
            aria-hidden
            className="absolute top-[5px] left-3 h-px w-full origin-left bg-line-strong"
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: DUR.reveal, ease: EASE.out, delay: 0.3 + stagger(i) }}
            style={{ display: i === steps.length - 1 ? "none" : undefined }}
          />
          <span className="relative block size-[11px] rounded-full bg-text ring-4 ring-stage-2" />
          <p className="mt-1.5 truncate text-xs font-medium text-text" title={`${s.label}. ${s.detail} Source: ${s.source}`}>
            {s.label}
          </p>
          <p className="flow-label truncate text-text-2 tabular-nums">{s.weeks ? `${s.weeks.low} to ${s.weeks.high} weeks` : "now"}</p>
        </li>
      ))}
    </ol>
  );
}
