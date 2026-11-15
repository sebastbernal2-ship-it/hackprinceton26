"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Link2, PanelRightClose, PanelRightOpen, Search, Share2 } from "lucide-react";
import { useRef, useState, ViewTransition, type FormEvent } from "react";
import type { Concept, OwnerBrief } from "@/lib/engine/types";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { briefQuery, CONCEPT_LABEL } from "./url-state";

export type TopSite = { id: string; address: string; place: string; headline: string | null; aerial: string | null };

const CONCEPTS = Object.keys(CONCEPT_LABEL) as Concept[];

/** The workspace's title block: where you are, what you're planning (editable), and the two ways out: share, offer. */
export function TopBar({
  site,
  brief,
  briefPending,
  onBrief,
  onCommand,
  sheetOpen,
  onToggleSheet,
  briefRef,
}: {
  site: TopSite;
  brief: OwnerBrief;
  briefPending: boolean;
  onBrief: (b: Pick<OwnerBrief, "concept" | "seats" | "budgetUsd">) => void;
  onCommand: () => void;
  sheetOpen: boolean;
  onToggleSheet: () => void;
  /** lets the command bar open the brief editor */
  briefRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [shared, setShared] = useState<string | null>(null);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: `${site.address} · Foreground`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared("Link copied: it opens this exact view.");
    } catch {
      setShared("Copy the address bar to share this view.");
    }
    setTimeout(() => setShared(null), 2600);
  };
  const offerHref = `/site/${site.id}/offer?${briefQuery(brief)}`;

  return (
    <header className="ws-top relative z-30 flex h-[var(--ws-top)] shrink-0 items-center gap-2 border-b border-on-ink/15 bg-ink px-2 text-on-ink sm:gap-3 sm:px-3">
      <Link href="/" className="ws-icon-btn lg:hidden" aria-label="All sites">
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      <Link href="/" className="lettering-wide hidden shrink-0 px-1 text-[0.8125rem] font-bold hover:underline lg:block">
        Foreground
      </Link>
      <span aria-hidden className="hidden h-7 w-px bg-on-ink/20 lg:block" />

      {/* the parcel: its aerial stamp is the landing target for the morph from search results */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:flex-initial">
        {site.aerial ? (
          <ViewTransition name={`site-hero-${site.id}`} share="site-hero" default="none">
            <span className="relative hidden size-9 shrink-0 overflow-hidden rounded-sm border border-on-ink/25 sm:block">
              <Image src={site.aerial} alt="" fill sizes="36px" className="object-cover" priority />
            </span>
          </ViewTransition>
        ) : null}
        <div className="min-w-0">
          <h1 className="lettering truncate text-[1.0625rem] leading-tight font-semibold sm:text-lg">{site.address}</h1>
          <p className="truncate text-xs text-on-ink-2">
            <button type="button" popoverTarget="ws-brief" className="underline decoration-on-ink/30 underline-offset-2 lg:hidden" aria-label={`Your plan: ${CONCEPT_LABEL[brief.concept]}, ${brief.seats} seats, ${usd(brief.budgetUsd ?? 0)} budget. Edit`}>
              {CONCEPT_LABEL[brief.concept]} · {brief.seats} seats · {usd(brief.budgetUsd ?? 0)}
            </button>
            <span className="hidden lg:inline">{site.place}{site.headline ? ` · ${site.headline}` : ""}</span>
          </p>
        </div>
      </div>

      <BriefEditor brief={brief} pending={briefPending} onBrief={onBrief} buttonRef={briefRef} />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button type="button" onClick={onCommand} className="ws-cmd-btn" aria-label="Search and commands" aria-keyshortcuts="Control+K Meta+K">
          <Search className="size-4" aria-hidden />
          <span className="hidden xl:inline">Jump to…</span>
          <kbd className="hidden rounded-[2px] border border-on-ink/25 px-1 font-mono text-[0.6875rem] text-on-ink-2 xl:inline">⌘K</kbd>
        </button>
        <button type="button" onClick={share} className="ws-icon-btn sm:w-auto sm:gap-1.5 sm:px-3" aria-label="Share this view">
          {shared ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
          <span className="hidden sm:inline">Share</span>
        </button>
        <Link href={offerHref} className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-paper px-3 text-sm font-semibold text-ink transition-[transform,background-color] duration-150 hover:bg-paper-2 active:scale-[0.97] max-sm:h-11">
          <Link2 className="hidden size-4 sm:block" aria-hidden />
          Offer
        </Link>
        <button type="button" onClick={onToggleSheet} className="ws-icon-btn hidden lg:inline-flex" aria-label={sheetOpen ? "Hide the sheet" : "Show the sheet"} aria-pressed={sheetOpen} aria-keyshortcuts="\">
          {sheetOpen ? <PanelRightClose className="size-4" aria-hidden /> : <PanelRightOpen className="size-4" aria-hidden />}
        </button>
      </div>
      <p role="status" aria-live="polite" className={cn("pointer-events-none absolute top-full right-3 mt-2 rounded-sm bg-ink px-3 py-1.5 text-sm text-on-ink transition-opacity duration-200", shared ? "opacity-100" : "opacity-0")}>
        {shared}
      </p>
    </header>
  );
}

function BriefEditor({
  brief,
  pending,
  onBrief,
  buttonRef,
}: {
  brief: OwnerBrief;
  pending: boolean;
  onBrief: (b: Pick<OwnerBrief, "concept" | "seats" | "budgetUsd">) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 12, top: 64 });
  const place = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return setPos({ left: 12, top: 64 });
    const w = Math.min(340, window.innerWidth - 24);
    setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)), top: r.bottom + 8 });
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const clamp = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);
    onBrief({
      concept: (f.get("concept") as Concept) ?? brief.concept,
      seats: clamp(Number(f.get("seats")), 8, 400, brief.seats ?? 40),
      budgetUsd: clamp(Number(f.get("budget")), 10_000, 2_000_000, brief.budgetUsd ?? 250_000),
    });
    pop.current?.hidePopover();
  };
  const field = "h-11 w-full rounded-sm border border-rule-strong bg-paper px-2 text-base text-ink transition-colors hover:border-ink focus-visible:border-ink sm:h-9 sm:text-sm";

  return (
    <>
      {/* the title block: concept · seats · budget; editing it re-runs every number */}
      <button
        ref={buttonRef}
        type="button"
        popoverTarget="ws-brief"
        onClick={place}
        aria-label={`Your plan: ${CONCEPT_LABEL[brief.concept]}, ${brief.seats} seats, ${usd(brief.budgetUsd ?? 0)} budget. Edit`}
        className="hidden h-10 shrink-0 items-stretch overflow-hidden rounded-sm border border-on-ink/25 text-sm transition-colors hover:border-on-ink/60 lg:flex"
      >
        {[CONCEPT_LABEL[brief.concept], `${brief.seats} seats`, `${usd(brief.budgetUsd ?? 0)} budget`].map((t, i) => (
          <span key={i} className="lettering flex items-center border-r border-on-ink/20 px-2.5 text-[0.9375rem] font-semibold last:border-r-0">
            {t}
          </span>
        ))}
        <span className={cn("flex items-center px-2 text-xs text-on-ink-2", pending && "motion-safe:animate-pulse")}>{pending ? "Re-running…" : "Edit"}</span>
      </button>
      <div ref={pop} id="ws-brief" popover="auto" style={{ left: pos.left, top: pos.top }} className="ws-popover fixed m-0 w-[min(340px,calc(100vw-24px))] rounded-sm border border-ink bg-paper p-4 text-ink">
        <form onSubmit={submit} aria-label="Your plan" className="flex flex-col gap-3">
          <p className="lettering text-lg leading-none font-semibold">Your plan</p>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            Concept
            <select name="concept" defaultValue={brief.concept} className={field} key={brief.concept}>
              {CONCEPTS.map((c) => (
                <option key={c} value={c}>
                  {CONCEPT_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
              Seats
              <input name="seats" type="number" inputMode="numeric" min={8} max={400} step={1} defaultValue={brief.seats} key={brief.seats} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
              Budget ($)
              <input name="budget" type="number" inputMode="numeric" min={10000} max={2000000} step={5000} defaultValue={brief.budgetUsd} key={brief.budgetUsd} className={field} />
            </label>
          </div>
          <p className="text-xs text-ink-2">Every number in the workspace re-runs for this plan. The link keeps it.</p>
          <div className="flex items-center gap-3">
            <button type="submit" className="h-11 rounded-sm bg-ink px-4 text-sm font-semibold text-on-ink transition-[transform,background-color] duration-150 hover:bg-ink/90 active:scale-[0.97] sm:h-9">
              Re-run the numbers
            </button>
            <button type="button" popoverTarget="ws-brief" popoverTargetAction="hide" className="h-11 text-sm text-ink-2 underline hover:text-ink sm:h-9">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
