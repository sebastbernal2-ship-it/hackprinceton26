"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { PlanItem, SiteNumbers, SiteVerdict } from "@/lib/agent/events";
import type { OwnerBrief } from "@/lib/engine/types";
import { num, usd, usdRange } from "@/lib/format";
import type { SiteCard } from "@/lib/sites/thumbs";
import { cn } from "@/lib/utils";
import { DimensionLine, niceMax } from "@/components/site/dimension-line";
import type { Decision } from "./use-agent-stream";

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;

const CONCEPT: Record<OwnerBrief["concept"], string> = {
  "quick-service": "Quick service",
  "fast-casual": "Fast casual",
  "full-service": "Full service",
  cafe: "Cafe",
  bar: "Bar",
};

/** Writes a brief back into the plain sentence the agent reads. */
export function briefToQuery(b: OwnerBrief): string {
  const what = `${CONCEPT[b.concept]}${b.cuisine ? ` ${b.cuisine}` : ""}`;
  return [what, b.seats ? `${b.seats} seats` : null, b.budgetUsd ? `$${Math.round(b.budgetUsd / 1000)}k` : null, b.city ?? null]
    .filter(Boolean)
    .join(", ");
}

const field = "h-10 min-w-0 rounded-sm border border-on-ink/40 bg-paper px-2 text-base text-ink focus-visible:border-paper";

/** The title block, edited in place: change any cell and the scout re-runs on the new brief. */
function BriefEditor({ brief, onSubmit, onCancel }: { brief: OwnerBrief; onSubmit: (b: OwnerBrief) => void; onCancel: () => void }) {
  return (
    <motion.form
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-on-ink/25 pt-3 sm:grid-cols-[1.2fr_1fr_0.7fr_0.9fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const seats = Number(f.get("seats"));
        const budget = Number(f.get("budget"));
        onSubmit({
          ...brief,
          concept: f.get("concept") as OwnerBrief["concept"],
          cuisine: String(f.get("cuisine") ?? "").trim() || undefined,
          seats: seats > 0 ? seats : undefined,
          budgetUsd: budget > 0 ? budget * 1000 : undefined,
          city: (f.get("city") as OwnerBrief["city"]) || undefined,
        });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      aria-label="Edit your brief"
    >
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.06em] text-on-ink-2">
        Concept
        <select name="concept" defaultValue={brief.concept} className={field} autoFocus>
          {Object.entries(CONCEPT).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.06em] text-on-ink-2">
        Cuisine
        <input name="cuisine" defaultValue={brief.cuisine ?? ""} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.06em] text-on-ink-2">
        Seats
        <input name="seats" type="number" min={8} max={400} defaultValue={brief.seats ?? ""} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.06em] text-on-ink-2">
        Budget ($k)
        <input name="budget" type="number" min={10} max={2000} step={5} defaultValue={brief.budgetUsd ? Math.round(brief.budgetUsd / 1000) : ""} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.06em] text-on-ink-2">
        City
        <select name="city" defaultValue={brief.city ?? ""} className={field}>
          <option value="">Either city</option>
          <option value="Houston">Houston</option>
          <option value="Los Angeles">Los Angeles</option>
        </select>
      </label>
      <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
        <button type="submit" className="h-10 rounded-sm bg-paper px-3 font-semibold text-ink transition-transform duration-150 active:scale-[0.97]">
          Re-run
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-sm border border-on-ink/40 px-3 transition-colors hover:border-on-ink">
          Cancel
        </button>
      </div>
    </motion.form>
  );
}

