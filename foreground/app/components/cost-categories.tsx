"use client";

import { useCallback, useEffect, useState } from "react";
import { climateRunningCostDelta } from "../lib/climate";
import type { CostBreakdown, CostCategory, CostItem, ClimateInput, Money } from "../lib/cost-categories";
import { fmtDelta } from "../lib/quantify-model";
import { fetchScenarios, type ClimateModel } from "../lib/structure";
import { useDelta } from "../lib/use-scenario";
import { Delta } from "./quantify-parts";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const m = (n: number | null) => (n === null ? "Unknown" : usd.format(n));
const rng = (low: number | null, high: number | null) => (low === null || high === null ? "Unknown" : low === high ? usd.format(low) : `${usd.format(low)} to ${usd.format(high)}`);

/** Which categories are open, kept for the browser session (sessionStorage, shared by the Quantify step and the side panel). */
export function useOpenCategories(): { open: ReadonlySet<string>; toggle: (id: string) => void; setAll: (ids: string[], on: boolean) => void } {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("cost-categories-open") ?? "[]") as string[]); } catch { return new Set(); }
  });
  const save = useCallback((next: Set<string>) => {
    try { sessionStorage.setItem("cost-categories-open", JSON.stringify([...next])); } catch { /* storage unavailable: state still works for this page */ }
    setOpen(next);
  }, []);
  const toggle = useCallback((id: string) => { const n = new Set(open); if (!n.delete(id)) n.add(id); save(n); }, [open, save]);
  const setAll = useCallback((ids: string[], on: boolean) => { const n = new Set(open); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); save(n); }, [open, save]);
  return { open, toggle, setAll };
}

/** Climate model for a property, loaded once; `null` model with a reason when the property has none. */
export function useClimate(id: number | null | undefined): { model: ClimateModel | null; reason: string | null } {
  const [s, setS] = useState<{ id: number; model: ClimateModel | null; reason: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchScenarios(id).then(
      (r) => live && setS({ id, model: r.climate ?? null, reason: r.climate ? null : "this property has no climate model" }),
      () => live && setS({ id, model: null, reason: "no climate model for this property" }),
    );
    return () => { live = false; };
  }, [id]);
  if (!id) return { model: null, reason: "no building record linked" };
  return s && s.id === id ? { model: s.model, reason: s.reason } : { model: null, reason: "loading the climate model" };
}

/** The climate line input for the breakdown: a number for the chosen scenario and horizon, or the reason there is none. */
export function climateInput(model: ClimateModel | null, reason: string | null, scenario: string, horizon: number): ClimateInput {
  if (!model) return { kind: "unavailable", reason: reason ?? "no climate model" };
  const cost = climateRunningCostDelta(model, scenario, horizon);
  return cost ? { kind: "ready", cost } : { kind: "unavailable", reason: `the model has no ${scenario} point for ${horizon}` };
}

function Mix({ c }: { c: CostCategory }) {
  const parts = [c.observed ? `${c.observed} observed` : "", c.estimated ? `${c.estimated} estimated` : "", c.unpriced ? `${c.unpriced} unpriced` : ""].filter(Boolean);
  return <span className="whitespace-nowrap rounded-full border border-foreground/20 px-2 py-0.5 text-[0.7rem] text-foreground/60" data-testid={`cat-${c.id}-mix`}>{parts.join(" · ") || "none"}</span>;
}

