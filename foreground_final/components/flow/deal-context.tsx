"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { OwnerBrief } from "@/lib/engine";
import { assess, type Assessment } from "@/lib/feasibility";
import { autoLayout, type Layout, type LayoutImpact, type Op } from "@/lib/layout";
import { layoutChanges } from "./layout/changes";
import { layoutImpact } from "./layout/impact";
import type { Site } from "@/lib/sites/schema";

/**
 * The owner's deal in one object (docs/deal-flow-plan.md, section 0): the site, the brief, the plan, and what the
 * plan means. `impact` and `assessment` are pure and browser-safe, so they recompute here whenever the layout
 * changes and every chapter reads the same numbers. Nothing refetches.
 */
export type DealValue = {
  site: Site;
  brief: OwnerBrief;
  layout: Layout;
  impact: LayoutImpact;
  assessment: Assessment;
  /** the suggested plan the owner started from (what the impact bar compares against) */
  suggested: Layout;
};

const DealContext = createContext<DealValue | null>(null);

export function DealProvider({
  site,
  brief,
  layout,
  opLog,
  children,
}: {
  site: Site;
  brief: OwnerBrief;
  layout: Layout;
  opLog: Op[];
  children: ReactNode;
}) {
  const impact = useMemo(() => layoutImpact(site, brief, layout), [site, brief, layout]);
  // the checks the owner's edits trigger: the plan against the suggested one, one layout change per group touched
  const suggested = useMemo(() => autoLayout(site, brief), [site, brief]);
  const assessment = useMemo(
    () => assess({ site, brief, changes: layoutChanges(suggested, layout), layout, layoutOps: opLog }),
    [site, brief, layout, opLog, suggested],
  );
  const value = useMemo(() => ({ site, brief, layout, impact, assessment, suggested }), [site, brief, layout, impact, assessment, suggested]);
  return <DealContext.Provider value={value}>{children}</DealContext.Provider>;
}

/** null until the chosen space's deal has loaded */
export function useDeal(): DealValue | null {
  return useContext(DealContext);
}
