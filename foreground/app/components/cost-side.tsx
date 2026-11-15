"use client";

import { useEffect, useMemo, useState } from "react";
import type { Asset } from "../lib/assets";
import { readBrief } from "../lib/brief";
import { fetchLayoutCost, freshResponse, layoutCostItems, nameFor, scenarioKey, type LayoutCost } from "../lib/layout-cost";
import type { Match } from "../lib/matches";
import { fetchTotalCost, type TotalCost } from "../lib/total-cost";
import { buildCostBreakdown } from "../lib/cost-categories";
import CostCategories, { climateInput, useClimate } from "./cost-categories";
import { resolveBudget } from "../lib/quantify-model";
import { briefBudget, budgetStatus, CASES, outlook, seatTotal, xrayLines, xrayTotal, zeroCrossing, type Case, type Outlook, type Range } from "../lib/cost-side";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const k = (n: number) => (Math.abs(n) >= 1000 ? `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n) / 1000)}k` : usd.format(n));
const span = (r: Range) => `${k(r.low)} to ${k(r.high)}`;
const TONE = { under: "text-match", tight: "text-accent", over: "text-accent", unknown: "text-foreground/55" } as const;

/**
 * Live cost panel docked beside the planner and the layout view. Everything is derived from the shared kit, so it moves as pieces
 * are placed or removed. Build-out and rent come from the cost services; the X-ray and the outlook are labelled estimates.
 */