function ItemRow({ c, i, compact }: { c: CostCategory; i: CostItem; compact: boolean }) {
  const per = c.basis === "monthly" ? " /mo" : "";
  return (
    <li className="py-2" data-testid={`item-${c.id}-${i.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">{i.label}{i.quantity !== null && <span className="ml-1 tabular-nums text-foreground/55">x {i.quantity.toLocaleString("en-US")}{i.unit ? ` ${i.unit}` : ""}</span>}</span>
        <span className="whitespace-nowrap tabular-nums" data-testid={`item-${c.id}-${i.id}-sub`}>{i.status === "unpriced" ? "Unpriced" : `${rng(i.low, i.high)}${per}`}</span>
      </div>
      <p className="text-xs text-foreground/50">
        <span className="font-medium">{i.status === "unpriced" ? "unpriced" : i.status}</span>
        {!compact && i.unitLow !== null && i.unitHigh !== null && i.quantity !== null && i.quantity !== 1 && ` · unit ${rng(i.unitLow, i.unitHigh)}${i.unit ? ` per ${i.unit.replace(/s$/, "")}` : " each"}`}
        {!compact && i.status !== "unpriced" && ` · ${i.source.replace(/^https?:\/\//, "").split("/")[0]}`}
        {i.note && ` · ${i.note}`}
      </p>
    </li>
  );
}

function Row({ c, isOpen, onToggle, compact }: { c: CostCategory; isOpen: boolean; onToggle: () => void; compact: boolean }) {
  const d = useDelta(c.subtotal ? c.subtotal.expected : null);
  const dd = d.prev !== null && c.subtotal ? c.subtotal.expected - d.prev : null;
  const per = c.basis === "monthly" ? " /mo" : "";
  const share = c.share === null ? null : Math.round(c.share * 100);
  return (
    <li className="border-t border-foreground/10 first:border-t-0" data-testid={`cat-${c.id}`}>
      <button type="button" aria-expanded={isOpen} aria-controls={`cat-${c.id}-items`} onClick={onToggle} className="block w-full py-3 text-left">
        <span className="flex items-baseline gap-2">
          <span aria-hidden="true" className="w-3 text-foreground/40">{isOpen ? "−" : "+"}</span>
          <span className="min-w-0 flex-1 font-medium">{c.label}</span>
          <span key={d.n} className={`${d.n > 0 ? "animate-recalc " : ""}rounded px-1 text-right tabular-nums`} data-testid={`cat-${c.id}-subtotal`}>
            {c.subtotal ? `${rng(c.subtotal.low, c.subtotal.high)}${per}` : "Unknown"}
            {dd !== null && dd !== 0 && <Delta d={dd} fmt={fmtDelta} testId={`cat-${c.id}-delta`} />}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-xs text-foreground/55">
          <span data-testid={`cat-${c.id}-count`}>{c.count} item{c.count === 1 ? "" : "s"}</span>
          {c.subtotal && <span className="tabular-nums" data-testid={`cat-${c.id}-expected`}>expected {m(c.subtotal.expected)}{per}</span>}
          <span className="flex items-center gap-1.5" data-testid={`cat-${c.id}-share`}>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true"><span className="block h-full bg-accent/70" style={{ width: `${Math.max(0, Math.min(100, share ?? 0))}%` }} /></span>
            <span className="tabular-nums">{share === null ? "n/a" : `${share}%`}</span>
          </span>
          {!compact && <Mix c={c} />}
        </span>
      </button>
      {isOpen && (
        <ul id={`cat-${c.id}-items`} className="mb-3 ml-5 divide-y divide-foreground/10 border-l border-foreground/10 pl-3 text-sm" data-testid={`cat-${c.id}-items`}>
          {c.items.length === 0 ? <li className="py-2 text-xs text-foreground/50">Nothing in this category for this scenario.</li> : c.items.map((i) => <ItemRow key={i.id} c={c} i={i} compact={compact} />)}
        </ul>
      )}
    </li>
  );
}

function Total({ label, money, testId, per, extra }: { label: string; money: Money | null; testId: string; per?: string; extra?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-foreground/20 py-2 font-medium">
      <span>{label}{extra && <span className="ml-2 text-xs font-normal text-foreground/50">{extra}</span>}</span>
      <span className="whitespace-nowrap tabular-nums" data-testid={testId}>{money ? `${rng(money.low, money.high)}${per ?? ""}` : "Unknown"}</span>
    </div>
  );
}

/**
 * Cost categories as collapsible rows. Each row is a button (aria-expanded) with its subtotal range, item count, share bar and
 * observed/estimated mix; opening it lists every item with quantity, unit price, subtotal and status. Closed by default; the open set is
 * remembered for the session. A row flashes and shows the change when its subtotal moves.
 */
export default function CostCategories({ breakdown, compact = false, pending = false, climateControls }: { breakdown: CostBreakdown; compact?: boolean; pending?: boolean; climateControls?: React.ReactNode }) {
  const { open, toggle, setAll } = useOpenCategories();
  const all = [...breakdown.oneTime, ...breakdown.running];
  const ids = all.map((c) => c.id as string);
  const allOpen = ids.length > 0 && ids.every((id) => open.has(id));
  const group = (title: string, cats: CostCategory[], total: React.ReactNode, tid: string) => cats.length > 0 && (
    <div data-testid={tid}>
      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-foreground/50">{title}</h4>
      <ul>{cats.map((c) => <Row key={c.id} c={c} isOpen={open.has(c.id)} onToggle={() => toggle(c.id)} compact={compact} />)}</ul>
      {total}
    </div>
  );
  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"} data-testid="cost-categories">
      <div className="flex items-center justify-end gap-2 text-xs">
        <button type="button" disabled={ids.length === 0 || allOpen} onClick={() => setAll(ids, true)} className="rounded-full border border-foreground/20 px-3 py-1 disabled:opacity-40" data-testid="cats-expand-all">Expand all</button>
        <button type="button" disabled={!ids.some((id) => open.has(id))} onClick={() => setAll(ids, false)} className="rounded-full border border-foreground/20 px-3 py-1 disabled:opacity-40" data-testid="cats-collapse-all">Collapse all</button>
      </div>
      {group("One-time build-out", breakdown.oneTime, <Total label="All-in build-out" money={breakdown.oneTimeTotal} testId="cat-total-onetime" />, "cats-onetime")}
      {breakdown.oneTime.length === 0 && <p className="mt-3 text-sm text-foreground/55">Pricing the build-out…</p>}
      {group("Running costs, per month", breakdown.running, <>
        {climateControls}
        <Total label="Running cost per month, incl. climate-adjusted (demo estimate)" money={breakdown.runningTotal} per=" /mo" testId="cat-total-running" />
        {breakdown.runningBase && breakdown.runningTotal && breakdown.runningTotal.expected !== breakdown.runningBase.expected && (
          <p className="pb-1 text-xs text-foreground/50" data-testid="cat-total-running-base">Without the climate line: {rng(breakdown.runningBase.low, breakdown.runningBase.high)} /mo.</p>
        )}
      </>, "cats-running")}
    </div>
  );
}
