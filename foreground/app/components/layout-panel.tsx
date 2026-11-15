"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { conceptFootprint, packConcept } from "../lib/concept-layout";
import type { FloorLayout } from "../lib/floor-layout";
import { CATALOG, customItem, type CatalogItem } from "../lib/layout-catalog";
import type { Match } from "../lib/matches";
import type { StagedPiece } from "../lib/tour-scene";

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

const SQM_TO_SQFT = 10.7639;

export default function LayoutPanel({ match }: { match: Match }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [custom, setCustom] = useState("");
  const [trace, setTrace] = useState<Trace>({ status: "idle" });

  const footprint = useMemo(() => conceptFootprint(match.squareFeet), [match.squareFeet]);
  const result = useMemo(() => (footprint ? packConcept(footprint, items) : null), [footprint, items]);

  async function traceFloorplan() {
    setTrace({ status: "loading" });
    try {
      const response = await fetch("/api/layout-analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: match.tourId, squareFeet: match.squareFeet }),
      });
      const body = (await response.json().catch(() => ({}))) as { layout?: FloorLayout | null; error?: string };
      if (response.status === 501) setTrace({ status: "notConfigured", message: body.error ?? "Floorplan tracing is not configured." });
      else if (!response.ok || !body.layout) setTrace({ status: "failed", message: body.error ?? `The tracer answered ${response.status}.` });
      else setTrace({ status: "ok", layout: body.layout });
    } catch {
      setTrace({ status: "failed", message: "The layout service is unreachable." });
    }
  }

  const traced = trace.status === "ok" ? trace.layout : null;
  const tracedPieces: StagedPiece[] = useMemo(() => {
    if (!traced) return [];
    const room = [...traced.rooms].filter((r) => !r.absorbed).sort((a, b) => b.w * b.d - a.w * a.d)[0]?.label;
    return items.map((item, index) => ({
      id: `${item.id}-${index}`,
      kind: item.kind,
      label: item.label,
      tagId: null,
      position: { x: 0, y: 0, z: 0 },
      stem: { x: 0, y: 0, z: 0 },
      screen: { x: 0, y: 0 },
      width: item.width,
      depth: item.depth,
      room,
    }));
  }, [traced, items]);

  function addCustom() {
    const item = customItem(custom, "");
    if (!item) return;
    setItems((current) => [...current, item]);
    setCustom("");
  }

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="layout-title">
      <p className="text-xs text-foreground/50">Step 4 · Project layout</p>
      <h2 id="layout-title" className="text-lg font-medium tracking-tight">Layout and equipment placement</h2>
      <p role="note" className="mt-2 rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2 text-sm font-medium">
        Concept placement, not verified geometry. The floor below is a rectangle with the listed area; real walls, columns and
        doors are unknown, and piece sizes are assumed. Nothing here shows the pieces fit the real space.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Add equipment">
        {CATALOG.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setItems((current) => [...current, item])}
            className="rounded-full border border-foreground/20 px-3 py-1.5 text-sm transition-opacity hover:opacity-70"
          >
            + {item.label} <span className="text-foreground/45">{item.width} x {item.depth} m</span>
          </button>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addCustom();
          }}
        >
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Other piece, e.g. booth"
            aria-label="Other piece"
            className="rounded-full border border-foreground/20 bg-background px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-full bg-foreground px-3 py-1.5 text-sm text-background">Add</button>
        </form>
        {items.length > 0 && (
          <button type="button" onClick={() => setItems([])} className="px-2 text-sm text-foreground/55 underline">Clear</button>
        )}
      </div>

      {!footprint || !result ? (
        <p className="mt-4 text-sm text-foreground/60">Cannot say: this listing has no usable square footage.</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-[2fr_1fr]">
          <figure>
            <svg
              viewBox={`-0.3 -0.3 ${footprint.width + 0.6} ${footprint.depth + 0.6}`}
              role="img"
              aria-label={`Concept floor, ${footprint.width.toFixed(1)} by ${footprint.depth.toFixed(1)} meters, ${result.placed.length} pieces placed`}
              className="w-full rounded-lg border border-foreground/15 bg-panel"
            >
              <rect x={0} y={0} width={footprint.width} height={footprint.depth} fill="none" stroke="currentColor" strokeWidth={0.06} strokeDasharray="0.3 0.2" opacity={0.5} />
              {result.placed.map((piece) => (
                <g key={piece.key}>
                  <rect x={piece.x} y={piece.z} width={piece.w} height={piece.d} rx={0.05} className="fill-match-soft stroke-match" strokeWidth={0.04} />
                  <text x={piece.x + piece.w / 2} y={piece.z + piece.d / 2} fontSize={Math.min(0.32, piece.w / 4)} textAnchor="middle" dominantBaseline="middle" className="fill-foreground">
                    {piece.item.label}
                  </text>
                </g>
              ))}
            </svg>
            <figcaption className="mt-2 text-xs text-foreground/50">
              Dashed outline: assumed {footprint.width.toFixed(1)} m x {footprint.depth.toFixed(1)} m rectangle ({Math.round(match.squareFeet).toLocaleString("en-US")} sq ft listed, 3:2 shape assumed).
            </figcaption>
          </figure>
          <div className="text-sm">
            <dl className="space-y-2">
              <Row label="Pieces placed" value={`${result.placed.length} of ${items.length}`} />
              <Row label="Floor covered by pieces" value={`${Math.round(((result.usedM2 * SQM_TO_SQFT) / match.squareFeet) * 100)}% (estimated)`} />
              <Row label="Prices" value="Not shown: no price basis for equipment" />
            </dl>
            {result.unplaced.length > 0 && (
              <p className="mt-3 text-foreground/70">
                Did not fit in the assumed rectangle: {result.unplaced.map((item) => item.label).join(", ")}.
              </p>
            )}
            {items.length === 0 && <p className="mt-3 text-foreground/55">Add a piece to see it placed.</p>}
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
          {trace.status === "loading" ? "Tracing floorplan." : "Trace the Matterport floorplan in 3D"}
        </button>
        <p className="mt-2 text-xs text-foreground/50">
          Needs server keys for Matterport and Gemini. Room outlines are traced from the floorplan image by a vision model, so they are estimates, not survey measurements.
        </p>
        {trace.status === "notConfigured" && <p role="status" className="mt-2 text-sm">Not configured: {trace.message} Showing the concept placement only.</p>}
        {trace.status === "failed" && <p role="alert" className="mt-2 text-sm">Could not trace: {trace.message}</p>}
        {traced && (
          <div className="mt-4 h-[28rem] overflow-hidden rounded-lg border border-foreground/15">
            <ForegroundTour title={match.address} detail={match.detail} squareFeet={match.squareFeet} layout={traced} pieces={tracedPieces} />
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
