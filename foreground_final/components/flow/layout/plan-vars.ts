import type { CSSProperties } from "react";

/** v2 colors for the plan, which was drawn in the old paper-and-ink tokens: scoped, so nothing else changes */
export const PLAN_VARS = {
  "--paper": "oklch(0.2 0.01 60)",
  "--paper-2": "oklch(0.26 0.012 60)",
  "--ink": "oklch(0.96 0.012 85)",
  "--ink-2": "oklch(0.78 0.015 80)",
  "--rule": "oklch(1 0 0 / 0.1)",
  "--rule-strong": "oklch(1 0 0 / 0.2)",
  "--ring": "oklch(0.82 0.09 235)",
} as CSSProperties;

