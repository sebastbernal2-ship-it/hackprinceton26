"use client";

import { useEffect, useMemo, useState } from "react";
import { buildChecklist, buildDiligence, type ActItem } from "../lib/act";
import { buildActChecklist, checklistText, GROUPS, loadDone, overall, PRIORITY_LABEL, progress, saveDone, type CheckGroup, type CheckItem, type Priority } from "../lib/act-checklist";
import { checkLayout } from "../lib/asset-layout";
import type { Asset } from "../lib/assets";
import { readBrief } from "../lib/brief";
import { conceptFootprint } from "../lib/concept-layout";
import { fetchCosts } from "../lib/costs";
import { buildCostBreakdown } from "../lib/cost-categories";
import { briefBudget, seatTotal, xrayLines, xrayTotal } from "../lib/cost-side";
import { conceptFromBrief, legalItems, siteFacts } from "../lib/discipline";
import { fetchInspection, type DefectFinding } from "../lib/inspection";
import { fetchLayoutCost, layoutCostItems, nameFor, scenarioKey } from "../lib/layout-cost";
import type { LayoutSummary } from "../lib/layout-summary";
import { isScanOnly, type Match } from "../lib/matches";
import { toPlacements, type PlacedPiece } from "../lib/planner";
import { allInRange, defaultArea, parsePositive, resolveBudget, totalCostKey } from "../lib/quantify-model";
import { loadStructure, type StructureResponse } from "../lib/structure";
import { fetchTotalCost } from "../lib/total-cost";
import { useScenario } from "../lib/use-scenario";
import { useLockScroll } from "../lib/use-lock-scroll";
import Stepper from "./stepper";

type Props = {
  match: Match; layout: LayoutSummary | null; kit: Asset[]; placed: PlacedPiece[]; area: string; budgetText: string | null;
  step: number; onStep: (step: number) => void; onBackToQuantify: () => void; onClose: () => void;
};

const CHIP: Record<Priority, string> = {
  blocker: "bg-red-600/10 text-red-700 border border-red-600/30 dark:text-red-300",
  should: "bg-amber-500/10 text-amber-800 border border-amber-500/30 dark:text-amber-300",
  nice: "border border-foreground/20 text-foreground/60",
};

