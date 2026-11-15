"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, ViewTransition } from "react";
import { ArrowRight, Undo2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RankedSite } from "@/lib/agent/events";
import type { OwnerBrief } from "@/lib/engine/types";
import { num, usd } from "@/lib/format";
import type { SiteCard } from "@/lib/sites/thumbs";
import { cn } from "@/lib/utils";
import { BudgetMini, EASE_OUT, SPRING, VerdictMark } from "./parts";
import { Tween } from "./tween";
import type { Inspector } from "./use-agent-stream";

/** Why a lane is voided: the scout dropped it, or the owner pulled it. */
export type Void = { by: "agent" | "you"; text: string };

const TOOL_LABEL: Record<string, string> = {
  search_sites: "Searching the listings",
  inspect_site: "Reading CoStar facts and scan findings",
  analyze_site: "Pricing build-out and break-even",
  compare_sites: "Comparing the sites",
};
const toolLabel = (n: string) => TOOL_LABEL[n] ?? n.replace(/_/g, " ");

const fmtUsd = (n: number) => usd(n);
const fmtTurns = (n: number) => num(n, 1);

export function siteHref(siteId: string, brief: OwnerBrief | null) {
  const p = new URLSearchParams();
  if (brief?.concept) p.set("concept", brief.concept);
  if (brief?.seats) p.set("seats", String(brief.seats));
  if (brief?.budgetUsd) p.set("budget", String(brief.budgetUsd));
  return `/site/${siteId}${p.size ? `?${p}` : ""}`;
}

/**
 * One site-inspector subagent as a survey lane: a line runs from the brief's baseline to the site's aerial,
 * the aerial is scanned while the inspector works, numbers roll in when it reports, a DROP voids the lane
 * and collapses it, and a rank arrives when the scout reorders the lanes.
 */
