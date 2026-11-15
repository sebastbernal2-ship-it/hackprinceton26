"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCostBreakdown } from "../lib/cost-categories";
import { briefBudget, outlook, seatTotal, xrayLines, xrayTotal } from "../lib/cost-side";
import { fetchLayoutCost, layoutCostItems, nameFor, pct, scenarioKey } from "../lib/layout-cost";
import type { LayoutSummary } from "../lib/layout-summary";
import type { Asset } from "../lib/assets";
import { readBrief } from "../lib/brief";
import type { Match } from "../lib/matches";
import { allInRange, budgetGap, budgetStatus, defaultArea, defaultSeats, delta, describeChange, fmtDeltaMonths, lineDeltas, mid, parsePositive, parseSeats, paybackText, rentRequest, resolveBudget, totalCostKey, type Inputs } from "../lib/quantify-model";
import { fetchTotalCost, range } from "../lib/total-cost";
import { useDelta, useScenario } from "../lib/use-scenario";
import CostCategories, { climateInput, useClimate } from "./cost-categories";
import CostPanel from "./cost-panel";
import { Outlook } from "./cost-side";
import FinancePanel from "./finance/finance-panel";
import { Delta, field, LayoutTable, Section, Stat } from "./quantify-parts";
import Stepper from "./stepper";
import CostarBuilding from "./costar-building";
import DataStreams from "./data-streams";
import Projections from "./projections";
import StructurePanel from "./structure/structure-panel";
import { DisciplineLayout, useViewMode } from "./discipline-view";
import { isScanOnly } from "../lib/matches";

type QuantifyProps = {
  match: Match; layout: LayoutSummary | null; onBackToLayout: () => void; onClose: () => void; onStep?: (step: number) => void; step?: number;
  /** The reference-kit pieces placed in the Planner and the owner's assumed area, shared with the Planner and its live cost panel. */
  kit?: Asset[]; onKit?: (items: Asset[]) => void; area?: string; onArea?: (v: string) => void;
  /** Typed budget (null = none typed, so the intake brief's applies), shared with the live cost panel. */
  budgetText?: string | null; onBudgetText?: (v: string) => void;
};

const k = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compact = (n: number) => (Math.abs(n) >= 1000 ? `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n) / 1000)}k` : k.format(n));
const span = (r: { low: number; high: number } | null) => (r ? `${compact(r.low)} to ${compact(r.high)}` : "Unknown");

/**
 * Step 5, Quantify. One page, one set of inputs: seats, area, budget, rent basis, period and the equipment placed in the Planner.
 * Every input feeds either a request (area, budget, rent, period, pieces) or a client calculation (seats, budget status, break-even),
 * and the sticky summary shows the effect: a highlight when a number recalculates and the change against the previous value.
 * All figures are estimates; unknown parts are shown as unknown, never as zero.
 */
