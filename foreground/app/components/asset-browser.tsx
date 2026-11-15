"use client";

import { useState } from "react";
import {
  AssetApiError, axisRange, CATEGORIES, fmtM, makeVariant, patchAsset, priceFor, VARIANT_KINDS, VARIANT_LABEL,
  type Asset, type AssetCategory, type VariantKind,
} from "../lib/assets";
import { defaultControls, variantParams, type Controls } from "../lib/variant-params";
import type { CostLineItem } from "../lib/costs";
import { AssetFacts, DraftBadge, FootprintSvg } from "./asset-bits";

type Props = {
  assets: Asset[];
  profileId: string | null;
  status: "loading" | "ok" | "error";
  error: string;
  category: AssetCategory | "";
  onCategory: (c: AssetCategory | "") => void;
  lines: CostLineItem[];
  /** Omit to browse without a layout to add to (the Profile page): the add buttons are then hidden. */
  onAdd?: (asset: Asset) => void;
  onSaved: (asset: Asset) => void;
};

export default function AssetBrowser({ assets, profileId, status, error, category, onCategory, lines, onAdd, onSaved }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = assets.find((a) => a.assetId === selectedId) ?? null;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-[3fr_2fr]">
      <div>
        <label className="text-sm">
          Category{" "}
          <select value={category} onChange={(e) => onCategory(e.target.value as AssetCategory | "")} className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm">
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
          </select>
        </label>
        {status === "loading" && <p role="status" className="mt-3 text-sm text-foreground/60">Loading the asset catalog.</p>}
        {status === "error" && <p role="alert" className="mt-3 text-sm">Could not load assets: {error}</p>}
        {status === "ok" && assets.length === 0 && <p className="mt-3 text-sm text-foreground/60">No assets in this category.</p>}
        <ul className="mt-3 space-y-2" aria-label="Asset catalog">
          {assets.map((asset, i) => {
            const mine = !!profileId && asset.profileId === profileId;
            const firstLibrary = !mine && (i === 0 || (!!profileId && assets[i - 1].profileId === profileId));
            const price = priceFor(asset, lines);
            return (
              <li key={asset.assetId}>
                {(i === 0 && mine) && <p className="mb-1 text-xs font-medium text-foreground/60">This profile&apos;s assets</p>}
                {firstLibrary && <p className="mb-1 mt-3 text-xs font-medium text-foreground/60">Library</p>}
                <div className={`flex gap-3 rounded-lg border p-2 ${selectedId === asset.assetId ? "border-match" : "border-foreground/15"}`}>
                  <FootprintSvg asset={asset} size={72} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      {asset.name}
                      {asset.status === "draft" && <DraftBadge />}
                      <span className="text-xs font-normal text-foreground/50">{asset.category.replace("_", " ")} · {asset.source}{asset.variantKind && asset.variantKind !== "base" ? ` · ${VARIANT_LABEL[asset.variantKind]}` : ""}</span>
                    </p>
                    <AssetFacts asset={asset} />
                    <p className="mt-1 text-xs">Price: <span className={price.kind === "none" ? "text-foreground/60" : "font-medium"}>{price.text}</span></p>
                    <div className="mt-2 flex gap-2">
                      {onAdd && <button type="button" onClick={() => onAdd(asset)} className="rounded-full bg-foreground px-3 py-1 text-xs text-background">Add to layout</button>}
                      <button type="button" onClick={() => setSelectedId(asset.assetId === selectedId ? null : asset.assetId)} className="rounded-full border border-foreground/25 px-3 py-1 text-xs" aria-pressed={selectedId === asset.assetId}>
                        Variants
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <VariantGenerator key={selected?.assetId ?? "none"} asset={selected} profileId={profileId} onAdd={onAdd} onSaved={onSaved} />
    </div>
  );
}

function VariantGenerator({ asset, profileId, onAdd, onSaved }: { asset: Asset | null; profileId: string | null; onAdd?: (a: Asset) => void; onSaved: (a: Asset) => void }) {
  const [kind, setKind] = useState<Exclude<VariantKind, "base">>("corner_l");
  const [size, setSize] = useState<Controls>(() => (asset ? defaultControls(asset) : { w: 0, d: 0, h: 0, armA: 0, armB: 0, depthA: 0, depthB: 0, length: 0 }));
  const [skuIndex, setSkuIndex] = useState(0);
  const [result, setResult] = useState<Asset | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!asset) {
    return <aside className="rounded-lg border border-dashed border-foreground/25 p-3 text-sm text-foreground/60">Pick &ldquo;Variants&rdquo; on an asset to generate a corner L, island, wall run, scaled or mirrored version.</aside>;
  }
  const skus = asset.allowedSizes && asset.allowedSizes.length > 0 ? asset.allowedSizes : null;
  const fields: { key: keyof Controls; label: string; range: [number, number] | null }[] = kind === "corner_l"
    ? [{ key: "armA", label: "Arm A length", range: null }, { key: "armB", label: "Arm B length", range: null },
       { key: "depthA", label: "Arm A depth", range: null }, { key: "depthB", label: "Arm B depth", range: null }]
    : kind === "wall_run" ? [{ key: "length", label: "Length", range: axisRange(asset, "w") }]
    : kind === "scaled" ? [{ key: "w", label: "Length", range: axisRange(asset, "w") }, { key: "d", label: "Depth", range: axisRange(asset, "d") }, { key: "h", label: "Height", range: axisRange(asset, "h") }]
    : [];

  async function generate() {
    if (!asset) return;
    setBusy(true);
    setMessage("");
    try {
      const params = variantParams(kind, asset, size, skuIndex);
      setResult(await makeVariant(asset.assetId, kind, params, profileId));
    } catch (e) {
      setResult(null);
      setMessage(e instanceof AssetApiError ? e.message : "Could not generate the variant.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result) return;
    setBusy(true);
    try {
      // The service already stored the variant as a draft when it was generated; confirm that record, do not create it again.
      const saved = await patchAsset(result.assetId, { status: "confirmed" });
      setResult(saved);
      onSaved(saved);
      setMessage(`Saved ${saved.name} to the catalog.`);
    } catch (e) {
      setMessage(e instanceof AssetApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rounded-lg border border-foreground/15 p-3 text-sm" aria-label="Variant generator">
      <h3 className="font-medium">Variants of {asset.name}</h3>
      <label className="mt-2 block">Kind{" "}
        <select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setResult(null); setMessage(""); }} className="rounded border border-foreground/20 bg-background px-2 py-1">
          {VARIANT_KINDS.map((k) => <option key={k} value={k}>{VARIANT_LABEL[k]}</option>)}
        </select>
      </label>
      {skus && kind === "scaled" && (
        <label className="mt-2 block">Size (discrete SKUs only){" "}
          <select value={skuIndex} onChange={(e) => setSkuIndex(Number(e.target.value))} className="rounded border border-foreground/20 bg-background px-2 py-1">
            {skus.map((s, i) => <option key={s.label} value={i}>{s.label}: {fmtM(s.w)} x {fmtM(s.d)}</option>)}
          </select>
        </label>
      )}
      {skus && kind === "wall_run" && <p className="mt-2 text-xs text-foreground/60">This item only exists in fixed SKUs, so size is not adjustable here.</p>}
      {(!skus || kind === "corner_l") && fields.map(({ key, label, range }) => {
        const locked = !!range && range[0] === range[1];
        return (
          <label key={key} className="mt-2 block">
            {label} (m)
            {range ? <span className="text-xs text-foreground/55"> allowed {range[0]} to {range[1]}</span> : <span className="text-xs text-foreground/55"> no stated range; the service may refuse</span>}
            <input type="number" step={0.05} min={range?.[0]} max={range?.[1]} value={size[key]} disabled={locked}
              onChange={(e) => setSize((s) => ({ ...s, [key]: Number(e.target.value) }))}
              className="ml-2 w-24 rounded border border-foreground/20 bg-background px-2 py-1" />
          </label>
        );
      })}
      <div className="mt-3"><button type="button" onClick={generate} disabled={busy} className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background disabled:opacity-50">Generate {VARIANT_LABEL[kind]}</button></div>
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
      {result && (
        <div className="mt-3 border-t border-foreground/10 pt-3">
          <div className="flex gap-3"><FootprintSvg asset={result} size={110} />
            <div><p className="font-medium">{result.name}</p><AssetFacts asset={result} /></div></div>
          <p className="mt-2 text-xs text-foreground/60">{result.provenance.notes}</p>
          <div className="mt-2 flex gap-2">
            {onAdd && <button type="button" onClick={() => onAdd(result)} className="rounded-full bg-foreground px-3 py-1 text-xs text-background">Add to layout</button>}
            <button type="button" onClick={save} disabled={busy} className="rounded-full border border-foreground/25 px-3 py-1 text-xs disabled:opacity-50">Save to catalog</button>
          </div>
        </div>
      )}
    </aside>
  );
}