/** Inputs the checklist reads, gathered the same way Quantify gathers them (same services, no shared hook state). */
function useActInputs({ match, layout, kit, placed, area, budgetText }: Props) {
  const real = !match.demo && !isScanOnly(match);
  const pid = match.demo ? match.costarPropertyId ?? null : match.listingId;
  const [findings, setFindings] = useState<DefectFinding[]>([]);
  const [lines, setLines] = useState<Awaited<ReturnType<typeof fetchCosts>>["lines"]>([]);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  useEffect(() => {
    let live = true;
    if (real) {
      fetchInspection(match.listingId).then((r) => live && setFindings(r.findings), () => {});
      fetchCosts(match.listingId).then((r) => live && setLines(r.lines), () => {});
    }
    if (pid !== null && !isScanOnly(match)) loadStructure(pid).then((r) => live && setStructure(r.s));
    return () => { live = false; };
  }, [real, pid, match]);

  const sqft = parsePositive(defaultArea(area, match.spaceSquareFeet || match.squareFeet));
  const [fromBrief] = useState<number | null>(() => briefBudget(readBrief()));
  const budget = resolveBudget(budgetText, fromBrief);
  const seats = layout?.seats || seatTotal(kit) || null;
  const items = useMemo(() => layoutCostItems(kit), [kit]);
  const fromLayout = kit.length > 0;
  const lc = useScenario(fromLayout ? scenarioKey(items, sqft, budget) : null, () => fetchLayoutCost(items, sqft, budget));
  const tc = useScenario(totalCostKey({ pid, sqft, source: null, ownRate: "", months: 12, fromLayout }), () => fetchTotalCost(pid as number, { sqft, months: 12, buildoutFromLayout: fromLayout }));
  const xray = useMemo(() => xrayLines(kit), [kit]);
  const breakdown = useMemo(() => buildCostBreakdown({ fromLayout, lc: lc.data, nameFor: (id) => nameFor(kit, id), xray, tc: tc.data, climate: null }), [fromLayout, lc.data, kit, xray, tc.data]);
  const allIn = fromLayout ? allInRange(lc.data?.buildout ?? null, xrayTotal(xray)) : tc.data?.oneTime ?? null;
  const concept = useMemo(() => conceptFromBrief(readBrief()), []);
  const kitFacts = structure ? { yearBuilt: (structure.kit.yearBuilt as number | null) ?? null, hasSprinklers: typeof structure.kit.hasSprinklers === "boolean" ? structure.kit.hasSprinklers : null } : undefined;
  const facts = useMemo(() => siteFacts(match, concept, seats, kitFacts), [match, concept, seats, kitFacts?.yearBuilt, kitFacts?.hasSprinklers]); // eslint-disable-line react-hooks/exhaustive-deps
  const legal = useMemo(() => legalItems(facts), [facts]);
  const issues = useMemo(() => { const floor = conceptFootprint(Number(area) || sqft || 0); return floor && placed.length ? checkLayout(floor, toPlacements(placed)) : null; }, [area, sqft, placed]);
  const reused: ActItem[] = useMemo(() => match.demo || isScanOnly(match)
    ? buildDiligence({ unpricedPieces: (lc.data?.unpriced ?? []).map((u) => nameFor(kit, u.assetId)), assumedArea: sqft !== null, linkedBuilding: Boolean(match.costarPropertyId) })
    : buildChecklist([], match.factors ?? [], lines), [match, lc.data, kit, sqft, lines]);
  return useMemo(() => buildActChecklist({
    concept, budget, allIn, monthly: tc.data?.monthly ?? null, breakdown, legal, findings,
    structure: structure ? { tier: structure.screening?.tier ?? null, flags: structure.screening?.flags ?? [], yearBuilt: facts.yearBuilt } : null,
    kit, seats, issues, reused, unknownFactors: (match.factors ?? []).filter((f) => f.status === "unknown").map((f) => f.factorId),
  }), [concept, budget, allIn, tc.data, breakdown, legal, findings, structure, facts.yearBuilt, kit, seats, issues, reused, match.factors]);
}

