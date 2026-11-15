"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { REDUCED, SPRING, stagger } from "./motion";

/** A plain-fill content card for the stage (never glass). Deals in with a stagger. */
export function Card({
  title,
  source,
  index = 0,
  className,
  children,
  aside,
  rotate = 0,
  delay,
}: {
  title: string;
  source?: string;
  index?: number;
  className?: string;
  children: ReactNode;
  aside?: ReactNode;
  /** degrees it starts rotated and settles from */
  rotate?: number;
  /** overrides the stagger delay (seconds) */
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      aria-label={title}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98, rotate }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={reduce ? REDUCED : { ...SPRING.ui, delay: delay ?? stagger(index) }}
      className={cn("pointer-events-auto flex min-h-0 min-w-0 flex-col overflow-hidden rounded-f-lg border border-line bg-stage-2/90 p-4", className)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flow-label text-text-2">{title}</h3>
        {aside}
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
      {source ? <p className="flow-source mt-2 truncate text-text-3">{source}</p> : null}
    </motion.section>
  );
}
