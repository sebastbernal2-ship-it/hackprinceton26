"use client";

import { useState } from "react";
import Badge from "../reskin/badge";
import { HORIZONS, rowsFor, scenarioNames, type ScenarioResponse } from "../../lib/structure";

export default function ScenarioSlider({ data }: { data: ScenarioResponse }) {
  const [hi, setHi] = useState(1);
  const horizon = HORIZONS[hi];
  const names = scenarioNames(data.table.rows);
  const [scenario, setScenario] = useState<string | null>(null);
  const active = scenario ?? names[0] ?? null;
  const rows = active ? rowsFor(data.table.rows, horizon, active) : [];
  const exp = data.exposure.horizons.find((h) => h.horizon === horizon);
  return (
    <div className="rounded-2xl border border-foreground/15 p-4">
      <h3 className="text-sm font-medium">Climate scenarios</h3>
      <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-accent">Scenario analysis, not a forecast</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="text-sm">Horizon: <strong>{horizon}</strong>
          <input type="range" min={0} max={HORIZONS.length - 1} step={1} value={hi} onChange={(e) => setHi(Number(e.target.value))}
            aria-label="Projection horizon" aria-valuetext={String(horizon)} className="ml-3 align-middle accent-[var(--accent)]" />
        </label>
        <span className="text-xs text-foreground/40">{HORIZONS.join(" / ")}</span>
        {names.length > 0 && (
          <label className="text-sm">Scenario{" "}
            <select value={active ?? ""} onChange={(e) => setScenario(e.target.value)} className="rounded-lg border border-foreground/15 bg-background px-2 py-1">
              {names.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      {names.length === 0 && <p className="mt-3 text-sm" role="status"><Badge kind="unknown">no sourced projection</Badge> No climate projections were retrieved for this region.</p>}
      {names.length > 0 && rows.length === 0 && <p className="mt-3 text-sm" role="status"><Badge kind="unknown">no sourced projection</Badge> for {active} at {horizon}. Nothing is interpolated.</p>}
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.metric + r.scenario} className="rounded-lg border border-foreground/10 p-2.5">
            <p>{r.metric}</p>
            <p className="mt-0.5 tabular-nums"><strong>{r.value} {r.unit}</strong> <span className="text-foreground/60">range {r.low} to {r.high}</span></p>
            <p className="mt-1 text-xs text-foreground/50">{r.station}. {r.note}</p>
            <p className="mt-0.5 break-all text-xs text-foreground/50">Source: {r.citation ?? "no citation"} (retrieved {r.retrieved ?? "unknown"})</p>
          </li>
        ))}
      </ul>
      {exp && (
        <div className="mt-3 rounded-lg bg-foreground/5 p-3 text-sm">
          <p><span className="text-foreground/50">Sea level headroom {horizon}:</span> {exp.seaLevel.headroomFt === null ? <Badge kind="unknown">unknown</Badge> : `${exp.seaLevel.headroomFt} ft`}. {exp.seaLevel.reading}</p>
          <p className="mt-1 text-xs text-foreground/50">{exp.femaZoneNote}. Wind: {exp.wind}. HVAC: {exp.hvacCapacity}.</p>
        </div>
      )}
      <div className="mt-3 text-sm">
        <p className="text-foreground/50">Not available from any retrieved source:</p>
        <ul className="mt-1 space-y-1">
          {data.table.noSourced.map((n) => (
            <li key={n.metric}><Badge kind="unknown">{n.result}</Badge> {n.metric}{n.qualitative ? <span className="text-foreground/50"> ({n.qualitative}{n.citation ? `, ${n.citation}` : ""})</span> : null}</li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-foreground/50">{data.table.notice}</p>
    </div>
  );
}