/** Step 6. One real checklist grouped by discipline; ticks persist per listing. Its own full-screen view, like Quantify. */
export default function ActStep(props: Props) {
  useLockScroll();
  const { match, step, onStep, onBackToQuantify, onClose } = props;
  const groups = useActInputs(props);
  const listing = match.demo ? `demo-${match.tourId}` : String(match.listingId);
  const [done, setDone] = useState<Set<string>>(() => loadDone(listing)); // only ever rendered after a click, so the browser is there
  const [hideDone, setHideDone] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const update = (next: Set<string>) => { setDone(next); saveDone(listing, next); };
  const toggle = (id: string) => { const n = new Set(done); if (!n.delete(id)) n.add(id); update(n); };
  const markGroup = (g: CheckGroup) => { const n = new Set(done); const all = g.items.every((x) => n.has(x.id)); for (const x of g.items) { if (all) n.delete(x.id); else n.add(x.id); } update(n); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const total = overall(groups, done);
  const copy = async () => {
    const text = checklistText(groups, done, match.address);
    try { await navigator.clipboard.writeText(text); setCopied("Copied"); } catch { setCopied("Copy blocked by the browser"); }
    window.setTimeout(() => setCopied(null), 2500);
  };
  const bar = (pct: number, label: string) => (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
      <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
  const row = (x: CheckItem) => (
    <li key={x.id} data-testid="act-item" data-done={done.has(x.id) ? "1" : "0"} className="break-inside-avoid rounded-xl border border-foreground/10 p-3">
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={done.has(x.id)} onChange={() => toggle(x.id)} className="mt-1 h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-2">
            <span className={`text-sm font-medium ${done.has(x.id) ? "line-through opacity-60" : ""}`}>{x.title}</span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP[x.priority]}`} data-priority={x.priority}>{PRIORITY_LABEL[x.priority]}</span>
          </span>
          <span className="mt-1 block text-sm text-foreground/65">{x.why}</span>
          {x.live && <span className="mt-1 block text-xs tabular-nums text-foreground/80" data-testid="act-live">Now: {x.live}</span>}
          <span className="mt-1 block text-xs text-foreground/50">Ask: {x.owner}</span>
        </span>
      </label>
    </li>
  );
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="act-step-title" className="act-print fixed inset-0 z-50 overflow-y-auto bg-background text-foreground animate-rise" data-testid="act-step">
      <style>{`@media print { .act-print { position: static !important; overflow: visible !important; } .act-noprint { display: none !important; } .act-print details { display: block; } }`}</style>
      <div className="mx-auto max-w-[68rem] px-4 pb-16 pt-6 sm:px-12">
        <div className="act-noprint flex flex-wrap gap-3 pr-44 sm:pr-0">
          <button type="button" onClick={onBackToQuantify} className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70">Back to Quantify</button>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-foreground/60 transition-opacity hover:opacity-70">Back to property</button>
        </div>
        <div className="act-noprint mb-5 mt-6"><Stepper active={step} onStep={onStep} /></div>
        <h1 id="act-step-title" className="text-[clamp(1.6rem,4vw,2.5rem)] font-medium leading-tight tracking-tight">Act checklist</h1>
        <p className="mt-1 text-foreground/50">{match.address}{match.detail ? ` · ${match.detail}` : ""}</p>
        <p className="mt-3 max-w-2xl text-sm text-foreground/60">What to ask for and check before relying on any number. Every item is a request or a check: none of them says something about the space is already verified. Figures marked Now are estimates from this app.</p>

        <div className="mt-5 rounded-2xl border border-foreground/15 p-4" data-testid="act-overall">
          <div className="flex items-baseline justify-between gap-3"><span className="text-sm font-medium">Overall</span><span className="text-sm tabular-nums text-foreground/70" data-testid="act-overall-count">{total.done} of {total.total} done · {total.pct}%</span></div>
          <div className="mt-2">{bar(total.pct, "Overall progress")}</div>
          <div className="act-noprint mt-3 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={() => setHideDone((h) => !h)} aria-pressed={hideDone} className="rounded-full border border-foreground/20 px-3 py-1.5">Hide done</button>
            <button type="button" onClick={() => void copy()} className="rounded-full border border-foreground/20 px-3 py-1.5">Copy as text</button>
            <button type="button" onClick={() => window.print()} className="rounded-full border border-foreground/20 px-3 py-1.5">Print</button>
            {copied && <span role="status" className="text-xs text-foreground/60">{copied}</span>}
          </div>
        </div>

        {groups.map((g) => {
          const p = progress(g.items, done);
          const shown = hideDone ? g.items.filter((x) => !done.has(x.id)) : g.items;
          return (
            <section key={g.id} className="mt-8" aria-labelledby={`act-g-${g.id}`} data-testid={`act-group-${g.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`act-g-${g.id}`} className="text-lg font-medium tracking-tight">{g.label}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-foreground/60" data-testid={`act-count-${g.id}`}>{p.done} of {p.total}</span>
                  <button type="button" onClick={() => markGroup(g)} className="act-noprint rounded-full border border-foreground/20 px-3 py-1 text-xs">{p.done === p.total ? "Unmark all in group" : "Mark all in group"}</button>
                </div>
              </div>
              <div className="mt-2">{bar(p.pct, `${g.label} progress`)}</div>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">{shown.map(row)}</ul>
              {shown.length === 0 && <p className="mt-3 text-sm text-foreground/55">All done in this group.</p>}
            </section>
          );
        })}
        <p className="mt-8 text-xs text-foreground/45">Groups: {GROUPS.map((g) => g.label).join(", ")}. Ticks are saved in this browser for this listing.</p>
      </div>
    </div>
  );
}
