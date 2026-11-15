"use client";

import { Box } from "lucide-react";
import type { ReactNode } from "react";
import { lineKey } from "@/components/site/focus-key";
import { linkProps, useFocusedFinding } from "@/components/site/focus-store";
import { Estimate, SourceLabel, Src, STATUS_TEXT } from "@/components/site/primitives";
import { Tween, TweenRange } from "@/components/site/tween";
import { DEPARTURE } from "@/components/site/lifeline";
import type { CostLine, ScenarioName, SiteAnalysis } from "@/lib/engine/types";
import { num, pct, usd, usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SurvivalOdds } from "./imagine-types";
import type { RentView } from "./rent-adapter";
import type { Density } from "./url-state";

export type SheetSite = {
  id: string;
  headline: string | null;
  suite: string | null;
  tenants: { name: string; years: number | null; moveIn: string | null; moveOut: string | null; sameSuite: boolean; outcome: "closed" | "moved" | "current" | "unknown" }[];
  sources: string[];
  /** finding ids that can be shown in the 3D walk */
  walkable: string[];
};

const ORDER = { needed: 0, maybe: 1, saved: 2 } as const;
const VERDICT = {
  comfortable: { text: "Comfortable", cls: "border-saved text-saved" },
  stretch: { text: "A stretch", cls: "border-dashed border-maybe-ink text-maybe-ink" },
  unlikely: { text: "Unlikely", cls: "border-needed bg-needed text-on-ink" },
} as const;