export default function CostSide({ match, kit, area, budgetText: sharedBudget, onBudgetText }: { match: Match; kit: Asset[]; area: string; budgetText?: string | null; onBudgetText?: (v: string) => void }) {
  const sqft = Number(area) > 0 ? Number(area) : null;
  // The budget is shared with Quantify when the parent passes it, so one typed number drives both panels.
  const [ownBudget, setOwnBudget] = useState<string | null>(null);
  const budgetText = onBudgetText ? (sharedBudget ?? null) : ownBudget;
  const setBudgetText = onBudgetText ?? setOwnBudget;
  const [fromBrief] = useState<number | null>(() => briefBudget(readBrief()));
  const budget = resolveBudget(budgetText, fromBrief);

  const items = useMemo(() => layoutCostItems(kit), [kit]);
  const key = scenarioKey(items, sqft, budget);
  const [cost, setCost] = useState<{ key: string; data: LayoutCost } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      fetchLayoutCost(items, sqft, budget).then(
        (data) => { if (live) { setCost({ key, data }); setFailed(false); } },
        () => live && setFailed(true),
      );
    }, 150);
    return () => { live = false; window.clearTimeout(t); };
  }, [items, sqft, budget, key]);
  const data = freshResponse(cost, key);

  const pid = match.demo ? match.costarPropertyId : match.listingId;
  const [rent, setRent] = useState<{ key: string; data: TotalCost | null } | null>(null);
  const rentKey = `${pid}:${sqft}`;
  useEffect(() => {
    if (!pid || !sqft) return;
    let live = true;
    fetchTotalCost(pid, { sqft, months: 12, buildoutFromLayout: true }).then(
      (d) => live && setRent({ key: rentKey, data: d }),
      () => live && setRent({ key: rentKey, data: null }),
    );
    return () => { live = false; };
  }, [pid, sqft, rentKey]);
  const rentData = rent?.key === rentKey ? rent.data : null;

  const xray = useMemo(() => xrayLines(kit), [kit]);
  const hidden = useMemo(() => xrayTotal(xray), [xray]);
  const placedSeats = seatTotal(kit);
  // No pieces placed yet: estimate seats from the area (30 sq ft per seat, the same planning assumption as elsewhere) so break-even is not blank.
  const seats = placedSeats > 0 ? placedSeats : sqft ? Math.floor(sqft / 30) : 0;
  const seatsEstimated = placedSeats === 0 && seats > 0;
  const buildout = data?.buildout ?? null;
  const allIn: Range | null = buildout ? { low: buildout.p5 + hidden.low, high: buildout.p95 + hidden.high } : null;
  const status = allIn ? budgetStatus(allIn, budget) : null;
  const monthly = rentData?.monthly ?? null;
  const occupancy = monthly ? ((monthly.low + monthly.high) / 2) * 12 : null;
  const out = buildout && occupancy !== null ? outlook(seats, buildout.p50 + (hidden.low + hidden.high) / 2, occupancy) : null;

  const { model: climateModel, reason: climateReason } = useClimate(pid);
  const breakdown = buildCostBreakdown({ fromLayout: kit.length > 0, lc: data, nameFor: (id) => nameFor(kit, id), xray, tc: rentData, climate: climateInput(climateModel, climateReason, "Intermediate", 2050) });

  return (
    <aside className="space-y-4 text-sm" aria-label="Live cost" data-testid="cost-side">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-medium tracking-tight">Cost, live</h2>
        <span className="text-xs text-foreground/45">{kit.length} pieces · {seats} seats{seatsEstimated ? " (est. from area)" : ""}</span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/50">Estimated demo numbers: scenario analysis, not quotes. They update as you place or remove pieces.</p>
      {failed && !data && <p role="note" className="rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2">Cannot say: the cost service did not answer.</p>}

      <Card title="Hidden-cost X-ray vs budget">
        <label className="flex items-center justify-between gap-2 text-xs text-foreground/55">
          <span>Budget{budgetText === null && fromBrief ? " (from your brief)" : ""}</span>
          <input
            type="number" min={1} aria-label="Budget in dollars" value={budgetText ?? (fromBrief ? String(fromBrief) : "")} placeholder="e.g. 250000"
            onChange={(e) => setBudgetText(e.target.value)} className="w-28 rounded-md border border-foreground/15 bg-background px-2 py-1 text-right text-sm tabular-nums text-foreground"
          />
        </label>
        <Bar budget={budget} buildout={buildout?.p50 ?? null} hidden={hidden} />
        <p className="mt-2 text-lg font-medium tabular-nums" data-testid="cost-allin">{allIn ? span(allIn) : "Pricing…"}</p>
        <p className="text-xs text-foreground/50">All-in build-out: priced build-out plus the hidden systems at {Math.round(0.5 * 100)}% weight.</p>
        {status && <p className={`mt-1 text-xs font-medium ${TONE[status.tone]}`} data-testid="cost-status">{status.text}</p>}
        {data?.pOverBudget != null && <p className="text-xs text-foreground/55">P(build-out over budget): <span className="tabular-nums" data-testid="cost-pover">{Math.round(data.pOverBudget * 100)}%</span> (simulated, excludes hidden systems)</p>}
        <ul className="mt-3 divide-y divide-foreground/10" data-testid="xray-lines">
          {xray.map((l) => (
            <li key={l.id} className="py-1.5" title={`${l.why} Source: ${l.source}`}>
              <div className="flex justify-between gap-2"><span>{l.label}</span><span className="tabular-nums text-foreground/70">{span(l.range)}</span></div>
              <p className="text-xs text-foreground/45">{l.id === "permits" ? "Certain, counted in full" : "Estimated range, counted at 50% until inspected"} · {l.source}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Build-out">
        {data ? (
          <>
            <Row label="Low" value={buildout ? k(buildout.p5) : "Unknown"} />
            <Row label="Expected" value={buildout ? k(buildout.p50) : "Unknown"} strong />
            <Row label="High" value={buildout ? k(buildout.p95) : "Unknown"} />
            <p className="mt-2 text-xs text-foreground/50">
              Pieces {data.equipment ? span(data.equipment) : kit.length === 0 ? "none placed yet" : "none priced"}
              {data.fitout ? ` + fit-out ${span(data.fitout)} for ${Math.round(data.fitout.squareFeet)} sq ft (estimated)` : ""}.
              {data.unpriced.length > 0 && ` ${data.unpriced.length} unpriced piece type(s) excluded, not zero.`}
            </p>
          </>
        ) : <p className="text-foreground/55">{kit.length === 0 ? "Place a piece to price it." : "Pricing…"}</p>}
      </Card>

      <Card title="Costs by category">
        <CostCategories compact breakdown={breakdown} />
      </Card>

      <Card title="Break-even and 3-year outlook">
        {!out ? (
          <p className="text-foreground/55">{!sqft ? "Needs a floor area." : !pid ? "No rent basis for this scan." : rentData === null && rent ? "Cannot say: rent service did not answer." : "Pricing…"}</p>
        ) : (
          <Outlook out={out} estimatedSeats={seatsEstimated} />
        )}
      </Card>
    </aside>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-foreground/10 bg-background p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/50">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex justify-between py-0.5"><span className="text-foreground/55">{label}</span><span className={`tabular-nums ${strong ? "font-medium" : ""}`}>{value}</span></div>;
}

/** Budget bar: expected build-out then the hidden systems stacked against the budget marker. */
function Bar({ budget, buildout, hidden }: { budget: number | null; buildout: number | null; hidden: Range }) {
  if (buildout === null) return null;
  const mid = (hidden.low + hidden.high) / 2;
  const max = Math.max(buildout + mid, budget ?? 0) * 1.1 || 1;
  const w = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-foreground/10" role="img" aria-label={`Expected build-out ${k(buildout)} plus hidden systems ${k(mid)}${budget ? ` against a ${k(budget)} budget` : ""}`}>
      <div className="absolute inset-y-0 left-0 bg-match" style={{ width: w(buildout) }} />
      <div className="absolute inset-y-0 bg-accent/70" style={{ left: w(buildout), width: w(mid) }} />
      {budget && <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: w(budget) }} />}
    </div>
  );
}

const DIAL_TONE = { comfortable: "#5f6d4e", stretch: "#b08d57", unlikely: "#d9512c", unknown: "#999" } as const;
const WORD = { comfortable: "Comfortable", stretch: "A stretch", unlikely: "Unlikely on these seats", unknown: "Unknown" } as const;

