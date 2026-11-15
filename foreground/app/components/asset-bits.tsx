import { bbox, DIMS_LABEL, fmtDims, fmtM, type Asset, type DimsStatus } from "../lib/assets";

const BADGE: Record<DimsStatus, string> = {
  measured: "border-foreground/50 bg-foreground text-background",
  catalog: "border-foreground/40",
  estimated: "border-dashed border-foreground/50 italic",
};

export function DimsBadge({ status }: { status: DimsStatus }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] leading-none ${BADGE[status]}`}>{DIMS_LABEL[status]}</span>;
}

export function DraftBadge() {
  return <span className="rounded border border-dashed border-foreground/60 px-1.5 py-0.5 text-[11px] leading-none">draft, estimated dimensions</span>;
}

export function AssetFacts({ asset }: { asset: Asset }) {
  return (
    <dl className="mt-1 space-y-0.5 text-xs text-foreground/75">
      <div className="flex flex-wrap items-center gap-1.5">
        <dt className="sr-only">Dimensions</dt>
        <dd>{fmtDims(asset.dims)}</dd>
        <DimsBadge status={asset.dimsStatus} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <dt className="sr-only">Clearance</dt>
        <dd>
          clearance front {fmtM(asset.clearance.front)}, sides {fmtM(asset.clearance.sides)}, back {fmtM(asset.clearance.back)}
        </dd>
        <span className="rounded border border-dashed border-foreground/40 px-1.5 py-0.5 text-[11px] leading-none" title={asset.clearanceBasis}>assumption</span>
      </div>
      <p className="text-foreground/55">Basis: {asset.clearanceBasis || "none stated"}</p>
    </dl>
  );
}

/** Footprint polygon with its front edge (local +y) and front clearance zone. */
export function FootprintSvg({ asset, size = 120, maxHeight }: { asset: Asset; size?: number; maxHeight?: number }) {
  const b = bbox(asset.footprint);
  const c = asset.clearance.front;
  const w = b.x1 - b.x0;
  const d = b.y1 - b.y0;
  const pad = 0.1;
  const vbW = w + 2 * pad;
  const vbH = d + c + 2 * pad;
  const pts = asset.footprint.map(([x, y]) => `${x - b.x0 + pad},${y - b.y0 + pad}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={size}
      style={{ aspectRatio: `${vbW} / ${vbH}`, ...(maxHeight ? { maxHeight, maxWidth: "100%" } : {}) }}
      role="img"
      aria-label={`Footprint of ${asset.name}, ${fmtM(w)} by ${fmtM(d)}, ${asset.footprint.length} corners`}
      className="shrink-0 self-start rounded border border-foreground/15 bg-panel"
    >
      <rect x={pad} y={d + pad} width={w} height={c} fill="none" stroke="currentColor" strokeWidth={0.02} strokeDasharray="0.06 0.05" opacity={0.45} />
      <polygon points={pts} className="fill-match-soft stroke-match" strokeWidth={0.03} />
      <line x1={pad} y1={d + pad} x2={w + pad} y2={d + pad} stroke="currentColor" strokeWidth={0.05} />
    </svg>
  );
}