/** The plat sheet: the story of this address in owner words by default, or at plat density for a broker. */
export function SheetContent({
  analysis,
  site,
  density,
  survival,
  rent,
  onShowInWalk,
  onOpenNumbers,
}: {
  analysis: SiteAnalysis;
  site: SheetSite;
  density: Density;
  survival: SurvivalOdds | null;
  rent?: RentView | null;
  onShowInWalk: (findingId: string) => void;
  onOpenNumbers: () => void;
}) {
  const broker = density === "broker";
  return (
    <div className={cn("flex flex-col", broker ? "text-[0.8125rem]" : "text-base")}>
      {site.headline ? (
        <Block title="The story" first>
          <p className={cn("lettering leading-snug font-semibold", broker ? "text-base" : "text-xl")}>{site.headline}</p>
          <p className="mt-2 text-sm text-ink-2">{analysis.graveyard.summary}</p>
        </Block>
      ) : null}
      <Cost analysis={analysis} broker={broker} rent={rent ?? null} siteId={site.id} />
      {broker ? <BrokerFacts analysis={analysis} /> : <BreakEven analysis={analysis} />}
      <Outlook analysis={analysis} broker={broker} onOpenNumbers={onOpenNumbers} />
      <Risks analysis={analysis} walkable={site.walkable} broker={broker} onShowInWalk={onShowInWalk} />
      <History site={site} onOpenNumbers={onOpenNumbers} />
      <SurvivalCard odds={survival} siteId={site.id} />
      <Block title="Sources">
        <ul className="flex flex-col gap-1 font-mono text-[0.6875rem] leading-snug text-ink-2">
          {site.sources.map((s) => (
            <li key={s}>src {s}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-2">Every figure marked estimate is Foreground&apos;s calculation from cited benchmarks. Ranges, not quotes: get contractor bids and read the lease before you sign.</p>
      </Block>
    </div>
  );
}

function Block({ title, aside, first, children }: { title: string; aside?: ReactNode; first?: boolean; children: ReactNode }) {
  const id = `sheet-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("px-4 py-5 sm:px-5", !first && "border-t border-rule")}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-xs font-medium tracking-[0.06em] text-ink-2 uppercase">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** "You pay" against the budget: the total as a dimension line over a fixed-capacity budget bar. */
function Cost({ analysis, broker, rent, siteId }: { analysis: SiteAnalysis; broker: boolean; rent: RentView | null; siteId: string }) {
  const { xray, brief } = analysis;
  const budget = brief.budgetUsd ?? null;
  const t = xray.total;
  const cap = Math.max(t.high, budget ?? 0) * 1.08 || 1;
  const x = (v: number) => `${(v / cap) * 100}%`;
  const over = budget ? { low: Math.max(0, t.low - budget), high: Math.max(0, t.high - budget) } : null;

  return (
    <Block title="You pay to open" aside={<Estimate />}>
      <p className={cn("lettering leading-none font-bold", broker ? "text-[1.75rem]" : "text-[2.5rem]")}>
        <TweenRange low={t.low} high={t.high} />
      </p>
      <p className="mt-1 text-sm text-ink-2">
        Most likely <Tween value={t.mid} kind="usd" className="font-semibold text-ink" />, contingency included.
      </p>
      {rent ? <RentLine rent={rent} siteId={siteId} /> : null}

      <figure className="m-0 mt-4" aria-label={`Total ${usdRange(t)} against ${budget ? `a ${usd(budget)} budget` : "no budget set"}`}>
        <div className="relative h-11">
          {/* total as a dimension line */}
          <span aria-hidden className="absolute top-1 h-px bg-needed" style={{ left: x(t.low), width: `calc(${x(t.high)} - ${x(t.low)})` }} />
          {[t.low, t.high].map((v, i) => (
            <span key={i} aria-hidden className="absolute top-[-1px] h-[7px] w-px bg-needed" style={{ left: x(v) }} />
          ))}
          <span aria-hidden className="absolute top-[-2px] h-[9px] w-[3px] -translate-x-1/2 bg-needed" style={{ left: x(t.mid) }} />
          {/* budget capacity */}
          <span aria-hidden className="absolute bottom-0 left-0 h-6 rounded-[1px] border border-ink bg-paper-2" style={{ width: budget ? x(budget) : "0%" }} />
          <span aria-hidden className="absolute bottom-0 left-0 h-6 bg-ink/15" style={{ width: x(Math.min(t.mid, budget ?? t.mid)) }} />
          {over && over.high > 0 ? <span aria-hidden className="hatch-needed absolute bottom-0 h-6 border-y border-r border-needed" style={{ left: x(budget!), width: `calc(${x(t.high)} - ${x(budget!)})` }} /> : null}
          {budget ? <span aria-hidden className="absolute bottom-[-3px] h-[30px] w-0.5 bg-ink" style={{ left: x(budget) }} /> : null}
        </div>
        <figcaption className="mt-1.5 flex justify-between font-mono text-[0.6875rem] text-ink-2">
          <span>$0</span>
          <span>{budget ? `your budget ${usd(budget)}` : "no budget set"}</span>
        </figcaption>
      </figure>

      {over && over.high > 0 ? (
        <p className="mt-3 leading-snug">
          <span className="font-semibold text-needed">{over.low > 0 ? `Over budget by ${usdRange(over)}.` : `Up to ${usd(over.high)} over at the high end.`}</span>{" "}
          <span className="text-ink-2">Ask the landlord for tenant-improvement money or more free rent.</span>
        </p>
      ) : budget ? (
        <p className="mt-3 font-semibold text-saved">Fits your {usd(budget)} budget even at the high end.</p>
      ) : null}
      {xray.saved.high > 0 ? (
        <p className="mt-2 text-sm leading-snug">
          <span className="font-semibold text-saved">{usdRange(xray.saved)} already in the walls.</span> <span className="text-ink-2">Equipment you would not buy, against a bare shell.</span>
        </p>
      ) : null}
    </Block>
  );
}

function BreakEven({ analysis }: { analysis: SiteAnalysis }) {
  const be = analysis.breakeven;
  const v = VERDICT[be.verdict];
  return (
    <Block title="Break-even" aside={<Estimate />}>
      <p className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-block rounded-sm border px-1.5 py-px text-xs font-semibold tracking-[0.06em] uppercase", v.cls)}>{v.text}</span>
        <span>
          <Tween value={be.coversPerDay} className="font-semibold" /> covers a day, <Tween value={be.turnsPerDay} kind="dec1" className="font-semibold" /> turns per seat.
        </span>
      </p>
      <p className="mt-1.5 text-sm text-ink-2">
        Sales of {usd(be.salesNeededUsd)} a year keep rent a healthy share, at a {usd(be.avgCheckUsd)} average check.
      </p>
    </Block>
  );
}

function BrokerFacts({ analysis }: { analysis: SiteAnalysis }) {
  const { breakeven: be, occupancy, timeToOpen, seats, xray } = analysis;
  const rows: [string, string][] = [
    ["Total low / mid / high", `${usd(xray.total.low)} / ${usd(xray.total.mid)} / ${usd(xray.total.high)}`],
    ["Occupancy / yr", usdRange(occupancy.annualUsd)],
    ["Sales needed / yr", usd(be.salesNeededUsd)],
    ["Covers / day", num(be.coversPerDay)],
    ["Turns / day", num(be.turnsPerDay, 1)],
    ["Average check", usd(be.avgCheckUsd)],
    ["Time to open", `${num(timeToOpen.months.low)}–${num(timeToOpen.months.high)} mo`],
    ["Rent before opening", usdRange(timeToOpen.deadRentUsd)],
    ["Seats the plan fits", num(seats.seats)],
    ["Break-even verdict", VERDICT[be.verdict].text],
  ];
  return (
    <Block title="Deal facts" aside={<Estimate />}>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="border-b border-rule py-1.5 text-ink-2">{k}</dt>
            <dd className="border-b border-rule py-1.5 text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

const CASE = {
  slow: { name: "Slow", color: "var(--needed)", dash: "5 3" },
  base: { name: "Base", color: "var(--ink)", dash: undefined },
  strong: { name: "Strong", color: "var(--saved)", dash: "2 2" },
} as const;

function Outlook({ analysis, broker, onOpenNumbers }: { analysis: SiteAnalysis; broker: boolean; onOpenNumbers: () => void }) {
  const sc = analysis.scenarios;
  const order: ScenarioName[] = ["slow", "base", "strong"];
  const start = -analysis.xray.total.mid;
  const series = order.map((k) => ({ k, pts: [start, ...sc.scenarios[k].years.map((y) => y.cumulativeCashUsd)] }));
  const all = series.flatMap((s) => s.pts).concat(0);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const W = 280;
  const H = 72;
  const X = (i: number) => (i / 3) * (W - 8) + 4;
  const Y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);

  return (
    <Block
      title="Three-year outlook"
      aside={
        <button type="button" onClick={onOpenNumbers} className="text-xs text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink">
          See the math
        </button>
      }
    >
      <p className="leading-snug font-medium">{sc.verdict}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label={`Cash after build-out, three years: ${order.map((k) => `${CASE[k].name} ${usd(sc.scenarios[k].years[2].cumulativeCashUsd)}`).join(", ")}`}>
        <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--rule-strong)" strokeDasharray="2 3" />
        {series.map((s) => (
          <polyline key={s.k} points={s.pts.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} fill="none" stroke={CASE[s.k].color} strokeWidth={1.75} strokeDasharray={CASE[s.k].dash} />
        ))}
      </svg>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        {order.map((k) => {
          const s = sc.scenarios[k];
          const cash = s.years[2].cumulativeCashUsd;
          return (
            <div key={k}>
              <dt className="flex items-center gap-1.5 text-xs text-ink-2">
                <svg width="14" height="4" aria-hidden>
                  <line x1="0" x2="14" y1="2" y2="2" stroke={CASE[k].color} strokeWidth="2" strokeDasharray={CASE[k].dash} />
                </svg>
                {CASE[k].name}
              </dt>
              <dd className={cn("lettering text-lg leading-tight font-semibold", cash < 0 && "text-needed")}>
                <Tween value={cash} kind="usd" />
              </dd>
              {broker ? (
                <dd className="text-[0.6875rem] text-ink-2">
                  rent {pct(s.occupancySharePct, 1)} · payback {s.paybackYears == null ? "never" : `${num(s.paybackYears, 1)} yr`}
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-xs text-ink-2">Cash in hand at the end of year three, after paying back the build-out. <Estimate /></p>
    </Block>
  );
}

/**
 * Three-year survival odds from the survival model. Its signal is weak (out-of-time AUC 0.64), so it is shown as
 * context beside the address's history, never as a headline: the relative band, calibrated text, top factors and the
 * model's own disclosure line with a link to the model card. A labelled slot stands in until the model has a score.
 */
export function SurvivalCard({ odds, siteId }: { odds: SurvivalOdds | null; siteId: string }) {
  if (!odds) {
    return (
      <Block title="Odds of lasting three years">
        <div role="status" className="rounded-sm border border-dashed border-rule-strong bg-paper-2/60 p-4">
          <p className="font-medium">No survival score for this site yet</p>
          <p className="mt-1 text-sm text-ink-2">How restaurants in spaces like this one have fared over three years, and what moves the odds, appears here once the survival model has scored the site.</p>
        </div>
      </Block>
    );
  }
  const band = odds.relativeBand ?? "typical";
  const text = odds.displayText ?? `about ${Math.round(Math.min(odds.probability, 0.75) * 100)}%`;
  return (
    <Block title="Odds of lasting three years" aside={<Estimate />}>
      <p className="leading-snug">
        <span className={cn("font-semibold", band === "above typical" ? "text-saved" : band === "below typical" ? "text-needed" : "text-ink")}>
          {band === "above typical" ? "Above typical" : band === "below typical" ? "Below typical" : "Typical"}
        </span>
        <span className="text-ink-2">
          {" "}
          for a food tenancy: {text} of tenants in spaces like this stayed three years
          {odds.baseline != null ? `, against ${Math.round(odds.baseline * 100)}% for a typical one` : ""}.
        </span>
      </p>
      {odds.factors.length ? (
        <ul className="mt-2.5 flex flex-col gap-1 text-sm">
          {odds.factors.map((f) => (
            <li key={f.label} className="flex gap-2">
              <span className="sr-only">{f.direction === "up" ? "Helps: " : "Hurts: "}</span>
              <span className="min-w-0 flex-1 text-ink-2">{f.label}</span>
              {f.detail ? <span className={cn("shrink-0 font-semibold whitespace-nowrap", f.direction === "up" ? "text-saved" : "text-needed")}>{f.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2.5 font-mono text-[0.6875rem] leading-snug text-ink-2">
        {odds.disclosure ?? odds.source}.{" "}
        <a href={`/site/${siteId}/model-card`} className="text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
          How the model works
        </a>
      </p>
    </Block>
  );
}

/** Asking rent against the fair-rent model's 80% range, with the three nearest comps and the model's own caveat. */
function RentLine({ rent, siteId }: { rent: RentView; siteId: string }) {
  const verdict = rent.basisUncertain ? "Not comparable: the ask is quoted gross" : rent.band === "above market" ? "Above market" : rent.band === "below market" ? "Below market" : "In line with market";
  const tone = rent.basisUncertain ? "text-ink-2" : rent.band === "above market" ? "text-needed" : rent.band === "below market" ? "text-saved" : "text-ink";
  return (
    <div className="mt-3 border-t border-rule pt-3 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-medium tracking-[0.06em] text-ink-2 uppercase">Rent vs market</span>
        <span className={cn("font-semibold", tone)}>{verdict}</span>
        <Estimate />
      </p>
      <p className="mt-1 leading-snug">
        Asking <span className="font-semibold">{rent.askingText}</span> vs a fair <span className="font-semibold">{rent.rangeText}</span>
        <span className="text-ink-2"> (about {rent.fairText}{rent.basisUncertain ? "" : `, ask ${rent.gapText}`})</span>
      </p>
      {rent.comps.length ? (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink-2">
          {rent.comps.map((c) => (
            <li key={c.label} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{c.label}</span>
              <span className="shrink-0 font-mono">{c.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1.5 font-mono text-[0.6875rem] leading-snug text-ink-2">
        {rent.disclosure}.{" "}
        <a href={`/site/${siteId}/rent-model`} className="text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
          How the rent model works
        </a>
      </p>
    </div>
  );
}

function StatusMark({ status }: { status: CostLine["status"] }) {
  const cls = status === "needed" ? "bg-needed text-on-ink border-needed" : status === "saved" ? "border-saved text-saved" : "border-dashed border-maybe-ink text-maybe-ink";
  return <span className={cn("inline-block shrink-0 rounded-sm border px-1 py-px text-[0.625rem] font-semibold tracking-[0.06em] uppercase", cls)}>{STATUS_TEXT[status]}</span>;
}

function Risks({ analysis, walkable, broker, onShowInWalk }: { analysis: SiteAnalysis; walkable: string[]; broker: boolean; onShowInWalk: (id: string) => void }) {
  const lines = [...analysis.xray.lines].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.range.mid - a.range.mid);
  const shown = broker ? lines : lines.filter((l) => l.status !== "saved" && l.findingId).slice(0, 4);
  const focused = useFocusedFinding();
  if (!shown.length) return null;
  return (
    <Block title={broker ? "Cost lines" : "Top risks"}>
      <ul className="flex flex-col">
        {shown.map((l) => {
          const key = lineKey(l);
          const canWalk = Boolean(l.findingId && walkable.includes(l.findingId));
          return (
            <li key={l.id} {...linkProps(key)} data-active={focused === key} className="-mx-2 flex flex-col gap-1 rounded-sm border-b border-rule px-2 py-2.5 transition-colors duration-200 last:border-b-0 data-[active=true]:bg-paper-2">
              <div className="flex items-start gap-2">
                <StatusMark status={l.status} />
                <p className={cn("min-w-0 flex-1 leading-snug font-semibold", l.status === "saved" && "text-saved")}>{l.label}</p>
                <span className={cn("lettering shrink-0 font-semibold whitespace-nowrap", l.status === "saved" && "text-saved line-through decoration-1")}>{usdRange(l.range)}</span>
              </div>
              {!broker ? <p className="text-sm leading-snug text-ink-2">{l.reason}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SourceLabel source={l.source} />
                {canWalk ? (
                  <button type="button" onClick={() => onShowInWalk(l.findingId!)} className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
                    <Box className="size-3.5" aria-hidden /> Show in 3D
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function History({ site, onOpenNumbers }: { site: SheetSite; onOpenNumbers: () => void }) {
  const food = site.tenants;
  return (
    <Block
      title="Who was here"
      aside={
        food.length ? (
          <button type="button" onClick={onOpenNumbers} className="text-xs text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink">
            See the timeline
          </button>
        ) : undefined
      }
    >
      {food.length ? (
        <ol className="flex flex-col">
          {food.map((t) => (
            <li key={`${t.name}-${t.moveIn}`} className="flex items-baseline gap-2 border-b border-rule py-2 last:border-b-0">
              <span aria-hidden className={cn("inline-block size-2 shrink-0 translate-y-[-1px] rounded-[1px]", t.outcome === "current" ? "bg-saved" : t.sameSuite ? (t.outcome === "closed" ? "bg-needed" : "bg-maybe") : "bg-ink-2")} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{t.name}</span>
                <span className="block text-sm text-ink-2">
                  {t.moveIn?.slice(0, 4) ?? "?"}–{t.moveOut?.slice(0, 4) ?? "now"} · {DEPARTURE[t.outcome]}
                  {t.sameSuite ? `, ${site.suite ? `suite ${site.suite}` : "this suite"}` : ""}
                </span>
              </span>
              {t.years != null ? <span className="lettering shrink-0 font-semibold">{num(t.years, 1)} yr</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-2">No food tenants on record at this address. A first-generation food use means more build-out.</p>
      )}
      <Src className="mt-2 block">CoStar tenant records</Src>
    </Block>
  );
}
