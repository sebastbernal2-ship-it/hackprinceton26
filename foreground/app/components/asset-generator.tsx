"use client";

import { useState } from "react";
import { AssetApiError, assetImageUrl, fmtDims, generateAsset, type Asset, type GenerateResult } from "../lib/assets";
import { DimsBadge } from "./asset-bits";

const EXAMPLES = ["espresso machine", "pastry display case", "round marble table"];

/** Type or pick an item; the server drafts a catalog entry (rules-table size, clearance, estimated price ref) with an illustration. */
export default function AssetGenerator({ onCreated, compact = false }: { onCreated: (asset: Asset) => void; compact?: boolean }) {
  const [text, setText] = useState("");
  const [useImage, setUseImage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function run(prompt: string) {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setError("");
    try {
      const out = await generateAsset(p, useImage);
      setResult(out);
      setText("");
      onCreated(out.asset);
    } catch (e) {
      setResult(null);
      setError(e instanceof AssetApiError ? e.message : "Could not generate the asset.");
    } finally {
      setBusy(false);
    }
  }

  const img = result ? assetImageUrl(result.asset) : null;
  return (
    <section aria-label="Generate asset" data-testid="asset-generator" className="rounded-xl border border-foreground/15 bg-background p-3">
      <h3 className="text-sm font-medium">Generate asset</h3>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="e.g. espresso machine" aria-label="Item to generate"
          className="min-w-0 flex-1 rounded-lg border border-foreground/20 bg-background px-2 py-1 text-sm" />
        <button type="submit" disabled={busy || text.trim().length < 3} className="rounded-full bg-foreground px-3 py-1 text-xs text-background disabled:opacity-40">
          {busy ? "Generating..." : "Generate"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {EXAMPLES.map((x) => (
          <button key={x} type="button" disabled={busy} onClick={() => void run(x)} className="rounded-full border border-foreground/20 px-2 py-0.5 text-[11px] disabled:opacity-40">{x}</button>
        ))}
      </div>
      {!compact && (
        <label className="mt-2 flex items-center gap-1.5 text-xs text-foreground/70">
          <input type="checkbox" checked={useImage} onChange={(e) => setUseImage(e.target.checked)} /> Use the image model when the server has one (otherwise a local illustration)
        </label>
      )}
      {busy && <p role="status" className="mt-2 text-xs text-foreground/60">Drafting the asset{useImage ? " (an image model call can take a few seconds)" : ""}.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-accent" data-testid="generate-error">{error}</p>}
      {result && !busy && (
        <div className={`mt-2 flex gap-2 text-xs ${compact ? "flex-col" : ""}`} data-testid="generate-result">
          {img && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt={`Illustration of ${result.asset.name}`} className="h-16 w-16 shrink-0 rounded border border-foreground/15 object-cover" />}
          <div className="min-w-0">
            <p className="truncate font-medium" title={result.asset.name}>{result.asset.name} added as a draft</p>
            <p className="text-foreground/70">{fmtDims(result.asset.dims)} <DimsBadge status={result.asset.dimsStatus} /> · {result.imageMode === "openai" ? "image model illustration" : "local illustration"}</p>
            <p className="text-foreground/60">{result.priceNote}</p>
            {result.notice && <p role="status" className="text-foreground/80" data-testid="generate-notice">{result.notice}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
