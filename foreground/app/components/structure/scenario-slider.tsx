"use client";

import { useState } from "react";
import Badge from "../reskin/badge";
import { climateRunningCostDelta, climateValue, deltaText, formatValue } from "../../lib/climate";
import { HORIZONS, rowsFor, scenarioNames, type ScenarioResponse } from "../../lib/structure";
import ClimateChart from "./climate-chart";

type Sel = { scenario: string; horizon: number };

const PLAIN: Record<string, string> = { Low: "Low: the sea rises least", Intermediate: "Intermediate: the middle path", High: "High: the sea rises most" };

export default function ScenarioSlider({ data }: { data: ScenarioResponse }) {
  const c = data.climate && data.climate.metrics.length > 0 ? data.climate : undefined;
  const horizons = c?.horizons ?? [...HORIZONS];
  const scenarios = c?.scenarios ?? [];
  const start: Sel = { scenario: scenarios.includes("Intermediate") ? "Intermediate" : scenarios[0] ?? "", horizon: horizons.includes(2050) ? 2050 : horizons[0] };
  const [sel, setSel] = useState<Sel>(start);
  const [prev, setPrev] = useState<Sel | null>(null);
  const choose = (next: Sel) => { if (next.scenario !== sel.scenario || next.horizon !== sel.horizon) { setPrev(sel); setSel(next); } };
  const total = climateRunningCostDelta(c, sel.scenario, sel.horizon);

  // Detailed sourced table (kept for evidence): rows for the chosen NOAA scenario at the chosen horizon.
  const names = scenarioNames(data.table.rows);
  const noaa = names.find((n) => n === `NOAA ${sel.scenario}`) ?? names[0] ?? null;
  const rows = noaa ? rowsFor(data.table.rows, sel.horizon, noaa) : [];
  const exp = data.exposure.horizons.find((h) => h.horizon === sel.horizon);

  return (
    <div className="rounded-2xl border border-foreground/15 p-4 lg:col-span-2" data-testid="climate-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Climate scenarios</h3>
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">Scenario analysis, not a forecast</span>
      </div>
      {!c && <p className="mt-3 text-sm" role="status"><Badge kind="unknown">no sourced projection</Badge> No climate projections were retrieved for this region.</p>}
      {c && (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
            <fieldset>
              <legend className="text-xs text-foreground/50">Sea level path</legend>
              <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-foreground/15" role="radiogroup" aria-label="Climate scenario">
                {scenarios.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={s === sel.scenario} title={PLAIN[s]} onClick={() => choose({ ...sel, scenario: s })}
                    className={`px-3 py-1.5 text-sm ${s === sel.scenario ? "bg-accent text-background" : "hover:bg-foreground/5"}`}>{s}</button>
                ))}
              </div>
            </fieldset>
            <label className="block text-xs text-foreground/50">Year: <strong className="text-sm text-foreground" data-testid="horizon-label">{sel.horizon}</strong>
              <input type="range" min={0} max={horizons.length - 1} step={1} value={horizons.indexOf(sel.horizon)} onChange={(e) => choose({ ...sel, horizon: horizons[Number(e.target.value)] })}
                aria-label="Projection horizon" aria-valuetext={String(sel.horizon)} className="ml-3 w-40 align-middle accent-[var(--accent)]" />
              <span className="ml-2 text-foreground/40">{horizons.join(" / ")}</span>
            </label>
          </div>

          {total && (
            <p className="mt-4 rounded-xl bg-foreground/5 p-3 text-base" data-testid="climate-takeaway">
              <span key={total.usdPerYear} className="value-flash rounded px-1 font-semibold tabular-nums">About ${total.usdPerYear.toLocaleString("en-US")} more a year</span>{" "}
              to cool and insure this cafe by {sel.horizon} on the NOAA {sel.scenario} path.{" "}
              <span className="text-xs text-foreground/50">Demo estimate for a {c.assumptions.cafeSqFt?.toLocaleString("en-US")} sq ft cafe: ${total.cooling.toLocaleString("en-US")} cooling + ${total.insurance.toLocaleString("en-US")} flood insurance.</span>
            </p>
          )}

          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {c.metrics.map((m) => {
              const v = climateValue(c, m.id, sel.scenario, sel.horizon);
              const money = m.unit === "USD";
              const pv = prev ? climateValue(c, m.id, prev.scenario, prev.horizon) : null;
              return (
                <li key={m.id} className="rounded-xl border border-foreground/10 p-3" data-testid={`metric-${m.id}`}>
                  <div className="flex items-center justify-between gap-2 text-xs text-foreground/60"><span>{m.label}</span><Badge kind={m.kind === "sourced" ? "observed" : "estimated"}>{m.kind === "sourced" ? "sourced" : "demo estimate"}</Badge></div>
                  {v === null ? <p className="mt-1 text-sm text-foreground/50">no sourced projection</p> : (
                    <p className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span key={v} className="value-flash rounded px-1 text-2xl font-semibold tabular-nums" data-testid={`value-${m.id}`}>{formatValue(m.id, v)}</span>
                      <span className="text-xs text-foreground/50">{m.unit === "USD" ? "per year" : m.unit}</span>
                    </p>
                  )}
                  {v !== null && (
                    <p className="mt-0.5 text-xs text-foreground/60 tabular-nums">
                      {m.today !== null && <span>{deltaText(m.today, v, money)} vs today ({formatValue(m.id, m.today)})</span>}
                      {pv !== null && prev && v !== pv && <span key={`${prev.scenario}${prev.horizon}${v}`} className="value-flash ml-2 rounded px-1 font-medium text-accent" data-testid={`delta-${m.id}`}>{deltaText(pv, v, money)} since you moved from {prev.scenario} {prev.horizon}</span>}
                    </p>
                  )}
                  <ClimateChart metric={m} horizons={horizons} scenario={sel.scenario} horizon={sel.horizon} />
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-foreground/50">Sea level rise is sourced from NOAA. Everything marked demo estimate is a deterministic illustration derived from it for this listing, not a projection.</p>
        </>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-foreground/70">Sources, ranges and what is not available</summary>
        {rows.length === 0 && <p className="mt-2" role="status"><Badge kind="unknown">no sourced projection</Badge> for {noaa ?? sel.scenario} at {sel.horizon}. Nothing is interpolated.</p>}
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.metric + r.scenario} className="rounded-lg border border-foreground/10 p-2.5">
              <p>{r.metric}: <strong className="tabular-nums">{r.value} {r.unit}</strong> <span className="text-foreground/60">range {r.low} to {r.high}</span></p>
              <p className="mt-1 text-xs text-foreground/50">{r.station}. {r.note}</p>
              <p className="mt-0.5 break-all text-xs text-foreground/50">Source: {r.citation ?? "no citation"} (retrieved {r.retrieved ?? "unknown"})</p>
            </li>
          ))}
        </ul>
        {exp && (
          <p className="mt-2 rounded-lg bg-foreground/5 p-3"><span className="text-foreground/50">Sea level headroom {sel.horizon}:</span> {exp.seaLevel.headroomFt === null ? <Badge kind="unknown">unknown</Badge> : `${exp.seaLevel.headroomFt} ft`}. {exp.seaLevel.reading} <span className="text-xs text-foreground/50">{exp.femaZoneNote}. HVAC: {exp.hvacCapacity}.</span></p>
        )}
        <ul className="mt-2 space-y-1">
          {data.table.noSourced.map((n) => (
            <li key={n.metric}><Badge kind="unknown">{n.result}</Badge> {n.metric}{n.qualitative ? <span className="text-foreground/50"> ({n.qualitative}{n.citation ? `, ${n.citation}` : ""})</span> : null}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-foreground/50">{data.table.notice}</p>
      </details>
    </div>
  );
}
