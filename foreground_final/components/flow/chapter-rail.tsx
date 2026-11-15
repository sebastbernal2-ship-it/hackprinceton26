"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { CHAPTERS, CHAPTER_LABEL, type Chapter } from "./chapter-model";
import { EXIT_SCALE, REDUCED, SPRING } from "./motion";

/**
 * The six chapters, always clickable once a space is chosen. Visited chapters carry a bone dot, the current one a
 * `live` bar that slides between items (`layoutId="rail-cursor"`), the rest are `text-3`. Enters once, with the
 * Guide: it materializes (blur and scale together) rather than fading.
 */
export function ChapterRail({ current, visited, onSelect }: { current: Chapter; visited: readonly Chapter[]; onSelect: (c: Chapter) => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.nav
      aria-label="Chapters"
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: -24, scale: 0.96, filter: "blur(8px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16, transition: { duration: 0.4 * EXIT_SCALE } }}
      transition={reduce ? REDUCED : SPRING.morph}
      style={{ borderRadius: 28 }}
      className="glass relative z-10 flex h-full min-h-0 flex-col items-stretch justify-center gap-1 px-1.5 py-3"
    >
      {CHAPTERS.map((c, i) => {
        const active = c === current;
        const seen = visited.includes(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            aria-current={active ? "step" : undefined}
            aria-keyshortcuts={String(i + 1)}
            title={`${CHAPTER_LABEL[c]} (${i + 1})`}
            className={cn(
              "relative flex h-16 flex-col items-center justify-center gap-1 rounded-[20px] outline-none transition-[color,transform] duration-100 active:scale-[0.97]",
              "focus-visible:ring-2 focus-visible:ring-live",
              active ? "text-text" : seen ? "text-text-2 hover:text-text" : "text-text-3 hover:text-text-2",
            )}
          >
            {active ? (
              <motion.span
                layoutId="rail-cursor"
                transition={reduce ? REDUCED : SPRING.ui}
                aria-hidden="true"
                className="absolute top-3 bottom-3 -left-0.5 w-[3px] rounded-full bg-live"
              />
            ) : null}
            <span className="flex items-center gap-1 font-mono text-[0.6875rem] leading-none tabular-nums">
              {seen && !active ? <span aria-hidden="true" className="size-1 rounded-full bg-text" /> : null}
              {i + 1}
            </span>
            <span className="flow-label">{CHAPTER_LABEL[c]}</span>
          </button>
        );
      })}
    </motion.nav>
  );
}
