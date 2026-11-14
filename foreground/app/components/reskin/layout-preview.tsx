"use client";

import { useState } from "react";
import { boundsOf, layoutBoxes, type ReskinResult } from "../../lib/reskin";

/**
 * Top-down preview of the reskinned equipment layout with the concept's materials applied (floor, wall edge, accent).
 * Sizes come from the asset library; unknown sizes are drawn dashed at a nominal size and flagged. It is a layout
 * sketch from a reference layout, not a measured plan, and the Matterport 3D tour does not take this palette.
 */
export default function LayoutPreview({ result, dims }: { result: ReskinResult; dims: Record<string, { w: number; d: number }> }) {
  const [side, setSide] = useState<"to" | "from">("to");
  const m = result.materials;
  const pal = side === "to" ? m.to : m.from;
  const boxes = layoutBoxes(result, dims);
  const b = boundsOf(boxes);
  const pad = 0.6;
  const W = b.x1 - b.x0 + pad * 2;
  const H = b.y1 - b.y0 + pad * 2;
  const missing = boxes.filter((x) => !x.dimsKnown).length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Palette to preview" className="inline-flex rounded-full border border-foreground/15 p-0.5 text-xs">
          {(["from", "to"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}
              className={`rounded-full px-3 py-1 ${side === s ? "bg-foreground text-background" : "text-foreground/60"}`}>
              {s === "from" ? `Before: ${result.fromConcept}` : `After: ${result.toConcept}`}
            </button>
          ))}
        </div>
        <ul className="flex flex-wrap gap-2 text-xs text-foreground/70" aria-label="Materials palette">
          {(["wall", "floor", "ceiling", "accent"] as const).map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-sm border border-foreground/20" style={{ background: pal[k].hex }} />
              {k}: {pal[k].name}
            </li>
          ))}
        </ul>
      </div>
      <svg viewBox={`${b.x0 - pad} ${b.y0 - pad} ${W} ${H}`} role="img" aria-label={`Top-down layout preview, ${side === "to" ? result.toConcept : result.fromConcept} materials`}
        className="mt-3 w-full max-w-2xl rounded-xl" style={{ background: pal.ceiling.hex }}>
        <rect x={b.x0 - pad * 0.5} y={b.y0 - pad * 0.5} width={W - pad} height={H - pad} fill={pal.floor.hex} stroke={pal.wall.hex} strokeWidth={0.18} />
        {boxes.map((x) => {
          const rotated = x.rot % 180 !== 0;
          const w = rotated ? x.d : x.w;
          const d = rotated ? x.w : x.d;
          return (
            <g key={x.id}>
              <rect x={x.x} y={x.y} width={w} height={d} rx={0.05}
                fill={x.kind === "added" ? pal.accent.hex : "#f4f1ea"} fillOpacity={x.kind === "added" ? 0.95 : 0.8}
                stroke="#1b1a17" strokeWidth={0.03} strokeDasharray={x.dimsKnown ? undefined : "0.1 0.07"} />
              <text x={x.x + w / 2} y={x.y + d / 2} fontSize={0.11} textAnchor="middle" dominantBaseline="middle" fill="#1b1a17">{x.id.replace(/_/g, " ").slice(0, 12)}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-foreground/50">
        Sketch of a {result.syntheticSource ? "reference (synthesized) " : ""}layout in metres. Filled accent = added equipment.
        {missing > 0 ? ` ${missing} item(s) have no known size and are drawn dashed at a nominal 0.8 m.` : ""} Ceiling colour is the backdrop. The 3D walkthrough does not take this palette.
      </p>
    </div>
  );
}
