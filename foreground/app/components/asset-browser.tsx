"use client";

import { Fragment, useState } from "react";
import {
  AssetApiError, assetImageUrl, axisRange, CATEGORIES, fmtDims, groupOf, GROUP_LABEL, fmtM, makeVariant, patchAsset, priceFor, VARIANT_KINDS, VARIANT_LABEL,
  type Asset, type AssetCategory, type VariantKind,
} from "../lib/assets";
import { defaultControls, variantParams, type Controls } from "../lib/variant-params";
import type { CostLineItem } from "../lib/costs";
import AssetGenerator from "./asset-generator";
import { AssetFacts, DimsBadge, FootprintSvg } from "./asset-bits";
import AssetThumb from "./asset-thumb";

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
    <div className="mt-4">
      <div className="mb-4 max-w-xl"><AssetGenerator onCreated={onSaved} /></div>
      <label className="text-sm">
        Category{" "}
        <select value={category} onChange={(e) => onCategory(e.target.value as AssetCategory | "")} className="rounded border border-foreground/20 bg-background px-2 py-1 text-sm">
          <option value="">All</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
        </select>
      </label>
      <span className="ml-3 text-xs text-foreground/50">{assets.length} item{assets.length === 1 ? "" : "s"}</span>
      {status === "loading" && <p role="status" className="mt-3 text-sm text-foreground/60">Loading the asset catalog.</p>}
      {status === "error" && <p role="alert" className="mt-3 text-sm">Could not load assets: {error}</p>}
      {status === "ok" && assets.length === 0 && <p className="mt-3 text-sm text-foreground/60">No assets in this category.</p>}
      {selected && (
        <div className="mt-3">
          <VariantGenerator key={selected.assetId} asset={selected} profileId={profileId} onAdd={onAdd} onSaved={onSaved} />
        </div>
      )}
      <ul className="mt-3 grid max-h-[40rem] grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" aria-label="Asset catalog">
        {assets.map((asset, i) => {
          const group = groupOf(asset, profileId);
          const header = i === 0 || groupOf(assets[i - 1], profileId) !== group;
          const img = assetImageUrl(asset);
          const price = priceFor(asset, lines);
          const open = selectedId === asset.assetId;
          return (
            <Fragment key={asset.assetId}>
              {header && <li className={`col-span-full text-xs font-medium text-foreground/60 ${i ? "mt-2" : ""}`}>{GROUP_LABEL[group].replace("'", "\u2019")}</li>}
              <li className={`flex min-w-0 flex-col rounded-xl border p-3 ${open ? "border-match" : "border-foreground/15"}`}>
                <div className="flex h-28 items-center justify-center gap-2 overflow-hidden">
                  {img ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt={`Illustration of ${asset.name}`} className="h-24 w-24 rounded border border-foreground/15 object-cover" /> : <AssetThumb asset={asset} size={88} />}
                  <FootprintSvg asset={asset} size={40} maxHeight={56} />
                </div>
                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug" title={asset.name}>{asset.name}</p>
                <p className="mt-0.5 text-xs text-foreground/50">
                  {asset.category.replace("_", " ")}{asset.status === "draft" ? " · draft" : ""}{asset.variantKind && asset.variantKind !== "base" ? ` · ${VARIANT_LABEL[asset.variantKind]}` : ""}
                </p>
                <p className="mt-1 text-xs text-foreground/75">{fmtDims(asset.dims)} <DimsBadge status={asset.dimsStatus} /></p>
                <p className="mt-1 text-xs">Price: <span className={price.kind === "none" ? "text-foreground/50" : "font-medium"}>
                  {price.kind === "none" && asset.source === "generated" && asset.priceRef ? `Estimated demo price, priced as ${asset.priceRef.replace(/_/g, " ")}; see the Planner tray` : price.text}</span></p>
                <details className="mt-1 text-xs text-foreground/60">
                  <summary className="cursor-pointer">Details</summary>
                  <AssetFacts asset={asset} />
                </details>
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  {onAdd && <button type="button" onClick={() => onAdd(asset)} className="rounded-full bg-foreground px-3 py-1 text-xs text-background">Add</button>}
                  <button type="button" onClick={() => setSelectedId(open ? null : asset.assetId)} className="rounded-full border border-foreground/25 px-3 py-1 text-xs" aria-pressed={open}>
                    Variants
                  </button>
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
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