/** The parsed brief as the plat's title block: one row of ruled cells, editable in place. */
export function BriefTitleBlock({
  brief,
  source,
  onRerun,
}: {
  brief: OwnerBrief | null;
  source: "llm" | "regex" | null;
  onRerun?: (b: OwnerBrief) => void;
}) {
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);
  if (editing && brief && onRerun) {
    return (
      <BriefEditor
        brief={brief}
        onCancel={() => setEditing(false)}
        onSubmit={(b) => {
          setEditing(false);
          onRerun(b);
        }}
      />
    );
  }
  const cells: [string, string | null][] = [
    ["Concept", brief ? `${CONCEPT[brief.concept]}${brief.cuisine ? `, ${brief.cuisine}` : ""}` : null],
    ["Seats", brief ? (brief.seats ? num(brief.seats) : "Not given") : null],
    ["Budget", brief ? (brief.budgetUsd ? usd(brief.budgetUsd) : "Not given") : null],
    ["City", brief ? (brief.city ?? "Either city") : null],
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 border-t border-on-ink/25 sm:grid-cols-4">
        {cells.map(([k, v], i) => (
          <div key={k} className="flex flex-col gap-1 border-b border-on-ink/25 py-3 pr-3 sm:border-r sm:border-b-0 sm:pl-3 sm:first:pl-0 sm:last:border-r-0">
            <dt className="text-xs font-medium uppercase tracking-[0.06em] text-on-ink-2">{k}</dt>
            <dd className="lettering min-h-8 text-[1.75rem] font-semibold leading-none">
              <AnimatePresence mode="wait" initial={false}>
                {v ? (
                  <motion.span
                    key={v}
                    className="block"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: EASE_OUT, delay: reduce ? 0 : i * 0.07 }}
                  >
                    {v}
                  </motion.span>
                ) : (
                  <motion.span key="wait" className="block h-6 w-24 rounded-sm bg-on-ink/10 motion-safe:animate-pulse" exit={{ opacity: 0 }} />
                )}
              </AnimatePresence>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[0.6875rem] text-on-ink-2">
          {source ? `src read from your words by ${source === "llm" ? "the planner" : "pattern match"}` : "Reading your brief"}
        </p>
        {brief && onRerun ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-on-ink/40 px-3 text-sm transition-[border-color,transform] duration-150 hover:border-on-ink active:scale-[0.97]"
          >
            <Pencil aria-hidden className="size-3.5" /> Edit brief and re-run
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Survey checklist: each tick is drawn, not swapped. */
export function PlanChecklist({ items, running, finished }: { items: PlanItem[]; running: boolean; finished: boolean }) {
  const reduce = useReducedMotion();
  if (items.length === 0) return <p className="text-sm text-ink-2">{running ? "Making a plan" : "No plan yet."}</p>;
  const shown = finished ? items.map((it) => (it.status === "in_progress" ? { ...it, status: "completed" as const } : it)) : items;
  return (
    <ol className="flex flex-col">
      {shown.map((it, i) => (
        <li key={i} className="grid grid-cols-[1.5rem_1fr] items-start gap-2 border-b border-rule py-2 last:border-b-0">
          <svg viewBox="0 0 20 20" className="mt-0.5 size-5" aria-hidden>
            <rect x="2.5" y="2.5" width="15" height="15" rx="1" fill="none" stroke={it.status === "pending" ? "var(--rule-strong)" : "var(--ink)"} strokeWidth="1.25" />
            {it.status === "completed" ? (
              <motion.path
                d="M5.5 10.5 8.5 13.5 14.5 6.5"
                fill="none"
                stroke="var(--saved)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
              />
            ) : it.status === "in_progress" ? (
              <rect x="7" y="7" width="6" height="6" fill="var(--ink)" className={cn(running && "motion-safe:animate-pulse")} />
            ) : null}
          </svg>
          <span className={cn("text-sm leading-snug", it.status === "in_progress" ? "font-semibold text-ink" : "text-ink-2")}>
            <span className="sr-only">{it.status === "completed" ? "Done: " : it.status === "in_progress" ? "Working on: " : "Next: "}</span>
            {it.content}
          </span>
        </li>
      ))}
    </ol>
  );
}

const VERDICT: Record<SiteVerdict["verdict"], { text: string; cls: string }> = {
  strong: { text: "Strong", cls: "border-saved bg-saved text-on-ink" },
  workable: { text: "Workable", cls: "border-saved text-saved" },
  risky: { text: "Risky", cls: "border-dashed border-maybe-ink text-maybe-ink" },
  reject: { text: "Reject", cls: "border-needed text-needed" },
};

export function VerdictMark({ verdict }: { verdict: SiteVerdict["verdict"] }) {
  const v = VERDICT[verdict];
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING}
      className={cn("inline-block rounded-sm border px-1.5 py-px text-[0.6875rem] font-semibold uppercase tracking-[0.06em]", v.cls)}
    >
      {v.text}
    </motion.span>
  );
}

/** Build-out range drawn as a dimension line against the budget capacity. */
export function BudgetMini({ range, budget }: { range: SiteNumbers["buildoutUsd"]; budget: number | null | undefined }) {
  const max = niceMax(Math.max(range.high, budget ?? 0) * 1.05);
  const over = budget != null && range.mid > budget;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {budget ? (
          <div aria-hidden className="absolute top-[3px] left-0 h-3.5 border-r-2 border-ink bg-paper-2" style={{ width: `${(budget / max) * 100}%` }} />
        ) : null}
        <DimensionLine range={range} max={max} status={over ? "needed" : "saved"} />
      </div>
      <p className="flex flex-wrap justify-between gap-x-3 text-xs text-ink-2">
        <span className={cn("font-semibold", over ? "text-needed" : "text-saved")}>{usdRange(range)}</span>
        {budget ? <span>budget {usd(budget)}</span> : null}
      </p>
    </div>
  );
}

