"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { readBrief } from "../lib/brief";
import { isScanOnly, type Match } from "../lib/matches";
import { brokerQuestions, conceptFromBrief, DISCIPLINES, legalItems, panelsFor, parseMode, siteFacts, verdicts, type Dot, type DisciplineId, type LegalItem, type LegalStatus, type Page, type Signals, type ViewMode } from "../lib/discipline";

const KEY = "foreground.view-mode";
const CHANGE = "foreground-view-mode";

let memory: ViewMode | null = null; // fallback when storage is blocked
function readMode(): ViewMode {
  try { return parseMode(localStorage.getItem(KEY)); } catch { return memory ?? "current"; }
}
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(CHANGE, onChange); window.removeEventListener("storage", onChange); };
}
/** "current" until the person switches; remembered in localStorage (which can be blocked, so every access is guarded). */
export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "current" as ViewMode);
  const set = (m: ViewMode) => {
    memory = m;
    try { localStorage.setItem(KEY, m); } catch { /* blocked: memory still switches this tab */ }
    window.dispatchEvent(new Event(CHANGE));
  };
  return [mode, set];
}
/** Segmented switch, fixed to the top-right corner. Rendered by the property page and by Quantify (which covers it). */
export function ViewSwitch() {
  const [mode, setMode] = useViewMode();
  return (
    <div role="group" aria-label="Layout of this page" data-testid="view-switch" className="fixed right-3 top-3 z-[70] flex rounded-full border border-foreground/20 bg-background/95 p-0.5 text-xs shadow-sm backdrop-blur sm:right-5 sm:top-4 sm:text-sm">
      {([["current", "Current"], ["discipline", "By discipline"]] as [ViewMode, string][]).map(([m, label]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
          className={`rounded-full px-3 py-1.5 transition-colors ${mode === m ? "bg-foreground font-medium text-background" : "text-foreground/65 hover:text-foreground"}`}>{label}</button>
      ))}
    </div>
  );
}

const DOT: Record<Dot, { cls: string; label: string }> = {
  ok: { cls: "bg-match", label: "no red flag in what we have" },
  attention: { cls: "bg-amber-500", label: "needs attention" },
  unknown: { cls: "border border-foreground/40 bg-transparent", label: "unknown" },
};
function StatusDot({ dot }: { dot: Dot }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[dot].cls}`} data-dot={dot} role="img" aria-label={DOT[dot].label} />;
}

const STATUS_TEXT: Record<LegalStatus, string> = { unknown: "Unknown", estimated: "Estimated", "to-confirm": "To confirm" };

/** Compact permits and legal checklist. Fixed rules keyed on the concept and the site facts: nothing here is observed. */
export function LegalPermits({ items, concept }: { items: LegalItem[]; concept: string }) {
  return (
    <section className="mt-6" data-testid="legal-permits" aria-labelledby="legal-permits-title">
      <h2 id="legal-permits-title" className="text-lg font-medium tracking-tight">Legal and permits</h2>
      <p className="mt-1 text-sm text-foreground/55">Rule-based prompts for {concept ? `a ${concept} concept` : "this concept"}. DEMO ESTIMATE: none of these were checked against the code or a record.</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <li key={i.id} className="rounded-2xl border border-foreground/10 p-4" data-testid={`legal-${i.id}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{i.title}</p>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${i.status === "estimated" ? "border border-dashed border-foreground/30 text-foreground/70" : i.status === "unknown" ? "border border-foreground/15 text-foreground/50" : "bg-foreground/8 text-foreground/75"}`}>{STATUS_TEXT[i.status]}</span>
            </div>
            <p className="mt-2 text-sm text-foreground/70">{i.text}</p>
            <p className="mt-2 text-xs text-foreground/50">Ask: {i.ask}</p>
          </li>
        ))}
      </ul>
      <div className="mt-5" data-testid="broker-asks">
        <h3 className="text-sm font-medium">What to ask the broker</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/70">{brokerQuestions(items).map((q) => <li key={q}>{q}</li>)}</ul>
      </div>
    </section>
  );
}

type Kit = { yearBuilt?: number | null; hasSprinklers?: boolean | null; tier?: string | null };
/** Year built, sprinklers and the hazard screening tier, from the structure service when this site has a building record. */
function useStructureKit(match: Match): Kit | null {
  const pid = match.demo ? match.costarPropertyId ?? null : match.listingId;
  const skip = pid === null || isScanOnly(match);
  const [state, setState] = useState<{ pid: number; kit: Kit } | null>(null);
  useEffect(() => {
    if (skip) return;
    let live = true;
    fetch(`/api/structure/${pid}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (live && d?.kit) setState({ pid: pid as number, kit: { yearBuilt: d.kit.yearBuilt ?? null, hasSprinklers: typeof d.kit.hasSprinklers === "boolean" ? d.kit.hasSprinklers : null, tier: d.screening?.tier ?? null } });
    }, () => {});
    return () => { live = false; };
  }, [pid, skip]);
  return state && state.pid === pid ? state.kit : null;
}

