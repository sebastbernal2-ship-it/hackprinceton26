"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Chapter } from "./chapter-model";
import { CHAPTER_LABEL } from "./chapter-model";
import { DUR, REDUCED, SPRING, stagger } from "./motion";

export type DealTone = "needed" | "saved" | "maybe";
export const TONE_TEXT: Record<DealTone, string> = { needed: "text-needed", saved: "text-saved", maybe: "text-maybe" };

/**
 * One tile of the Overview dossier: a plain-fill button that opens its chapter. Lifts 2px on hover, presses to
 * 0.97 in DUR.press, deals in with a stagger. Never glass (glass is for the rail, the Guide and the impact bar).
 */
export function Tile({
  title,
  source,
  opens,
  onOpen,
  index,
  className,
  children,
}: {
  title: string;
  source: string;
  opens: Chapter;
  onOpen: (c: Chapter) => void;
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(opens)}
      aria-label={`${title}. Open ${CHAPTER_LABEL[opens]}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? REDUCED : { ...SPRING.ui, delay: stagger(index) }}
      whileHover={reduce ? undefined : { y: -2, transition: { duration: DUR.quick } }}
      whileTap={{ scale: 0.97, transition: { duration: DUR.press } }}
      className={cn(
        "group pointer-events-auto relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-f-lg border border-line bg-stage-2/90 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-live",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flow-label text-text-2">{title}</h3>
        <span className="flow-label text-text-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">Opens {CHAPTER_LABEL[opens]}</span>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
      <p className="flow-source mt-2 truncate text-text-3">{source}</p>
    </motion.button>
  );
}

/** a value the data does not have: words in `maybe`, never a number */
export function NotInData({ what }: { what?: string }) {
  return <span className="text-sm text-maybe">{what ? `${what}: not in the data` : "Not in the data"}</span>;
}

/** label over a value, for the small facts inside a tile */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flow-label text-text-3">{label}</div>
      <div className="truncate text-[0.8125rem] font-medium text-text tabular-nums">{children}</div>
    </div>
  );
}
