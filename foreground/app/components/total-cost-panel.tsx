"use client";

import { useEffect, useState } from "react";
import { fetchTotalCost, range, type TotalCost } from "../lib/total-cost";

const TONE: Record<string, string> = {
  observed: "bg-match-soft text-match",
  estimated: "border border-dashed border-foreground/30 text-foreground/70",
  derived: "border border-foreground/20 text-foreground/60",
  assumption: "border border-foreground/20 text-foreground/60",
};

/**
 * Total cost for the first months: build-out + operating + rent, each from its own labelled source. The owner enters the
 * square feet to lease (CoStar gives only the building size) and picks a rent rate; unknown parts stay out of the total.
 * onRent hands the monthly rent to the 36-month scenario.
 */
export default function TotalCostPanel({ listingId, onRent }: { listingId: number; onRent?: (monthly: number | null) => void }) {
  const [sqft, setSqft] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [ownRate, setOwnRate] = useState("");
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<TotalCost | null>(null);
  const [failed, setFailed] = useState(false);

  const area = Number(sqft) > 0 ? Number(sqft) : null;
  const rate = source === "own" && Number(ownRate) > 0 ? Number(ownRate) : null;

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      fetchTotalCost(listingId, { sqft: area, rent: rate, rentSource: source === "own" ? null : source, months }).then(
        (d) => { if (!live) return; setData(d); setFailed(false); const r = d.parts.find((p) => p.id === "rent"); onRent?.(r ? r.low : null); },
        () => live && setFailed(true),
      );
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [listingId, area, rate, source, months, onRent]);

  const chosen = source ?? data?.rentChosen?.id ?? null;

  return (
    <section className="mt-8 rounded-[1.75rem] border border-foreground/15 p-6 sm:p-8" aria-labelledby="total-title" data-testid="total-cost">
      <h2 id="total-title" className="text-lg font-medium tracking-tight">Total cost</h2>
      <p className="mt-1 text-sm text-foreground/55">Build-out, running costs and rent for this space. Ranges, not quotes.</p>
      {failed && <p className="mt-4 text-sm text-foreground/55">Cannot say: the cost service did not answer.</p>}

      <div className="mt-5 flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="block text-foreground/55">Square feet you would lease</span>
          <input type="number" min={1} inputMode="numeric" value={sqft} onChange={(e) => setSqft(e.target.value)}
            placeholder={data?.buildingSquareFeet ? `building is ${Math.round(data.buildingSquareFeet).toLocaleString()}` : "e.g. 2500"}
            className="mt-1 w-56 rounded-lg border border-foreground/20 bg-background px-3 py-2 tabular-nums" />
        </label>
        <label className="text-sm">
          <span className="block text-foreground/55">Period</span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-1 rounded-lg border border-foreground/20 bg-background px-3 py-2">
            <option value={12}>First year</option><option value={24}>Two years</option><option value={36}>Three years</option>
          </select>
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm text-foreground/55">Rent rate</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(data?.rentOptions ?? []).map((o) => (
            <button key={o.id} type="button" onClick={() => setSource(o.id)} aria-pressed={chosen === o.id}
              className={`rounded-full border px-3 py-1.5 text-sm ${chosen === o.id ? "border-foreground bg-foreground text-background" : "border-foreground/20"}`}>
              {o.label}: ${o.rate}/sq ft/yr <span className="opacity-60">({o.status})</span>
            </button>
          ))}
          <button type="button" onClick={() => setSource("own")} aria-pressed={chosen === "own"}
            className={`rounded-full border px-3 py-1.5 text-sm ${chosen === "own" ? "border-foreground bg-foreground text-background" : "border-foreground/20"}`}>
            My own rate
          </button>
          {chosen === "own" && (
            <input type="number" min={1} value={ownRate} onChange={(e) => setOwnRate(e.target.value)} placeholder="$/sq ft/yr" aria-label="Your rent rate, dollars per square foot per year"
              className="w-32 rounded-lg border border-foreground/20 bg-background px-3 py-1.5 text-sm tabular-nums" />
          )}
        </div>
        {data?.rentChosen && chosen !== "own" && <p className="mt-2 text-xs text-foreground/45">{data.rentChosen.source}</p>}
      </fieldset>

      {data && (
        <>
          <table className="mt-6 w-full text-sm">
            <tbody>
              {data.parts.map((p) => (
                <tr key={p.id} className="border-t border-foreground/10 align-top">
                  <td className="py-3 pr-3">
                    {p.label}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[0.7rem] ${TONE[p.status] ?? ""}`}>{p.status}</span>
                    <p className="mt-1 text-xs text-foreground/45">{p.source}</p>
                  </td>
                  <td className="whitespace-nowrap py-3 text-right tabular-nums">
                    {range(p)}<span className="text-foreground/50">{p.basis === "monthly" ? " /mo" : ""}</span>
                  </td>
                </tr>
              ))}
              {data.excluded.map((e) => (
                <tr key={e.id} className="border-t border-foreground/10 text-foreground/55">
                  <td className="py-3 pr-3">{e.id === "rent" ? "Rent" : e.id} <span className="ml-2 rounded-full border border-foreground/15 px-2 py-0.5 text-[0.7rem]">unknown</span><p className="mt-1 text-xs">{e.reason}. Not counted, not zero.</p></td>
                  <td className="py-3 text-right">Unknown</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 grid gap-4 rounded-2xl bg-foreground/[0.04] p-5 sm:grid-cols-3">
            <div><p className="text-xs text-foreground/50">One-time</p><p className="mt-1 font-medium tabular-nums">{range(data.oneTime)}</p></div>
            <div><p className="text-xs text-foreground/50">Per month</p><p className="mt-1 font-medium tabular-nums">{range(data.monthly)}</p></div>
            <div>
              <p className="text-xs text-foreground/50">Total, {data.months === 12 ? "first year" : `${data.months / 12} years`}</p>
              <p className="mt-1 text-xl font-medium tracking-tight tabular-nums">{range(data.total)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-foreground/45">{data.totalStatus === "complete" ? "All parts known." : `Partial total: ${data.totalStatus.replace("partial: ", "")}.`} {data.notice}</p>
        </>
      )}
    </section>
  );
}