function moveDirection(reason: string): "up" | "down" | null {
  if (/\b(falls|drops|down to|ranked last|last of|slips)\b/i.test(reason)) return "down";
  if (/\b(moves (up|to)|rises|climbs|up to #|to #1)\b/i.test(reason)) return "up";
  return null;
}

/** "Falls from #1 on paper to #3": the destination is the "to #N", else the last #N mentioned. */
export function targetRank(reason: string): number | null {
  const m = /\bto #(\d+)/i.exec(reason)?.[1] ?? [...reason.matchAll(/#(\d+)/g)].at(-1)?.[1];
  return m ? Number(m) : null;
}

export function DecisionFeed({ decisions, sites }: { decisions: Decision[]; sites: Record<string, SiteCard> }) {
  const reduce = useReducedMotion();
  if (decisions.length === 0) return <p className="text-sm text-ink-2">Nothing decided yet. Drops and reranks appear here as they happen.</p>;
  return (
    <ol className="flex flex-col">
      <AnimatePresence initial={false}>
        {decisions.map((d) => {
          const name = sites[d.siteId]?.address ?? d.numbers?.address ?? `Site ${d.siteId}`;
          const toLast = d.action === "rerank" && /\b(ranked last|last of|to last)\b/i.test(d.reason);
          const target = d.action === "rerank" && !toLast ? targetRank(d.reason) : null;
          const dir = d.action === "rerank" ? moveDirection(d.reason) : null;
          return (
            <motion.li
              key={d.seq}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="grid grid-cols-[4.75rem_1fr] gap-x-3 border-b border-rule py-2.5"
            >
              <span className="pt-0.5">
                {d.action === "drop" ? (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-needed px-1.5 py-px text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-on-ink">
                    <X aria-hidden className="size-3" /> Drop
                  </span>
                ) : d.action === "rerank" ? (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-ink px-1.5 py-px text-[0.6875rem] font-semibold uppercase tracking-[0.06em]">
                    {dir === "down" || toLast ? <ArrowDown aria-hidden className="size-3" /> : <ArrowUp aria-hidden className="size-3" />}
                    {toLast ? "Last" : target ? `#${target}` : "Move"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-saved px-1.5 py-px text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-saved">
                    <Check aria-hidden className="size-3" /> Keep
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <p className={cn("text-sm font-semibold leading-snug", d.action === "drop" && "line-through decoration-needed decoration-2")}>{name}</p>
                <p className="text-xs leading-snug text-ink-2">{d.reason}</p>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
