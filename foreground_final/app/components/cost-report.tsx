"use client";

import { useEffect, useState } from "react";
import type { CostReport as Report } from "../lib/cost-report";
import type { OwnerBrief } from "../lib/discover";

const number = new Intl.NumberFormat("en-US");

function k(n: number) {
  const abs = Math.abs(n);
  const s = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M` : abs >= 1000 ? `$${Math.round(abs / 1000)}k` : `$${Math.round(abs)}`;
  return n < 0 ? `−${s}` : s;
}

function range(low: number, high: number) {
  return Math.round(low) === Math.round(high) ? k(low) : `${k(low)}–${k(high)}`;
}

const SCENARIO: Record<string, string> = { slow: "Slow year", base: "Typical year", strong: "Strong year" };

/** What this space costs to become the owner's restaurant: the engine's cost X-ray, break-even and outlook. */
export default function CostReport({ siteId, brief }: { siteId: string; brief: OwnerBrief | null }) {
  const key = `${siteId}:${brief?.concept}:${brief?.seats}:${brief?.budgetUsd}`;
  const [result, setResult] = useState<{ key: string; report?: Report; error?: string } | null>(null);
  const report = result?.key === key ? (result.report ?? null) : null;
  const error = result?.key === key ? (result.error ?? null) : null;
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/sites/${siteId}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief: brief ? { concept: brief.concept, seats: brief.seats, budgetUsd: brief.budgetUsd } : null }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
        return (await res.json()) as Report;
      })
      .then((r) => live && setResult({ key, report: r }))
      .catch((e: unknown) => live && setResult({ key, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
    // key captures every brief field the request sends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (error) return <p className="mt-10 text-sm text-accent">Could not load the cost estimate: {error}</p>;
  if (!report) {
    return (
      <div className="mt-10 flex items-center gap-3 text-sm text-foreground/50" role="status">
        <span className="inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-foreground/50" />
        Working out what this space will cost you…
      </div>
    );
  }

  const needed = report.lines.filter((l) => l.status !== "saved");
  const saved = report.lines.filter((l) => l.status === "saved");
  const visible = showAll ? needed : needed.slice(0, 6);
  const base = report.scenarios.find((s) => s.name === "base");

  return (
    <section className="mt-10 border-t border-foreground/10 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium tracking-tight">What it will cost you</h2>
          <p className="mt-1 text-sm text-foreground/50">
            A {report.concept.replace("-", " ")} with {report.seats} seats
            {report.budgetUsd ? `, against your ${k(report.budgetUsd)} budget` : ""}.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[clamp(1.6rem,2.6vw,2rem)] font-medium tracking-tight tabular-nums">{range(report.total.low, report.total.high)}</p>
          <p className={`text-sm ${report.overBudget ? "text-accent" : "text-match"}`}>
            {report.overBudget === null ? "to open the doors" : report.overBudget ? "likely over your budget" : "within your budget"}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-14 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-foreground/55">Build-out and opening costs</h3>
          <dl className="mt-4 space-y-4">
            {visible.map((line) => (
              <div key={line.id} className="grid grid-cols-[1.4fr_0.8fr] items-baseline gap-4">
                <dt>
                  <span className="font-medium">{line.label}</span>
                  {line.status === "maybe" && <span className="ml-2 rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/50">maybe</span>}
                  <span className="mt-0.5 block text-xs leading-relaxed text-foreground/45">{line.reason}</span>
                </dt>
                <dd className="text-right font-medium tabular-nums">{range(line.low, line.high)}</dd>
              </div>
            ))}
          </dl>
          {needed.length > 6 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-4 text-sm font-medium text-foreground/60 hover:text-foreground">
              {showAll ? "Show fewer" : `Show all ${needed.length} costs`}
            </button>
          )}
          {saved.length > 0 && (
            <p className="mt-6 rounded-[1.1rem] bg-match-soft px-4 py-3 text-sm leading-relaxed text-match">
              Already in place here, saving you {range(report.saved.low, report.saved.high)}: {saved.map((l) => l.label.toLowerCase()).join(", ")}.
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-foreground/55">Running it</h3>
          <dl className="mt-4 space-y-5">
            <Row label="Rent and occupancy" value={`${range(report.occupancyPerMonth.low, report.occupancyPerMonth.high)}/mo`} />
            {report.fairRent && (
              <Row
                label="Fair rent (model)"
                value={`$${number.format(Math.round(report.fairRent.lowPerSfYr))}–$${number.format(Math.round(report.fairRent.highPerSfYr))}/sq ft · ${report.fairRent.band}`}
              />
            )}
            <Row label="To break even" value={`${number.format(Math.round(report.breakeven.coversPerDay))} guests/day · ${report.breakeven.verdict}`} />
            <Row label="Average check" value={`$${number.format(Math.round(report.breakeven.avgCheckUsd))}`} />
            <Row label="Time to open" value={`${report.timeToOpenMonths.low}–${report.timeToOpenMonths.high} months`} />
          </dl>

          <h3 className="mt-8 text-sm font-medium text-foreground/55">Three-year outlook</h3>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {report.scenarios.map((s) => (
              <div key={s.name} className={`rounded-[1.1rem] px-3 py-3 ${s.name === "base" ? "bg-panel" : "bg-foreground/[0.03]"}`}>
                <p className="text-xs text-foreground/50">{SCENARIO[s.name]}</p>
                <p className={`mt-1 font-medium tabular-nums ${s.annualProfitUsd < 0 ? "text-accent" : ""}`}>{k(s.annualProfitUsd)}/yr</p>
                <p className="mt-0.5 text-xs text-foreground/45">{s.paybackYears ? `pays back in ${s.paybackYears.toFixed(1)} yrs` : "no payback"}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-foreground/60">{report.outlook}</p>
          <p className="mt-3 text-sm leading-relaxed text-foreground/60">{report.history}</p>
          {base && report.flags.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-accent/90">
              {report.flags.slice(0, 3).map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_1.3fr] items-baseline gap-4">
      <dt className="text-foreground/55">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