export function Outlook({ out, estimatedSeats = false }: { out: Outlook; estimatedSeats?: boolean }) {
  const base = out.cases.base;
  const months = base.paybackMonths;
  return (
    <div>
      <div className="flex items-center gap-4">
        <Dial turns={out.breakEvenTurns} verdict={out.verdict} />
        <div className="min-w-0">
          <p className="text-xs text-foreground/55">Break-even (base case)</p>
          <p className="text-base font-medium tabular-nums" data-testid="payback">{months === null ? "No payback at these seats" : months > 120 ? "Over 10 years" : `${months} months`}</p>
          <p className="text-xs text-foreground/50">to repay the build-out. {estimatedSeats ? `${out.seats} seats, estimated from the area until you place seating.` : out.reason}</p>
        </div>
      </div>
      <Chart out={out} />
      <ul className="mt-2 grid grid-cols-3 gap-2 text-xs">
        {CASES.map((c) => (
          <li key={c} className={c === "base" ? "font-medium" : "text-foreground/60"}>
            <span className="block capitalize">{c}</span>
            <span className="tabular-nums">{k(out.cases[c].profit[1])}/yr</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-foreground/45">
        Estimated: seats x 2.5 / 3.5 / 5 turns a day x $9 check x 360 days, 16% margin after food, labor and other costs, year 1 at 80%, minus rent and utilities from the cost service.
      </p>
    </div>
  );
}

const D = (f: number, r: number): [number, number] => [100 - r * Math.cos(Math.PI * f), 100 - r * Math.sin(Math.PI * f)];
const arc = (a: number, b: number) => { const [x1, y1] = D(a, 80); const [x2, y2] = D(b, 80); return `M${x1} ${y1} A80 80 0 0 1 ${x2} ${y2}`; };

/** Break-even turns a day on the cafe bands (comfortable up to 3, a stretch up to 5; axis to 7.5). */
function Dial({ turns, verdict }: { turns: number | null; verdict: Outlook["verdict"] }) {
  const f = (n: number) => Math.max(0, Math.min(1, n / 7.5));
  const v = turns === null ? 0 : f(turns);
  const [nx, ny] = D(v, 80);
  return (
    <div className="w-28 shrink-0 text-center">
      <svg viewBox="0 0 200 112" role="img" aria-label={turns === null ? "No seats" : `Break-even needs ${turns.toFixed(1)} turns a day. Comfortable up to 3, a stretch up to 5.`}>
        <path d={arc(0, f(3))} fill="none" stroke="#5f6d4e" strokeOpacity="0.35" strokeWidth="12" />
        <path d={arc(f(3), f(5))} fill="none" stroke="#b08d57" strokeOpacity="0.35" strokeWidth="12" />
        <path d={arc(f(5), 1)} fill="none" stroke="#d9512c" strokeOpacity="0.35" strokeWidth="12" />
        {turns !== null && <circle cx={nx} cy={ny} r="9" fill="var(--background)" stroke={DIAL_TONE[verdict]} strokeWidth="4" />}
      </svg>
      <p className="-mt-6 text-lg font-medium tabular-nums" data-testid="turns">{turns === null ? "n/a" : turns.toFixed(1)}</p>
      <p className="text-[0.65rem] leading-tight" style={{ color: DIAL_TONE[verdict] }}>{WORD[verdict]}</p>
    </div>
  );
}

const W = 300, H = 140, P = { l: 44, r: 10, t: 10, b: 20 };

/** Cumulative cash, year 0 to 3, slow/base/strong. Dashed zero line; a dot where the base case crosses it. */
function Chart({ out }: { out: Outlook }) {
  const all = CASES.flatMap((c) => out.cases[c].cash);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), s = hi - lo || 1;
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / 3;
  const y = (v: number) => P.t + ((hi - v) / s) * (H - P.t - P.b);
  const path = (c: Case) => out.cases[c].cash.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const cross = zeroCrossing(out.cases.base.cash);
  const label = `Cumulative cash after year 3: slow ${k(out.cases.slow.cash[3])}, base ${k(out.cases.base.cash[3])}, strong ${k(out.cases.strong.cash[3])}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={label} data-testid="outlook-chart">
      {[hi, lo].map((t) => (
        <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity="0.08" /><text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">{k(t)}</text></g>
      ))}
      <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 4" />
      {CASES.map((c) => (
        <path key={c} d={path(c)} fill="none" strokeLinecap="round" strokeLinejoin="round" stroke={c === "base" ? "#d9512c" : "currentColor"} strokeOpacity={c === "base" ? 1 : 0.4} strokeWidth={c === "base" ? 2.5 : 1.5} strokeDasharray={c === "slow" ? "5 4" : undefined} />
      ))}
      {cross !== null && <circle cx={P.l + (cross * (W - P.l - P.r)) / 3} cy={y(0)} r="5" fill="var(--background)" stroke="currentColor" strokeWidth="2" />}
      {[0, 1, 2, 3].map((i) => <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"} fontSize="10" fill="currentColor" fillOpacity="0.5">{i === 0 ? "Open" : `Year ${i}`}</text>)}
    </svg>
  );
}
