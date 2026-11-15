import Image from "next/image";
import type { SeatFit } from "@/lib/engine/types";
import { num, sf } from "@/lib/format";
import { Estimate, Src } from "./primitives";

type Room = {
  label: string;
  areaSf: number | null;
  polygon?: [number, number][];
};

type P = [number, number];

function cross(o: P, a: P, b: P) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsCross(p1: P, p2: P, p3: P, p4: P) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function selfIntersects(poly: P[]) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Monotone-chain convex hull. */
function hull(points: P[]): P[] {
  const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: P[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Room polygons from the Model API can arrive as unordered wall endpoints.
 * When the ring self-intersects, draw its convex hull instead (an outline approximation).
 */
function outline(poly: P[]): { ring: P[]; approx: boolean } {
  return selfIntersects(poly) ? { ring: hull(poly), approx: true } : { ring: poly, approx: false };
}

function centroid(poly: [number, number][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function FloorPlan({
  rooms,
  floorplanImage,
  costarPlanUrl,
  spaceSf,
  seats,
}: {
  rooms: Room[];
  floorplanImage?: string | null;
  costarPlanUrl?: string | null;
  spaceSf: number;
  seats: SeatFit;
}) {
  const drawn = rooms
    .filter((r) => r.polygon && r.polygon.length >= 3)
    .map((r) => {
      const o = outline(r.polygon!);
      return { ...r, polygon: o.ring, approx: o.approx };
    })
    .sort((a, b) => (b.areaSf ?? 0) - (a.areaSf ?? 0));
  const approx = drawn.some((r) => r.approx);
  const allApprox = drawn.length > 0 && drawn.every((r) => r.approx);

  const seatLine = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="lettering text-2xl font-semibold">{num(seats.seats)} seats</span>
      <span className="text-sm text-ink-2">{seats.basis}</span>
      <Estimate />
    </div>
  );

  // Rooms arrive as ordered rings: real outlines are drawn as measured; a ring that self-intersects falls back to its
  // hull, drawn dashed (dashed = uncertain). Only a plan made entirely of approximations loses to a floor plan image.
  if (drawn.length > 0 && !(allApprox && floorplanImage)) {
    const pts = drawn.flatMap((r) => r.polygon!);
    const minX = Math.min(...pts.map((p) => p[0]));
    const maxX = Math.max(...pts.map((p) => p[0]));
    const minY = Math.min(...pts.map((p) => p[1]));
    const maxY = Math.max(...pts.map((p) => p[1]));
    const w = maxX - minX;
    const h = maxY - minY;
    const pad = Math.max(w, h) * 0.06;
    const fy = (y: number) => maxY - y + minY; // model y up → screen y down
    const fs = Math.max(w, h) / 42;
    const bar = w > 30 ? 10 : 5;
    const totalSf = drawn.reduce((s, r) => s + (r.areaSf ?? 0), 0);
    const labelMin = totalSf * 0.05;

    return (
      <figure className="m-0 flex flex-col gap-3">
        <svg
          viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 3}`}
          className="h-auto w-full rounded-sm border border-ink bg-paper"
          role="img"
          aria-label={`Floor plan with ${drawn.length} rooms${totalSf ? `, ${sf(totalSf)} measured` : ""}`}
        >
          {drawn.map((r, i) => {
            const poly = r.polygon!.map(([x, y]) => `${x},${fy(y)}`).join(" ");
            const [cx, cy] = centroid(r.polygon!);
            return (
              <g key={`${r.label}-${i}`}>
                <polygon points={poly} fill={i % 2 ? "oklch(0.938 0.009 232 / 0.7)" : "oklch(0.968 0.006 230 / 0.7)"} stroke="var(--ink)" strokeWidth={fs * 0.12} strokeLinejoin="round" strokeDasharray={r.approx ? `${fs * 0.4} ${fs * 0.3}` : undefined} />
                {(r.areaSf ?? 0) < labelMin ? null : (
                <text x={cx} y={fy(cy)} textAnchor="middle" fontSize={fs} fill="var(--ink)" fontWeight={600} style={{ fontStretch: "78%" }}>
                  {r.label}
                </text>
                )}
                {r.areaSf && r.areaSf >= labelMin ? (
                  <text x={cx} y={fy(cy) + fs * 1.15} textAnchor="middle" fontSize={fs * 0.8} fill="var(--ink-2)">
                    {num(Math.round(r.areaSf))} SF
                  </text>
                ) : null}
              </g>
            );
          })}
          {/* scale bar */}
          <g transform={`translate(${minX}, ${maxY + pad * 1.6})`}>
            <line x1={0} x2={bar} y1={0} y2={0} stroke="var(--ink)" strokeWidth={fs * 0.15} />
            <line x1={0} x2={0} y1={-fs * 0.4} y2={fs * 0.4} stroke="var(--ink)" strokeWidth={fs * 0.12} />
            <line x1={bar} x2={bar} y1={-fs * 0.4} y2={fs * 0.4} stroke="var(--ink)" strokeWidth={fs * 0.12} />
            <text x={bar + fs * 0.5} y={fs * 0.3} fontSize={fs * 0.8} fill="var(--ink-2)">
              {bar} m ({Math.round(bar * 3.281)} ft)
            </text>
          </g>
        </svg>
        <figcaption className="flex flex-col gap-1">
          {seatLine}
          <Src>
            Matterport room vectors, {drawn.length} rooms{totalSf ? `, ${sf(totalSf)}` : ""}
            {approx ? `; ${drawn.filter((r) => r.approx).length} dashed outline${drawn.filter((r) => r.approx).length > 1 ? "s" : ""} approximated` : ""}
          </Src>
        </figcaption>
      </figure>
    );
  }

  const img = floorplanImage ?? costarPlanUrl ?? null;
  if (img) {
    return (
      <figure className="m-0 flex flex-col gap-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-ink bg-white">
          <Image src={img} alt={`Floor plan, ${sf(spaceSf)}`} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-3" unoptimized={img.endsWith(".svg") || img.startsWith("http")} />
        </div>
        <figcaption className="flex flex-col gap-1">
          {seatLine}
          <Src>{floorplanImage ? "Matterport floor plan" : "CoStar listing floor plan"}</Src>
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-rule-strong bg-paper-2/60 p-6 text-center">
        <p className="lettering text-4xl font-semibold">{sf(spaceSf)}</p>
        <p className="text-sm text-ink-2">No floor plan in the data yet. Size from the CoStar listing.</p>
      </div>
      {seatLine}
    </div>
  );
}
