"use client";

import { useEffect, useMemo, useState } from "react";
import { packAssets, frontZone } from "../lib/asset-layout";
import { GENERATED_PROFILE, listAssets, orderAssets, priceFor, type Asset, type AssetCategory } from "../lib/assets";
import { buildCafeKit, cafeKitArea, CAFE_KIT_NOTE, dedupeAssets } from "../lib/cafe-demo";
import { conceptFootprint } from "../lib/concept-layout";
import type { CostLineItem } from "../lib/costs";
import type { Match } from "../lib/matches";
import AssetBrowser from "./asset-browser";
import AssetUpload from "./asset-upload";

type Trace = { status: "idle" } | { status: "failed"; message: string };

type LayoutPanelProps = {
  match: Match;
  lines?: CostLineItem[];
  /** Placed pieces, owned by the parent so Quantify prices the same layout. */
  items: Asset[];
  onItems: (items: Asset[] | ((current: Asset[]) => Asset[])) => void;
  /** Demo scans have no listed area; the owner's assumed area (sq ft, as typed) is shared with Quantify. */
  area?: string;
  onArea?: (v: string) => void;
};

export default function LayoutPanel({ match, lines = [], items, onItems: setItems, area, onArea }: LayoutPanelProps) {
  const [trace, setTrace] = useState<Trace>({ status: "idle" });
  const [profileDraft, setProfileDraft] = useState("fruity-yogurt");
  const [profileId, setProfileId] = useState<string | null>("fruity-yogurt");
  const [category, setCategory] = useState<AssetCategory | "">("");
  const [catalog, setCatalog] = useState<{ status: "loading" | "ok" | "error"; assets: Asset[]; error: string }>({ status: "loading", assets: [], error: "" });
  const [reload, setReload] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [respect, setRespect] = useState(true);

  useEffect(() => {
    let live = true;
    // Generated assets live in their own profile; always list them beside the chosen profile and the library.
    Promise.all([listAssets({ profileId, category }), profileId === GENERATED_PROFILE ? [] : listAssets({ profileId: GENERATED_PROFILE, category })])
      .then(([own, gen]) => [...own, ...gen])
      .then((assets) => live && setCatalog({ status: "ok", assets: orderAssets([...dedupeAssets(assets).values()], profileId), error: "" }))
      .catch((e: unknown) => live && setCatalog({ status: "error", assets: [], error: e instanceof Error ? e.message : "failed" }));
    return () => { live = false; };
  }, [profileId, category, reload]);

  const assumedArea = match.demo ? Number(area) || 0 : 0;
  const sqft = match.demo ? assumedArea : match.squareFeet;
  const footprint = useMemo(() => conceptFootprint(sqft), [sqft]);
  const result = useMemo(() => (footprint ? packAssets(footprint, items, respect) : null), [footprint, items, respect]);

  async function loadCafeKit() {
    try {
      const assets = await listAssets();
      const { kit, missing } = buildCafeKit(match.tourId, assets);
      setItems(kit);
      if (!Number(area)) onArea?.(cafeKitArea(match.tourId));
      setCategory("");
      setProfileDraft("coffee_bakery");
      setProfileId("coffee_bakery");
      if (missing.length) setTrace({ status: "failed", message: `Cafe reference kit is incomplete: missing ${missing.join(", ")}.` });
    } catch (error) {
      setTrace({ status: "failed", message: error instanceof Error ? error.message : "Could not load the cafe reference kit." });
    }
  }

  const priced = items.map((item) => priceFor(item, lines));
  const withPrice = priced.filter((p) => p.kind === "line").length;

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="layout-title">
      <p className="text-xs text-foreground/50">Step 4 · Project layout</p>
      <h2 id="layout-title" className="text-lg font-medium tracking-tight">Layout and equipment placement</h2>
      <p role="note" className="mt-2 rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2 text-sm font-medium">
        The default floor is an assumed rectangle from the listed area, or from the area you enter for a demo scan. Catalog pieces are illustrative; this view does not check fit, code, utilities, or workflow.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); setProfileId(profileDraft.trim() || null); }}>
          <label>Profile (chain or brand id){" "}
            <input value={profileDraft} onChange={(e) => setProfileDraft(e.target.value)} placeholder="optional" className="rounded border border-foreground/20 bg-background px-2 py-1" />
          </label>
          <button type="submit" className="rounded-full border border-foreground/25 px-3 py-1">Use</button>
        </form>
        <button type="button" onClick={() => setUploading(true)} className="rounded-full bg-foreground px-4 py-1.5 text-sm text-background">Add equipment from photos</button>
        <button type="button" onClick={() => void loadCafeKit()} className="rounded-full border border-foreground/25 px-4 py-1.5 text-sm">Load cafe reference kit</button>
        {match.demo && <span className="text-xs text-foreground/60" data-testid="kit-note">{CAFE_KIT_NOTE}</span>}
        {profileId && <span className="text-xs text-foreground/60">Profile assets are listed first.</span>}
      </div>
      <p className="mt-2 text-xs text-foreground/55">Upload a photo of a piece of equipment to create a draft catalog entry; review its suggested details before saving.</p>
      <AssetBrowser
        assets={catalog.assets} profileId={profileId} status={catalog.status} error={catalog.error}
        category={category} onCategory={setCategory} lines={lines}
        onAdd={(asset) => setItems((current) => [...current, asset])}
        onSaved={() => setReload((n) => n + 1)}
      />
      {uploading && <AssetUpload profileId={profileId} onClose={() => setUploading(false)} onConfirmed={() => setReload((n) => n + 1)} />}

      {match.demo && onArea && (
        <label className="mt-6 block text-sm" data-testid="assumed-area">
          <span className="block text-foreground/55">Area to lay out (sq ft)</span>
          <input type="number" min={1} inputMode="numeric" value={area ?? ""} onChange={(e) => onArea(e.target.value)} placeholder="e.g. 1200"
            className="mt-1 w-40 rounded-lg border border-foreground/20 bg-background px-3 py-2 tabular-nums" />
          <span className="mt-1 block max-w-md text-xs text-foreground/50">This scan is not a listing, so no area is on file. Enter an area you would plan for; it is your assumption, not a measured or leased size, and the same value feeds Quantify.</span>
        </label>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <h3 className="font-medium">Placement</h3>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={respect} onChange={(e) => setRespect(e.target.checked)} /> Space pieces by their clearance assumptions</label>
        {items.length > 0 && <button type="button" onClick={() => setItems([])} className="px-2 text-foreground/55 underline">Clear</button>}
      </div>

      {!footprint || !result ? (
        <p className="mt-4 text-sm text-foreground/60">{match.demo ? "Cannot say: enter the area you want to lay out above. No area is on file for this scan." : "Cannot say: this listing has no usable square footage."}</p>
      ) : (
        <div className="mt-3 grid gap-6 md:grid-cols-[2fr_1fr]">
          <figure>
            <svg
              viewBox={`-0.3 -0.3 ${footprint.width + 0.6} ${footprint.depth + 0.6}`}
              role="img"
              aria-label={`Concept floor, ${footprint.width.toFixed(1)} by ${footprint.depth.toFixed(1)} meters, ${result.placed.length} pieces placed, ${result.issues.length} problems found`}
              className="w-full rounded-lg border border-foreground/15 bg-panel"
            >
              <rect x={0} y={0} width={footprint.width} height={footprint.depth} fill="none" stroke="currentColor" strokeWidth={0.06} strokeDasharray="0.3 0.2" opacity={0.5} />
              {result.placed.map((piece) => {
                const z = piece.asset.clearance.front > 0 ? frontZone(piece) : null;
                return (
                  <g key={piece.key}>
                    {z && <polygon points={z.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={0.03} strokeDasharray="0.12 0.08" opacity={0.4} />}
                    <polygon points={piece.poly.map(([x, y]) => `${x},${y}`).join(" ")} className="fill-match-soft stroke-match" strokeWidth={0.04} />
                    <text x={(piece.box.x0 + piece.box.x1) / 2} y={(piece.box.y0 + piece.box.y1) / 2} fontSize={0.35} textAnchor="middle" dominantBaseline="middle" className="fill-foreground">
                      {Number(piece.key.slice(piece.key.lastIndexOf("-") + 1)) + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            <figcaption className="mt-2 text-xs text-foreground/50">
              Assumed {footprint.width.toFixed(1)} m x {footprint.depth.toFixed(1)} rectangle ({Math.round(sqft).toLocaleString("en-US")} sq ft {match.demo ? "assumed by you" : "listed"}, 3:2 shape); catalog footprints and clearances are illustrative.
            </figcaption>
          </figure>
          <div className="text-sm">
            <dl className="space-y-2">
              <Row label="Pieces placed" value={`${result.placed.length} of ${items.length}`} />
              <Row label="Problems found" value={String(result.issues.length)} />
              {!match.demo && <Row label="Priced from costs" value={`${withPrice} of ${items.length}`} />}
            </dl>
            {result.issues.length > 0 && (
              <ul role="alert" className="mt-3 list-disc space-y-1 pl-4 text-foreground/80">
                {result.issues.map((issue, i) => <li key={i}>{issue.message}</li>)}
              </ul>
            )}
            {result.unplaced.length > 0 && (
              <div className="mt-3 text-foreground/70">
                <p>Does not fit:</p>
                <ul className="list-disc pl-4">{result.unplaced.map((u, i) => <li key={i}>{u.asset.name}: {u.reason}.</li>)}</ul>
              </div>
            )}
            {items.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs" aria-label="Pieces in this layout">
                {items.map((item, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{i + 1}. {item.name}{item.status === "draft" ? " (draft)" : ""}{match.demo ? "" : `: ${priced[i].text}`}</span>
                    <button type="button" onClick={() => setItems((c) => c.filter((_, j) => j !== i))} aria-label={`Remove ${item.name}`} className="text-foreground/55 underline">remove</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-foreground/55">{match.demo ? "No total is shown here. Open Quantify (Scope out your vision, then continue) to price these pieces; unpriced ones are listed there." : "No total is shown. Prices appear only where a piece links to a line in this property's costs."}</p>
            {items.length === 0 && <p className="mt-3 text-foreground/55">Add a piece from the catalog to see it placed.</p>}
          </div>
        </div>
      )}

      {trace.status === "failed" && <p role="alert" className="mt-6 text-sm">{trace.message}</p>}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-foreground/55">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
