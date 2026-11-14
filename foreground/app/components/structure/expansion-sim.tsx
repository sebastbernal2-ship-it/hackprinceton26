"use client";

import { useState } from "react";
import { money } from "../../lib/costs";
import { postExpansion, SAMPLE_PLAN, type ExpansionResponse } from "../../lib/structure";
import Badge from "../reskin/badge";

const range = (r: { low: number | null; expected: number | null; high: number | null }) =>
  r.expected === null ? "Unknown" : `${money(r.low)} / ${money(r.expected)} / ${money(r.high)}`;

function Graph({ g, base }: { g: ExpansionResponse["expansion"]["graph"]; base: string[] }) {
  const ids = Object.keys(g.rooms);
  const R = 90, cx = 150, cy = 110;
  const pos = Object.fromEntries(ids.map((id, i) => [id, [cx + R * Math.cos((2 * Math.PI * i) / ids.length - Math.PI / 2), cy + R * Math.sin((2 * Math.PI * i) / ids.length - Math.PI / 2)]]));
  return (
    <svg viewBox="0 0 300 220" role="img" aria-label="Room adjacency graph" className="w-full max-w-md">
      {g.edges.map((e) => (
        <g key={e.a + e.b}>
          <line x1={pos[e.a][0]} y1={pos[e.a][1]} x2={pos[e.b][0]} y2={pos[e.b][1]} stroke="#d9512c" strokeWidth={e.hint === "thick" ? 4 : 1.5} strokeDasharray={e.hint === "thick" ? undefined : "4 3"} />
          <text x={(pos[e.a][0] + pos[e.b][0]) / 2} y={(pos[e.a][1] + pos[e.b][1]) / 2 - 4} fontSize={8} textAnchor="middle" fill="currentColor">{e.hint}</text>
        </g>
      ))}
      {ids.map((id) => (
        <g key={id}>
          <circle cx={pos[id][0]} cy={pos[id][1]} r={20} fill={base.includes(id) ? "#1b1a17" : "#ece7dd"} stroke="#1b1a17" />
          <text x={pos[id][0]} y={pos[id][1]} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill={base.includes(id) ? "#f4f1ea" : "#1b1a17"}>{g.rooms[id].label.slice(0, 12)}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ExpansionSim({ listingId }: { listingId: number }) {
  const [res, setRes] = useState<ExpansionResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setErr(null);
    try { setRes(await postExpansion(listingId, SAMPLE_PLAN, ["a"])); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const max = res ? Math.max(1, ...res.timeline.phases.map((p) => p.cumulativeCapexKnown.high ?? 0)) : 1;
  return (
    <div className="rounded-2xl border border-foreground/15 p-4">
      <h3 className="text-sm font-medium">Expansion graph and timeline</h3>
      <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-accent">Scenario analysis, not a forecast</p>
      <p className="mt-1 text-sm text-foreground/60">Which neighbouring rooms could be added, how hard the shared wall looks, and a phased cost timeline. This property&apos;s floor plan is not loaded here, so the run below uses an <strong>illustrative sample plan, not this property</strong>.</p>
      <button type="button" onClick={run} disabled={busy} className="mt-3 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40">{busy ? "Simulating." : "Simulate with sample plan"}</button>
      {err && <p className="mt-2 text-sm text-accent" role="alert">{err}</p>}
      {res && (
        <div className="mt-4 space-y-5">
          <Graph g={res.expansion.graph} base={["a"]} />
          <p className="text-xs text-foreground/50">Dark node = current space. Thick edge = thick shared wall (a hint, not a determination).</p>
          <ul className="space-y-2 text-sm">
            {res.expansion.candidates.map((c) => (
              <li key={c.roomId} className="rounded-lg border border-foreground/10 p-2.5">
                <p><strong>{c.label}</strong> adds {c.areaSqFtGained} sq ft <Badge kind="estimated">wall hint</Badge></p>
                <p className="text-foreground/70">{c.openingDifficultyHint}</p>
                <p className="mt-1 text-xs text-foreground/50">Verify with engineer: {c.verifyWithEngineer.join(" | ")}</p>
              </li>
            ))}
          </ul>
          <ol className="space-y-2 text-sm" aria-label="Capex timeline">
            {res.timeline.phases.map((p) => (
              <li key={p.phase}>
                <div className="flex justify-between gap-3"><span>{p.label} <span className="text-foreground/50">(month {p.monthOffset}, {p.monthOffsetStatus})</span></span><span className="tabular-nums">{range(p.capex)}</span></div>
                <div className="mt-1 h-2 rounded bg-foreground/10"><div className="h-2 rounded bg-foreground/60" style={{ width: `${Math.round(((p.cumulativeCapexKnown.expected ?? 0) / max) * 100)}%` }} /></div>
                {p.unknownCostItems.length > 0 && <p className="text-xs text-foreground/50">Unknown cost items, excluded not zero: {p.unknownCostItems.join(", ")}</p>}
              </li>
            ))}
          </ol>
          <p className="text-xs text-foreground/50">Bars are cumulative expected cost of priced items only ({res.timeline.cumulativeStatus}). {res.expansion.notice}</p>
        </div>
      )}
    </div>
  );
}
