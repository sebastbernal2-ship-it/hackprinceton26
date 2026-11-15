"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { packAssets, frontZone } from "../lib/asset-layout";
import { bbox, listAssets, orderAssets, priceFor, type Asset, type AssetCategory } from "../lib/assets";
import { conceptFootprint } from "../lib/concept-layout";
import type { CostLineItem } from "../lib/costs";
import type { FloorLayout } from "../lib/floor-layout";
import type { Match } from "../lib/matches";
import type { TourKind } from "../lib/tour-agent";
import type { StagedPiece } from "../lib/tour-scene";
import AssetBrowser from "./asset-browser";
import AssetUpload from "./asset-upload";

const ForegroundTour = dynamic(() => import("./foreground-tour"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-foreground/60">Loading 3D view.</p>,
});

type Trace =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; layout: FloorLayout }
  | { status: "notConfigured"; message: string }
  | { status: "failed"; message: string };


const KIND: Partial<Record<Asset["category"], TourKind>> = { seating: "chair", table: "table", prep_table: "table" };
const CAFE_ASSET_IDS = ["espresso_machine_2group", "coffee_grinder_on_demand", "drip_brewer_station", "bakery_display_case_48", "convection_oven_full", "bake_rack_speed_rack", "bakery_work_table_72"];

function cafeRoom(item: Asset, rooms: FloorLayout["rooms"]): string {
  const active = rooms.filter((room) => !room.absorbed);
  const diningItem = item.category === "seating" || item.category === "table";
  const chosen = diningItem
    ? active.find((room) => room.kind === "dining")
    : active.find((room) => room.kind === "kitchen") ?? active.find((room) => room.kind === "dining");
  return chosen?.label ?? [...active].sort((a, b) => b.w * b.d - a.w * a.d)[0]?.label ?? "";
}

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
    listAssets({ profileId, category })
      .then((assets) => live && setCatalog({ status: "ok", assets: orderAssets(assets, profileId), error: "" }))
      .catch((e: unknown) => live && setCatalog({ status: "error", assets: [], error: e instanceof Error ? e.message : "failed" }));
    return () => { live = false; };
  }, [profileId, category, reload]);

  const assumedArea = match.demo ? Number(area) || 0 : 0;
  const sqft = match.demo ? assumedArea : match.squareFeet;
  const footprint = useMemo(() => conceptFootprint(sqft), [sqft]);
  const result = useMemo(() => (footprint ? packAssets(footprint, items, respect) : null), [footprint, items, respect]);

  async function traceFloorplan() {
    setTrace({ status: "loading" });
    try {
      const response = await fetch("/api/layout-analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: match.tourId, squareFeet: sqft }),
      });
      const body = (await response.json().catch(() => ({}))) as { layout?: FloorLayout | null; error?: string };
      if (response.status === 501) setTrace({ status: "notConfigured", message: body.error ?? "Floorplan tracing is not configured." });
      else if (!response.ok || !body.layout) setTrace({ status: "failed", message: body.error ?? `The tracer answered ${response.status}.` });
      else setTrace({ status: "ok", layout: body.layout });
    } catch {
      setTrace({ status: "failed", message: "The layout service is unreachable." });
    }
  }

  async function loadCafeKit() {
    try {
      const assets = await listAssets();
      const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
      const kit = CAFE_ASSET_IDS.flatMap((id) => {
        const asset = byId.get(id);
        return asset ? [asset] : [];
      });
      setItems(kit);
      setCategory("");
      setProfileDraft("coffee_bakery");
      setProfileId("coffee_bakery");
      if (kit.length !== CAFE_ASSET_IDS.length) {
        setTrace({ status: "failed", message: `Cafe reference kit is incomplete: found ${kit.length} of ${CAFE_ASSET_IDS.length} catalog assets.` });
      }
    } catch (error) {
      setTrace({ status: "failed", message: error instanceof Error ? error.message : "Could not load the cafe reference kit." });
    }
  }

  const traced = trace.status === "ok" ? trace.layout : null;
  const tracedPieces: StagedPiece[] = useMemo(() => {
    if (!traced) return [];
    return items.map((item, index) => {
      const b = bbox(item.footprint);
      return {
        id: `${item.assetId}-${index}`,
        kind: KIND[item.category] ?? "counter",
        label: item.name,
        tagId: null,
        position: { x: 0, y: 0, z: 0 },
        stem: { x: 0, y: 0, z: 0 },
        screen: { x: 0, y: 0 },
        width: b.x1 - b.x0,
        depth: b.y1 - b.y0,
        room: cafeRoom(item, traced.rooms),
      };
    });
  }, [traced, items]);

  const priced = items.map((item) => priceFor(item, lines));
  const withPrice = priced.filter((p) => p.kind === "line").length;

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="layout-title">
      <p className="text-xs text-foreground/50">Step 4 · Project layout</p>
      <h2 id="layout-title" className="text-lg font-medium tracking-tight">Layout and equipment placement</h2>
      <p role="note" className="mt-2 rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2 text-sm font-medium">
        The default floor is an assumed rectangle from the listed area, or from the area you enter for a demo scan. Matterport tracing can show estimated room outlines when the scan
        and server keys are available. Catalog pieces are illustrative; this view does not check fit, code, utilities, or workflow.
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

      <div className="mt-6">
        <button
          type="button"
          onClick={traceFloorplan}
          disabled={trace.status === "loading"}
          className="rounded-full border border-foreground/20 px-4 py-2 text-sm transition-opacity hover:opacity-70 disabled:opacity-50"
        >
          {trace.status === "loading" ? "Tracing floorplan." : "Trace Matterport rooms in 3D"}
        </button>
        <p className="mt-2 text-xs text-foreground/50">
          Needs Matterport and Gemini server keys. A vision model estimates room outlines from the floorplan image; placements are assigned by room type and are not fit-checked or survey measurements.
        </p>
        {trace.status === "notConfigured" && <p role="status" className="mt-2 text-sm">Not configured: {trace.message} Showing the concept placement only.</p>}
        {trace.status === "failed" && <p role="alert" className="mt-2 text-sm">Could not trace: {trace.message}</p>}
        {traced && (
          <div className="mt-4 h-[28rem] overflow-hidden rounded-lg border border-foreground/15">
            <ForegroundTour title={match.address} detail={match.detail} squareFeet={sqft} layout={traced} pieces={tracedPieces} />
          </div>
        )}
      </div>
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
