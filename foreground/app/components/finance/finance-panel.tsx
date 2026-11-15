"use client";

import { useEffect, useState } from "react";
import { bandPath, cashSeries, fetchLedger, pct, scale, simulate, usd, type LedgerPage, type Simulation } from "../../lib/finance";

type Sim = Extract<Simulation, { status: "simulated" }>;
const W = 640, H = 220, PAD = 8;

function CashChart({ sim }: { sim: Sim }) {
  const s = cashSeries(sim);
  const n = s.p50.length;
  if (!n) return <p className="text-sm text-foreground/60">Cannot say: no monthly series returned.</p>;
  const all = [...s.p50, ...(s.p10 ?? []), ...(s.p90 ?? []), sim.endCash.p5, sim.endCash.p95, 0];
  const lo = Math.min(...all), hi = Math.max(...all);
  const xs = s.p50.map((_, i) => PAD + (i / Math.max(n - 1, 1)) * (W - 2 * PAD - 120));
  const y = (v: number[]) => scale(v, lo, hi, H - 2 * PAD, true).map((p) => p + PAD);
  const line = y(s.p50).map((p, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)} ${p.toFixed(1)}`).join("");
  const zero = y([0])[0];
  const xEnd = xs[n - 1];
  const [e5, e50, e95] = y([sim.endCash.p5, sim.endCash.p50, sim.endCash.p95]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="max-h-64 w-full" role="img" aria-label="36-month cash scenario chart" data-testid="cash-chart">
      <line x1={PAD} x2={W - 120} y1={zero} y2={zero} stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" />
      <text x={W - 116} y={zero + 4} fontSize="10" fill="currentColor" fillOpacity="0.5">$0</text>
      {s.p10 && s.p90 && <path d={bandPath(xs, y(s.p90), y(s.p10))} fill="var(--accent)" fillOpacity="0.18" data-testid="cash-band" />}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {/* Month-36 spread: the API gives P5/P50/P95 of ending cash; the per-month band is drawn only when the API supplies one. */}
      <line x1={xEnd + 12} x2={xEnd + 12} y1={e95} y2={e5} stroke="currentColor" strokeOpacity="0.6" />
      {[[e95, "P95", sim.endCash.p95], [e50, "P50", sim.endCash.p50], [e5, "P5", sim.endCash.p5]].map(([py, l, v]) => (
        <g key={String(l)}>
          <line x1={xEnd + 8} x2={xEnd + 16} y1={py as number} y2={py as number} stroke="currentColor" strokeOpacity="0.6" />
          <text x={xEnd + 20} y={(py as number) + 3} fontSize="10" fill="currentColor" fillOpacity="0.7">{String(l)} {usd(v as number)}</text>
        </g>
      ))}
      <text x={PAD} y={H - 1} fontSize="10" fill="currentColor" fillOpacity="0.5">month 1</text>
      <text x={xEnd - 40} y={H - 1} fontSize="10" fill="currentColor" fillOpacity="0.5">month {n}</text>
    </svg>
  );
}

function BreakEven({ sim }: { sim: Sim }) {
  const hist = Object.entries(sim.breakEven.histogram).map(([m, c]) => [Number(m), c] as const).sort((a, b) => a[0] - b[0]);
  const max = Math.max(1, ...hist.map(([, c]) => c));
  const be = sim.breakEven.monthDist;
  return (
    <div data-testid="breakeven">
      <p className="text-sm">
        Break-even reached in {pct(sim.breakEven.pReached)} of draws{be ? `; month ${be.p5} / ${be.p50} / ${be.p95} (P5 / P50 / P95)` : "; cannot say when"}.
      </p>
      <svg viewBox="0 0 360 70" className="mt-1 w-full max-w-md" role="img" aria-label="Break-even month distribution">
        {hist.map(([m, c]) => <rect key={m} x={(m - 1) * 10} y={64 - (c / max) * 60} width="8" height={(c / max) * 60} fill="var(--match)" />)}
        <line x1="0" x2="360" y1="64" y2="64" stroke="currentColor" strokeOpacity="0.3" />
      </svg>
      <p className="text-xs text-foreground/45">Months 1-36. {sim.breakEven.definition}.</p>
    </div>
  );
}

/** seats: from the owner's layout when known (Quantify passes the 3D plan's count); 60 is the old fixed assumption. */
export default function FinancePanel({ listingId, rentUnknownAssumption, seats = 60 }: { listingId: number; rentUnknownAssumption?: number; seats?: number }) {
  const [state, setState] = useState<{ id: number; sim: Simulation | null; ledger: LedgerPage | null } | null>(null);
  const [table, setTable] = useState("deposits");
  const [typedRent, setTypedRent] = useState("");
  const [userRent, setUserRent] = useState<number | undefined>(undefined);
  const rent = rentUnknownAssumption ?? userRent;

  useEffect(() => {
    let live = true;
    (async () => {
      const sim = await simulate({ listingId, seats, ...(rent ? { monthlyRentAssumption: rent } : {}) });
      const runId = sim && sim.status === "simulated" ? sim.runId : undefined;
      const ledger = runId ? await fetchLedger(runId, "deposits") : null;
      if (live) setState({ id: listingId, sim, ledger });
    })();
    return () => { live = false; };
  }, [listingId, rent, seats]);

  async function pick(t: string) {
    setTable(t);
    const cur = state?.sim;
    if (cur?.status === "simulated" && cur.runId) {
      const ledger = await fetchLedger(cur.runId, t);
      setState((s) => (s ? { ...s, ledger } : s));
    }
  }

  const cur = state?.id === listingId ? state : null;
  const sim = cur?.sim;
  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="fin-title" data-testid="finance-panel">
      <h2 id="fin-title" className="text-lg font-medium tracking-tight">Illustrative 36-month shop scenario</h2>
      <p className="mt-1 text-sm font-medium text-accent">Scenario analysis, not a forecast.</p>
      {!cur && <p className="mt-3 text-sm text-foreground/50">Running simulation.</p>}
      {cur && !sim && <p className="mt-3 text-sm text-foreground/60">The finance service is not reachable. Cannot say.</p>}
      {sim?.status === "blocked" && (
        <div className="mt-3 rounded-lg border border-foreground/15 p-3 text-sm" data-testid="finance-blocked">
          <b>Cannot say.</b> Required inputs are unknown: {sim.unknownInputs.join(", ")}. {sim.note}
          {sim.unknownInputs.includes("rent_monthly") && (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(typedRent); if (Number.isFinite(n) && n > 0) setUserRent(n); }}>
              <label className="text-xs text-foreground/55">Your monthly rent assumption (USD, not a listed price)
                <input inputMode="numeric" value={typedRent} onChange={(e) => setTypedRent(e.target.value)} placeholder="e.g. 12000" aria-label="Monthly rent assumption" className="mt-1 block rounded-lg border border-foreground/20 bg-background px-3 py-1.5 text-sm text-foreground" />
              </label>
              <button type="submit" disabled={!(Number(typedRent) > 0)} className="rounded-full bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-40">Run with my assumption</button>
            </form>
          )}
        </div>
      )}
      {sim?.status === "simulated" && (
        <div className="mt-3 space-y-5">
          <p className="text-sm" data-testid="finance-headline">
            P(cash shortfall within 36 months) {pct(sim.pCashShortfall)} · year-2 DSCR {sim.dscr.p50 != null ? `${sim.dscr.p50.toFixed(2)} (P5 ${sim.dscr.p5?.toFixed(2)}, P95 ${sim.dscr.p95?.toFixed(2)})` : "cannot say"}
            {" "}· P(DSCR below 1.25) {pct(sim.dscr["pBelow1.25"])}
          </p>
          <div>
            <CashChart sim={sim} />
            <p className="text-xs text-foreground/50">
              Line: median cash by month across {sim.nDraws.toLocaleString("en-US")} draws. {sim.monthlyBands ? "Shaded: P10 to P90 band." : "The service returned the median path only, so no month-by-month band is drawn; the whiskers at the end show the P5/P50/P95 of ending cash."}
            </p>
          </div>
          <BreakEven sim={sim} />
          <p className="text-xs text-foreground/55">Loan terms are assumptions ({sim.loan.name ?? "assumed"}): principal {usd(sim.loan.principal)}, payment {usd(sim.loan.monthlyPayment)}/month. {sim.limits.join(" ")}</p>
          {cur?.ledger && (
            <div data-testid="ledger">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-medium">Ledger</h3>
                <span className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-background">SIMULATED</span>
                <span className="text-xs text-foreground/55">{cur.ledger.backend}; nothing was sent to Capital One.</span>
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                {["deposits", "purchases", "bills"].map((t) => (
                  <button key={t} type="button" aria-pressed={table === t} onClick={() => void pick(t)} className={`rounded-full px-2.5 py-0.5 ${table === t ? "bg-foreground text-background" : "border border-foreground/20"}`}>{t}</button>
                ))}
                <span className="self-center text-foreground/50">{cur.ledger.total} records, first {cur.ledger.records.length}</span>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="text-foreground/50"><th className="py-1 pr-3">Date</th><th className="pr-3">Description</th><th className="pr-3 text-right">Amount</th><th>Tag</th></tr></thead>
                  <tbody>
                    {cur.ledger.records.map((r, i) => (
                      <tr key={i} className="border-t border-foreground/10">
                        <td className="py-1 pr-3 tabular-nums">{String(r.transaction_date ?? r.purchase_date ?? r.payment_date ?? "")}</td>
                        <td className="pr-3">{String(r.description ?? r.nickname ?? "")}</td>
                        <td className="pr-3 text-right tabular-nums">{usd(Number(r.amount ?? r.payment_amount))}</td>
                        <td><span className="rounded bg-accent/15 px-1.5 text-accent">SIMULATED</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-xs text-foreground/45">{sim.notice}</p>
        </div>
      )}
    </section>
  );
}
