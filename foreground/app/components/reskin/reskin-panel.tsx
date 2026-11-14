"use client";

import { useEffect, useState } from "react";
import { listAssets } from "../../lib/assets";
import { fetchConcepts, postReskin, type Concept, type ReskinResult } from "../../lib/reskin";
import ReskinResultView from "./reskin-result";

/** Run a reskin and keep the result; shared by this panel and the Imagine flow. */
export function useReskin(listingId: number) {
  const [state, setState] = useState<{ busy: boolean; result: ReskinResult | null; error: string | null }>({ busy: false, result: null, error: null });
  const [dims, setDims] = useState<Record<string, { w: number; d: number }>>({});
  async function run(from: string, to: string) {
    setState({ busy: true, result: null, error: null });
    try {
      const [result, assets] = await Promise.all([postReskin(listingId, from, to), listAssets().catch(() => [])]);
      setDims(Object.fromEntries(assets.map((a) => [a.assetId, { w: a.dims.w, d: a.dims.d }])));
      setState({ busy: false, result, error: null });
      return result;
    } catch (e) {
      setState({ busy: false, result: null, error: (e as Error).message });
      return null;
    }
  }
  return { ...state, dims, run };
}

export default function ReskinPanel({ listingId }: { listingId: number }) {
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [from, setFrom] = useState("italian");
  const [to, setTo] = useState("indian");
  const r = useReskin(listingId);

  useEffect(() => {
    let live = true;
    fetchConcepts().then((c) => live && setConcepts(c), () => live && setUnavailable(true));
    return () => { live = false; };
  }, []);

  const names = Object.fromEntries((concepts ?? []).map((c) => [c.id, c.name]));
  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="reskin-title">
      <h2 id="reskin-title" className="text-lg font-medium tracking-tight">Reskin the concept</h2>
      <p className="mt-1 text-sm text-foreground/50">
        Swap the kitchen and finishes from one cuisine concept to another. Concept profiles are labelled assumptions; the space&apos;s real layout is not known to this tool.
      </p>
      {unavailable && <p className="mt-3 text-sm text-foreground/50" role="status">The concept service is not available (GET /api/concepts failed), so reskin is off.</p>}
      {!unavailable && !concepts && <p className="mt-3 text-sm text-foreground/50">Loading concepts.</p>}
      {concepts && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs text-foreground/50">Current concept
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground">
                {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <span className="pb-2 text-foreground/40" aria-hidden>to</span>
          </div>
          <div role="radiogroup" aria-label="Target concept" className="mt-3 flex flex-wrap gap-2">
            {concepts.filter((c) => c.id !== from).map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={to === c.id} onClick={() => setTo(c.id)}
                className={`rounded-full border px-4 py-2 text-sm ${to === c.id ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:bg-foreground/5"}`}>
                {c.name}<span className="ml-1.5 text-xs opacity-60">{c.equipmentCount} items</span>
              </button>
            ))}
          </div>
          <button type="button" disabled={r.busy || from === to} onClick={() => r.run(from, to)}
            className="mt-4 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-40">
            {r.busy ? "Planning." : `Turn ${names[from] ?? from} into ${names[to] ?? to}`}
          </button>
        </>
      )}
      {r.error && <p className="mt-3 text-sm text-accent" role="alert">{r.error}</p>}
      {r.result && <ReskinResultView result={r.result} dims={r.dims} />}
    </section>
  );
}