export const Lane = memo(function Lane({
  ins,
  site,
  brief,
  voided,
  restored,
  onToggle,
  rank,
  ranked,
}: {
  ins: Inspector;
  site: SiteCard | undefined;
  brief: OwnerBrief | null;
  voided: Void | undefined;
  /** the owner un-dropped a site the scout dropped */
  restored: boolean;
  onToggle: (siteId: string) => void;
  rank: number | null;
  ranked: RankedSite | undefined;
}) {
  const reduce = useReducedMotion();
  const running = ins.status === "running";
  const n = ranked?.numbers ?? ins.numbers;
  const budget = brief?.budgetUsd;
  const last = [...ins.tools].reverse().find((t) => t.status !== "start") ?? ins.tools.at(-1);
  const img = site?.aerial ?? site?.thumb ?? null;
  const name = site?.address ?? n?.address ?? `Site ${ins.siteId}`;
  const href = siteHref(ins.siteId, brief);
  const collapsed = Boolean(voided);

  return (
    <motion.li
      layout={reduce ? false : "position"}
      transition={SPRING}
      className={cn("relative grid grid-cols-[2.5rem_1fr] gap-x-3 sm:grid-cols-[3rem_3.5rem_1fr] sm:gap-x-0", collapsed ? "py-2" : "py-4")}
      aria-label={`${name}: ${voided ? (voided.by === "you" ? "removed by you" : "dropped") : ins.verdict ? ins.verdict.verdict : "inspecting"}`}
    >
      {/* rank or status stake */}
      <div className="flex items-start justify-center pt-1">
        <AnimatePresence mode="popLayout" initial={false}>
          {rank && !collapsed ? (
            <motion.span
              key={`r${rank}`}
              className="lettering text-[2.25rem] font-bold leading-none"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={SPRING}
            >
              {rank}
            </motion.span>
          ) : (
            <motion.span
              key="dot"
              className={cn("mt-2 block size-2.5 rounded-full", collapsed ? "bg-needed" : running ? "bg-maybe motion-safe:animate-pulse" : "bg-ink")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* survey line from the brief's baseline to this site */}
      <svg className="absolute top-0 left-[2.5rem] hidden h-full w-[3.5rem] sm:left-[3rem] sm:block" viewBox="0 0 56 100" preserveAspectRatio="none" aria-hidden>
        <motion.line
          x1={0}
          x2={56}
          y1={collapsed ? 50 : 34}
          y2={collapsed ? 50 : 34}
          stroke={collapsed ? "var(--needed)" : "var(--ink)"}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          strokeDasharray={running ? "4 3" : undefined}
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        />
      </svg>

      <div className={cn("col-start-2 grid min-w-0 gap-x-5 gap-y-3 sm:col-start-3", collapsed ? "grid-cols-[4rem_1fr]" : "grid-cols-1 md:grid-cols-[9rem_1fr_13rem]")}>
        {/* aerial, scanned while the inspector runs; becomes the site hero on navigation */}
        <Link href={href} className="group relative block self-start" tabIndex={-1} aria-hidden>
          <ViewTransition name={`site-hero-${ins.siteId}`} share="site-hero" default="none">
            <span
              className={cn(
                "relative block overflow-hidden rounded-sm border bg-ink transition-[border-color] duration-200",
                collapsed ? "aspect-[4/3] w-16 border-needed" : "aspect-[16/9] w-full border-ink md:aspect-[4/3]",
              )}
            >
              {img ? (
                <Image
                  src={img}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 144px, 90vw"
                  className={cn("object-cover transition-[filter,transform] duration-500", collapsed && "grayscale", !collapsed && "group-hover:scale-[1.03]")}
                />
              ) : null}
              {running ? (
                <span aria-hidden className="absolute inset-x-0 top-0 h-1/4">
                  <span className="scan-sweep block h-full w-full border-b-2 border-maybe bg-maybe/15" />
                </span>
              ) : null}
              {collapsed ? (
                <motion.svg aria-hidden viewBox="0 0 40 30" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  <motion.path
                    d="M4 4 36 26 M36 4 4 26"
                    stroke="var(--needed)"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                    fill="none"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: EASE_OUT }}
                  />
                </motion.svg>
              ) : null}
            </span>
          </ViewTransition>
        </Link>

        <motion.div layout={reduce ? false : "position"} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="min-w-0 font-semibold leading-snug">
              <Link
                href={href}
                className={cn(
                  "underline-offset-2 hover:underline",
                  collapsed && "text-ink-2 line-through decoration-needed decoration-2",
                )}
              >
                {name}
                {site?.suite ? <span className="font-normal text-ink-2">, Suite {site.suite}</span> : null}
              </Link>
            </h3>
            <span className="text-xs text-ink-2">{site?.city ?? n?.city}</span>
            {!collapsed && ins.verdict ? <VerdictMark verdict={ins.verdict.verdict} /> : null}
            {restored ? <span className="text-xs font-semibold text-saved">Kept by you</span> : null}
            <button
              type="button"
              onClick={() => onToggle(ins.siteId)}
              className={cn(
                "ml-auto inline-flex h-8 items-center gap-1 rounded-sm border px-2 text-xs font-semibold transition-[border-color,background-color,transform] duration-150 active:scale-[0.97]",
                collapsed ? "border-ink hover:bg-paper-2" : "border-rule-strong text-ink-2 hover:border-ink hover:text-ink",
              )}
              aria-label={collapsed ? `Undo drop: put ${name} back on the shortlist` : running ? `Interrupt: stop following ${name}` : `Remove ${name} from the shortlist`}
            >
              {collapsed ? <Undo2 aria-hidden className="size-3.5" /> : <X aria-hidden className="size-3.5" />}
              {collapsed ? "Undo drop" : running ? "Interrupt" : "Remove"}
            </button>
          </div>

          {collapsed ? (
            <p className="line-clamp-2 text-xs leading-snug text-ink-2">
              <span className="font-semibold text-needed">{voided?.by === "you" ? "Removed by you" : "Dropped"}: </span>
              {voided?.text}
            </p>
          ) : ranked ? (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="flex flex-col gap-1.5"
            >
              <p className="text-sm leading-snug">{ranked.oneLineReason}</p>
              {ranked.topRisk ? (
                <p className="text-sm leading-snug">
                  <span className="font-semibold text-maybe-ink">Top risk: </span>
                  <span className="text-ink-2">{ranked.topRisk}</span>
                </p>
              ) : null}
              <Link href={href} className="group/open mt-1 inline-flex w-fit items-center gap-1 text-sm font-semibold underline-offset-2 hover:underline">
                Open the site
                <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover/open:translate-x-0.5" />
              </Link>
            </motion.div>
          ) : (
            <p className="text-sm leading-snug text-ink-2" aria-live="polite">
              {ins.verdict?.headline ||
                (last ? (last.status === "done" && last.summary ? last.summary : `${toolLabel(last.name)}…`) : "Inspector on its way")}
            </p>
          )}
        </motion.div>

        {!collapsed ? (
          <div className="flex flex-col gap-2">
            {n ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.06em] text-ink-2">Build-out mid</span>
                  <Tween value={n.buildoutUsd.mid} format={fmtUsd} className={cn("lettering text-2xl font-semibold leading-none", n.overBudget ? "text-needed" : "text-saved")} />
                </div>
                <BudgetMini range={n.buildoutUsd} budget={budget} />
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.06em] text-ink-2">Break-even</span>
                  <span className="text-sm">
                    <Tween value={n.turnsPerDay} format={fmtTurns} className="lettering text-xl font-semibold" /> turns/day
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2" aria-hidden>
                <div className="h-6 rounded-sm bg-paper-2 motion-safe:animate-pulse" />
                <div className="h-4 rounded-sm bg-paper-2 motion-safe:animate-pulse" />
                <div className="h-5 w-2/3 rounded-sm bg-paper-2 motion-safe:animate-pulse" />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </motion.li>
  );
});