export default function Quantify({ match, layout, onBackToLayout, onClose, onStep, step, kit = [], onKit = () => {}, area = "", onArea = () => {}, budgetText = null, onBudgetText = () => {} }: QuantifyProps) {
  // Inputs. "edited" is null until the person types, so untouched fields keep following the Planner and the brief.
  const [seatsEdited, setSeatsEdited] = useState<string | null>(null);
  const [areaEdited, setAreaEdited] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [ownRate, setOwnRate] = useState("");
  const [months, setMonths] = useState(12);
  const [fromBrief] = useState<number | null>(() => briefBudget(readBrief()));

  const seatsText = seatsEdited ?? defaultSeats(layout?.seats, seatTotal(kit), match.spaceSquareFeet || null);
  const seats = parseSeats(seatsText);
  const areaText = areaEdited ?? defaultArea(area, match.spaceSquareFeet || match.squareFeet);
  const sqft = parsePositive(areaText);
  const budget = resolveBudget(budgetText, fromBrief);
  const budgetShown = budgetText ?? (fromBrief ? String(fromBrief) : "");

  // Requests.
  const items = useMemo(() => layoutCostItems(kit), [kit]);
  const lcKey = items.length > 0 ? scenarioKey(items, sqft, budget) : null;
  const lc = useScenario(lcKey, () => fetchLayoutCost(items, sqft, budget));
  const pid = match.demo ? match.costarPropertyId ?? null : match.listingId;
  const fromLayout = kit.length > 0; // build-out is priced from the placed pieces, so the generic per-sq-ft build-out is left out (no double count)
  const tcKey = totalCostKey({ pid, sqft, source, ownRate, months, fromLayout });
  const tc = useScenario(tcKey, () => {
    const r = rentRequest(source, ownRate);
    return fetchTotalCost(pid as number, { sqft, rent: r.rent, rentSource: r.rentSource, months, buildoutFromLayout: fromLayout });
  });
  const lcData = lc.data, tcData = tc.data;
  const pending = lc.pending || tc.pending;
  const failed = (lcKey !== null && lc.failed) || (tcKey !== null && tc.failed);

  // Derived figures.
  const xray = useMemo(() => xrayLines(kit), [kit]);
  const hidden = useMemo(() => xrayTotal(xray), [xray]);
  const allIn = fromLayout ? allInRange(lcData?.buildout ?? null, hidden) : tcData?.oneTime ?? null;
  const status = allIn ? budgetStatus(allIn, budget) : null;
  const gap = budgetGap(allIn, budget);
  const monthly = tcData?.monthly ?? null;
  const out = allIn && monthly && seats ? outlook(seats, mid(allIn) as number, (mid(monthly) as number) * 12) : null;
  const payback = out ? out.cases.base.paybackMonths : null;

  const dAll = useDelta(mid(allIn)), dMonthly = useDelta(mid(monthly)), dGap = useDelta(gap), dPay = useDelta(payback);

  // "Recalculated" line: what the person last changed, and when the services last answered.
  const inputs: Inputs = { seats: seatsText, area: areaText, budget: budgetShown, rent: source === "own" ? `own ${ownRate}` : source ?? "default", period: months, kit: kit.length };
  const [track, setTrack] = useState<{ inputs: Inputs; change: string | null; n: number }>({ inputs, change: null, n: 0 });
  const changed = describeChange(track.inputs, inputs);
  if (changed) setTrack({ inputs, change: changed, n: track.n + 1 });
  const lastAnswer = Math.max(lc.at ?? 0, tc.at ?? 0) || null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  // Costs breakdown: every cost line grouped into categories that add up to the headline numbers.
  const climate = useClimate(pid);
  const [scen, setScen] = useState("Intermediate");
  const [horizon, setHorizon] = useState(2050);
  const breakdown = useMemo(
    () => buildCostBreakdown({ fromLayout, lc: lcData, nameFor: (id) => nameFor(kit, id), xray, tc: tcData, climate: climateInput(climate.model, climate.reason, scen, horizon) }),
    [fromLayout, lcData, kit, xray, tcData, climate.model, climate.reason, scen, horizon],
  );
  const cm = climate.model;
  const climateControls = cm && (
    <div className="flex flex-wrap items-center gap-3 py-2 text-xs text-foreground/60" data-testid="climate-controls">
      <label className="flex items-center gap-1.5">Climate scenario
        <select aria-label="Climate scenario" value={scen} onChange={(e) => setScen(e.target.value)} className="rounded-md border border-foreground/20 bg-background px-2 py-1">{cm.scenarios.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="flex items-center gap-1.5">Horizon
        <select aria-label="Climate horizon" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="rounded-md border border-foreground/20 bg-background px-2 py-1">{cm.horizons.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
    </div>
  );

  // Per-line before/after.
  const partMap = (d: typeof tcData) => Object.fromEntries((d?.parts ?? []).map((p) => [p.id, (p.low + p.high) / 2]));
  const tcDeltas = lineDeltas(tc.prev ? partMap(tc.prev) : null, partMap(tcData));
  const totalDelta = delta(mid(tc.prev?.total), mid(tcData?.total));

  const distinct = [...new Map(kit.map((a) => [a.assetId, a])).values()];
  const setPieces = (a: Asset, by: 1 | -1) => {
    if (by === 1) return onKit([...kit, a]);
    const i = kit.findLastIndex((x) => x.assetId === a.assetId);
    if (i >= 0) onKit(kit.filter((_, j) => j !== i));
  };
  const chosen = source ?? tcData?.rentChosen?.id ?? null;
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? "border-foreground bg-foreground text-background" : "border-foreground/20"}`;
  const unpricedNames = (lcData?.unpriced ?? []).map((u) => nameFor(kit, u.assetId));
  const [viewMode] = useViewMode();
  const disc = viewMode === "discipline";
  const periodLabel = months === 12 ? "first year" : `${months / 12} years`;

  const equipmentBlock = (
          <div className="mt-5">
            <p className="text-sm text-foreground/55">Equipment from the Planner</p>
            {distinct.length === 0 ? <p className="mt-1 text-xs text-foreground/50">None placed. Use the Planner (Load cafe reference kit) to price equipment; build-out then comes from your pieces.</p> : (
              <ul className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2" aria-label="Equipment in this scenario">
                {distinct.map((a) => (
                  <li key={a.assetId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <button type="button" aria-label={`Remove one ${a.name}`} onClick={() => setPieces(a, -1)} className="h-7 w-7 rounded-full border border-foreground/25">-</button>
                    <span className="w-6 text-center tabular-nums">{kit.filter((x) => x.assetId === a.assetId).length}</span>
                    <button type="button" aria-label={`Add one ${a.name}`} onClick={() => setPieces(a, 1)} className="h-7 w-7 rounded-full border border-foreground/25">+</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
  );
  const layoutBlock = (<>
          {layout ? <LayoutTable layout={layout} /> : <p className="text-sm text-foreground/60">{match.demo ? "No editable 3D layout: costs use the equipment placed in the Planner." : "No 3D layout yet. Open Scope out your vision, arrange the space, then continue here."}</p>}
  </>);
  const moneyBlock = (<>
          {kit.length > 0 && (
            <div className="mt-6" data-testid="xray">
              <h3 className="text-sm font-medium">Hidden-cost X-ray (estimated)</h3>
              <ul className="mt-2 divide-y divide-foreground/10 text-sm">
                {xray.map((l) => <li key={l.id} className="py-1.5"><div className="flex justify-between gap-2"><span>{l.label}</span><span className="tabular-nums text-foreground/70">{span(l.range)}</span></div><p className="text-xs text-foreground/45">{l.why} Source: {l.source}</p></li>)}
              </ul>
            </div>
          )}
          {tcData && <p className="mt-6 text-xs text-foreground/50">Sources: {tcData.parts.map((p) => `${p.label}, ${p.source}`).join("; ")}</p>}
          {!match.demo && <CostPanel listingId={match.listingId} />}
          {!match.demo && (seats ? <FinancePanel listingId={match.listingId} seats={seats} rentUnknownAssumption={tcData?.parts.find((p) => p.id === "rent")?.low} /> : <p className="mt-6 text-sm text-foreground/55">Enter a seat count to run the 36-month scenario.</p>)}
  </>);
  const secInputs = (
        <Section n={1} title="Inputs" hint={`${seats ?? "?"} seats · ${sqft ? `${sqft.toLocaleString()} sq ft` : "no area"} · ${budget ? compact(budget) : "no budget"}`} defaultOpen={disc} testId="sec-inputs">
          <p className="text-sm text-foreground/55">Change any value; the summary above recalculates. Starting values come from your brief and the Planner. They are assumptions, not facts.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm"><span className="block text-foreground/55">Seats</span>
              <input type="number" min={1} max={500} inputMode="numeric" aria-label="Seats" value={seatsText} onChange={(e) => setSeatsEdited(e.target.value)} className={`${field} w-full`} />
              <span className="mt-1 block text-xs text-foreground/45">{seatsEdited !== null ? "Your number." : layout && layout.seats > 0 ? `Counted from your 3D layout (${layout.seats}).` : seatTotal(kit) > 0 ? "From the Planner (estimated)." : match.spaceSquareFeet ? "Estimated from the space area (30 sq ft per seat); change it to your plan." : "Enter the seats you plan."}</span></label>
            <label className="text-sm"><span className="block text-foreground/55">Area (sq ft)</span>
              <input type="number" min={1} inputMode="numeric" aria-label="Area in square feet" value={areaText} placeholder="e.g. 1200" onChange={(e) => { setAreaEdited(e.target.value); onArea(e.target.value); }} className={`${field} w-full`} />
              <span className="mt-1 block text-xs text-foreground/45">Your assumption for the space you would lease{tcData?.buildingSquareFeet ? `; the building is ${Math.round(tcData.buildingSquareFeet).toLocaleString()} sq ft` : ""}. Drives fit-out and rent.</span></label>
            <label className="text-sm"><span className="block text-foreground/55">Budget (USD)</span>
              <input type="number" min={1} inputMode="numeric" aria-label="Budget in dollars" value={budgetShown} placeholder="e.g. 250000" onChange={(e) => onBudgetText(e.target.value)} className={`${field} w-full`} />
              <span className="mt-1 block text-xs text-foreground/45">{budgetText === null && fromBrief ? "From your brief." : "Compared with the all-in range."}</span></label>
            <label className="text-sm"><span className="block text-foreground/55">Period</span>
              <select aria-label="Period" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={`${field} w-full`}>
                <option value={12}>First year</option><option value={24}>Two years</option><option value={36}>Three years</option>
              </select>
              <span className="mt-1 block text-xs text-foreground/45">Length of the running-cost total.</span></label>
          </div>
          <fieldset className="mt-5">
            <legend className="text-sm text-foreground/55">Rent basis</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {(tcData?.rentOptions ?? []).map((o) => (
                <button key={o.id} type="button" onClick={() => setSource(o.id)} aria-pressed={chosen === o.id} className={chip(chosen === o.id)}>
                  {o.label}: ${o.rate}/sq ft/yr <span className="opacity-60">({o.status})</span>
                </button>
              ))}
              <button type="button" onClick={() => setSource("own")} aria-pressed={chosen === "own"} className={chip(chosen === "own")}>My own rate</button>
              {chosen === "own" && <input type="number" min={1} value={ownRate} onChange={(e) => setOwnRate(e.target.value)} placeholder="$/sq ft/yr" aria-label="Your rent rate, dollars per square foot per year" className="w-32 rounded-lg border border-foreground/20 bg-background px-3 py-1.5 text-sm tabular-nums" />}
            </div>
            {tcData?.rentChosen && chosen !== "own" && <p className="mt-2 text-xs text-foreground/45">{tcData.rentChosen.source}</p>}
            {chosen === "own" && !parsePositive(ownRate) && <p className="mt-2 text-xs text-foreground/45">Enter a rate; until then the default basis is used.</p>}
          </fieldset>
          {!disc && equipmentBlock}
        </Section>
  );
  const secCosts = (
        <Section n={2} title="Costs breakdown" hint={allIn ? `${span(allIn)} all-in (estimated)` : "estimated ranges, not quotes"} defaultOpen={disc} testId="sec-costs">
          <p className="text-sm text-foreground/55">Ranges, not quotes. Every line sits in a category; open one to see each item. Freight is not included. Hidden systems are counted at 50% until inspected. Unpriced items are named and left out of totals: unknown, not free.</p>
          {failed && <p role="alert" className="mt-3 text-sm text-foreground/60">Cannot say: the cost service did not answer.</p>}
          <div className="mt-2"><CostCategories breakdown={breakdown} pending={pending} climateControls={climateControls} /></div>
          {fromLayout && lcData && lcData.unpriced.length > 0 && <p className="mt-3 text-xs text-foreground/60" data-testid="unpriced">Unpriced, left out of every total ({unpricedNames.length}): {unpricedNames.join(", ")}.</p>}
          {fromLayout && !lcData && !failed && <p className="mt-4 text-sm text-foreground/50">Pricing your pieces…</p>}
          {budget && lcData?.pOverBudget != null && <p className="mt-3 text-sm" data-testid="cost-pover">P(build-out over {compact(budget)}): <span className="font-medium tabular-nums">{pct(lcData.pOverBudget)}</span> <span className="text-xs text-foreground/50">(simulated; excludes hidden systems)</span></p>}
          {!fromLayout && <p className="mt-3 text-xs text-foreground/50">No equipment placed, so build-out is a per-square-foot estimate for your area.</p>}
        </Section>
  );
  const secRunning = (
        <Section n={3} title="Running costs and outlook" hint={monthly ? `${span(monthly)} / month · break-even ${seats && out ? paybackText(payback) : "unknown"}` : "rent and operating"} defaultOpen={disc} testId="sec-running">
          {!tcKey && <p className="text-sm text-foreground/60">Rent and running costs need a CoStar building record. This scan has none linked, so they are unknown, not zero.</p>}
          {tcData && (
            <>
              <table className="w-full text-sm" data-testid="running-lines">
                <tbody>
                  {tcData.parts.filter((p) => p.basis === "monthly").map((p) => (
                    <tr key={p.id} className="border-t border-foreground/10 align-top">
                      <td className="py-2 pr-3">{p.label}<span className="ml-2 text-xs text-foreground/45">{p.status}</span></td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums" data-testid={`line-${p.id}`}>{range(p)} /mo<Delta d={tcDeltas[p.id]} testId={`delta-${p.id}`} /></td>
                    </tr>
                  ))}
                  {tcData.excluded.map((e) => (
                    <tr key={e.id} className="border-t border-foreground/10 text-foreground/60"><td className="py-2 pr-3">{e.id === "rent" ? "Rent" : e.id} <span className="text-xs">unknown: {e.reason}. Not counted, not zero.</span></td><td className="py-2 text-right">Unknown</td></tr>
                  ))}
                  <tr className="border-t border-foreground/20 font-medium"><td className="py-2 pr-3">Total over the {periodLabel}{fromLayout ? " (running costs only)" : " (build-out included)"}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums" data-testid="line-period-total">{range(tcData.total)}<Delta d={totalDelta} testId="delta-period-total" /></td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-foreground/45">{tcData.totalStatus === "complete" ? "All parts known." : `Partial total: ${tcData.totalStatus.replace("partial: ", "")}.`} {tcData.notice}</p>
            </>
          )}
          <div className="mt-6">
            <h3 className="text-sm font-medium">Break-even and 3-year outlook</h3>
            {out ? <div className="mt-2 max-w-xl"><Outlook out={out} /></div>
              : <p className="mt-1 text-sm text-foreground/55">{!seats ? "Enter a seat count in Inputs." : !allIn ? "Needs a build-out price." : "Needs a monthly running cost (rent basis)."}</p>}
          </div>
        </Section>
  );
  const secDetails = (
<Section title="Details" hint="your layout, hidden-cost sources, repair costs, 36-month scenario" testId="sec-details">
          {layout ? <LayoutTable layout={layout} /> : <p className="text-sm text-foreground/60">{match.demo ? "No editable 3D layout: costs use the equipment placed in the Planner." : "No 3D layout yet. Open Scope out your vision, arrange the space, then continue here."}</p>}
          {kit.length > 0 && (
            <div className="mt-6" data-testid="xray">
              <h3 className="text-sm font-medium">Hidden-cost X-ray (estimated)</h3>
              <ul className="mt-2 divide-y divide-foreground/10 text-sm">
                {xray.map((l) => <li key={l.id} className="py-1.5"><div className="flex justify-between gap-2"><span>{l.label}</span><span className="tabular-nums text-foreground/70">{span(l.range)}</span></div><p className="text-xs text-foreground/45">{l.why} Source: {l.source}</p></li>)}
              </ul>
            </div>
          )}
          {tcData && <p className="mt-6 text-xs text-foreground/50">Sources: {tcData.parts.map((p) => `${p.label}, ${p.source}`).join("; ")}</p>}
          {!match.demo && <CostPanel listingId={match.listingId} />}
          {!match.demo && (seats ? <FinancePanel listingId={match.listingId} seats={seats} rentUnknownAssumption={tcData?.parts.find((p) => p.id === "rent")?.low} /> : <p className="mt-6 text-sm text-foreground/55">Enter a seat count to run the 36-month scenario.</p>)}
        </Section>
  );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="quantify-title" className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground animate-rise">
      <div className="mx-auto max-w-[68rem] px-6 pb-16 pt-6 sm:px-12">
        <div className="flex flex-wrap gap-3 pr-44 sm:pr-0">
          <button type="button" onClick={onBackToLayout} className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70">Back to your layout</button>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-foreground/60 transition-opacity hover:opacity-70">Back to property</button>
        </div>
        <div className="mb-5 mt-6"><Stepper active={step ?? 4} onStep={onStep} /></div>
        <h1 id="quantify-title" className="text-[clamp(1.6rem,4vw,2.5rem)] font-medium leading-tight tracking-tight">Quantify</h1>
        <p className="mt-1 text-foreground/50">{match.address}{match.detail ? ` · ${match.detail}` : ""}</p>

        <div className="sticky top-0 z-10 -mx-6 mt-5 border-b border-foreground/10 bg-background px-6 py-3 sm:-mx-12 sm:px-12" data-testid="summary-strip" aria-label="Summary">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Stat id="allin" label="All-in cost (est.)" value={allIn ? span(allIn) : fromLayout ? "Pricing…" : "Unknown"} n={dAll.n} pending={pending} d={delta(dAll.prev, mid(allIn))} sub={fromLayout ? "build-out incl. hidden systems" : "one-time"} />
            <Stat id="budget" label="Vs budget" value={!budget ? "No budget" : !status ? "Pricing…" : status.tone === "under" ? "Within" : status.tone === "over" ? "Over" : "Close"} n={dGap.n} pending={pending}
              d={delta(dGap.prev, gap)} sub={budget ? `of ${compact(budget)}${gap !== null ? ` · ${gap >= 0 ? compact(gap) + " spare" : compact(-gap) + " over"} at mid` : ""}` : "type one below"} />
            <Stat id="monthly" label="Running cost / month" value={monthly ? span(monthly) : "Unknown"} n={dMonthly.n} pending={pending} d={delta(dMonthly.prev, mid(monthly))} sub="rent + operating" />
            <Stat id="breakeven" label="Break-even (est.)" value={!seats ? "Enter seats" : out ? paybackText(payback) : "Pending"} n={dPay.n} pending={pending} d={delta(dPay.prev, payback)} fmt={fmtDeltaMonths} sub={seats ? `${seats} seats, base case` : "needs seats"} />
          </div>
          <p role="status" aria-live="polite" data-testid="recalc" className="mt-2 text-xs text-foreground/55">
            {failed ? "The cost service did not answer. Nothing here is zero; it is unknown."
              : pending ? <span className="animate-breathe">Recalculating…</span>
              : <span key={track.n} className="animate-recalc rounded px-1">Recalculated{track.change ? `: ${track.change}` : ""}{lastAnswer ? ` · costs refreshed ${new Date(lastAnswer).toLocaleTimeString("en-US", { hour12: false })}` : ""}</span>}
          </p>
        </div>

        {disc ? (
          <DisciplineLayout page="quantify" match={match} onAct={() => onStep?.(5)} extra={{ budgetTone: status?.tone ?? null, paybackMonths: payback, hasAllIn: Boolean(allIn), hasRent: Boolean(monthly), seats, equipmentCount: kit.length }} panels={{
            "q-inputs": secInputs, "q-costs": secCosts, "q-running": secRunning,
            "q-money-details": <div className="mt-4">{moneyBlock}</div>,
            "q-layout": <div className="mt-4">{layoutBlock}</div>,
            "q-equipment": <div className="mt-4">{equipmentBlock}</div>,
            "q-structure": <>{match.costarPropertyId && <CostarBuilding propertyId={match.costarPropertyId} city={match.city} />}{!match.demo && !isScanOnly(match) && <StructurePanel listingId={match.listingId} />}</>,
            "q-market": !match.demo && <>{!isScanOnly(match) && <Projections listingId={match.listingId} />}<DataStreams listingId={match.listingId} /></>,
          }} />
        ) : (<>{secInputs}{secCosts}{secRunning}{secDetails}</>)}
      </div>
    </div>
  );
}