type LayoutProps = {
  page: Page; match: Match;
  /** The existing components, keyed by panel id (see PANELS in lib/discipline.ts). Missing ids are skipped. */
  panels: Record<string, ReactNode>;
  /** What Quantify knows beyond the match: budget tone, payback, seats, equipment count. */
  /** Opens the Act checklist, the final step, which is its own screen and not part of any discipline. */
  onAct?: () => void;
  extra?: Partial<Pick<Signals, "budgetTone" | "paybackMonths" | "hasRent" | "hasAllIn" | "seats" | "equipmentCount">>;
};

/** Left rail on wide screens, tabs on narrow ones. Only the active discipline is mounted, so inactive panels fetch nothing. */
export function DisciplineLayout({ page, match, panels, onAct, extra = {} }: LayoutProps) {
  const [active, setActive] = useState<DisciplineId>("financial");
  const kit = useStructureKit(match);
  const concept = useMemo(() => conceptFromBrief(readBrief()), []);
  const seats = extra.seats ?? null;
  const facts = useMemo(() => siteFacts(match, concept, seats, kit ?? undefined), [match, concept, seats, kit]);
  const legal = useMemo(() => legalItems(facts), [facts]);
  const v = verdicts({
    ...extra, legal, factors: match.factors ?? [], scanOnly: isScanOnly(match), structureTier: kit?.tier ?? null, yearBuilt: facts.yearBuilt,
    hasRent: extra.hasRent ?? Boolean(match.rent && match.rent.status !== "unknown"), hasAllIn: extra.hasAllIn ?? Boolean(match.buildout && match.buildout.status !== "unknown"),
  });
  const all: Record<string, ReactNode> = { ...panels, [page === "quantify" ? "q-legal-permits" : "legal-permits"]: <LegalPermits items={legal} concept={concept} /> };
  const ids = panelsFor(page, active, Object.keys(all).filter((k) => all[k] !== null && all[k] !== undefined && all[k] !== false));
  const d = DISCIPLINES.find((x) => x.id === active)!;
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]" data-testid="discipline-view">
      <nav aria-label="Disciplines" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:sticky md:top-4 md:mx-0 md:flex-col md:self-start md:overflow-visible md:px-0">
        {DISCIPLINES.map((x) => (
          <button key={x.id} type="button" onClick={() => setActive(x.id)} aria-current={active === x.id ? "page" : undefined} data-testid={`disc-${x.id}`}
            className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors md:w-full ${active === x.id ? "border-foreground/30 bg-foreground/[0.05] font-medium" : "border-transparent text-foreground/65 hover:bg-foreground/[0.03]"}`}>
            <StatusDot dot={v[x.id].dot} />
            <span className="whitespace-nowrap md:whitespace-normal"><span className="tabular-nums text-foreground/40">{x.n}</span> {x.label}</span>
          </button>
        ))}
        {onAct && (
          <button type="button" onClick={onAct} data-testid="disc-act"
            className="flex shrink-0 items-center gap-2.5 rounded-xl border border-foreground/30 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-foreground/[0.05] md:w-full">
            <span className="whitespace-nowrap md:whitespace-normal"><span className="tabular-nums text-foreground/40">6</span> Act checklist →</span>
          </button>
        )}
      </nav>
      <div className="min-w-0" data-testid={`disc-panel-${active}`}>
        <header className="rounded-2xl bg-foreground/[0.04] px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-xl font-medium tracking-tight"><StatusDot dot={v[active].dot} />{d.label}</h2>
          <p className="mt-1.5 text-sm text-foreground/75" data-testid="disc-verdict">{v[active].text}</p>
          <p className="mt-1 text-xs text-foreground/45">Verdicts are computed from the data on this page and are estimates, not advice. Covers: {d.scope}.</p>
        </header>
        {ids.map((id) => <div key={id} data-panel={id}>{all[id]}</div>)}
        {ids.length === 0 && <p className="mt-6 text-sm text-foreground/55">Nothing on this page belongs here for this space.</p>}
      </div>
    </div>
  );
}
