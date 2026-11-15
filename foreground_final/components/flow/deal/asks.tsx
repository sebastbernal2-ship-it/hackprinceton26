"use client";

import { motion, useReducedMotion } from "motion/react";
import { usdRange } from "@/lib/format";
import type { Ask } from "@/lib/outputs/ask-list";
import { cn } from "@/lib/utils";
import { DUR } from "../motion";

const PRIORITY = { high: "Ask first", medium: "Worth asking", low: "If it comes up" } as const;

/** Your asks, ranked, each with its dollar value and a checkbox. An unchecked ask is left out of the letter. */
export function AskList({ asks, unchecked, onToggle }: { asks: Ask[]; unchecked: ReadonlySet<string>; onToggle: (id: string) => void }) {
  const reduce = useReducedMotion();
  if (asks.length === 0) return <p className="text-sm text-maybe">No ask the data supports for this space.</p>;
  return (
    <ul className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
      {asks.map((a) => {
        const on = !unchecked.has(a.id);
        return (
          <li key={a.id}>
            <motion.label
              whileTap={reduce ? undefined : { scale: 0.98, transition: { duration: DUR.press } }}
              className={cn("flex cursor-pointer gap-2.5 rounded-f-md border p-2.5 transition-colors duration-150", on ? "border-line-strong bg-[oklch(1_0_0/0.05)]" : "border-line opacity-55")}
            >
              <input type="checkbox" checked={on} onChange={() => onToggle(a.id)} className="mt-0.5 size-4 shrink-0 accent-[oklch(0.96_0.012_85)] focus-visible:outline-2 focus-visible:outline-live" />
              <span className="min-w-0">
                <span className="block text-sm leading-snug font-medium text-text">{a.title}</span>
                <span className="flow-label mt-0.5 block text-text-2">
                  {PRIORITY[a.priority]}
                  {a.value ? ` | ${usdRange(a.value)}${a.basis === "per-year" ? " a year" : a.basis === "one-time" ? " once" : ""}` : " | a clause, no dollar figure"}
                </span>
                <span className="mt-1 line-clamp-2 block text-xs leading-snug text-text-3" title={a.why}>
                  {a.why}
                </span>
                <span className="flow-source mt-1 block truncate text-text-3">{a.source}</span>
              </span>
            </motion.label>
          </li>
        );
      })}
    </ul>
  );
}
