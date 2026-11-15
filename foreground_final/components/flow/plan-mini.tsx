import { ITEM_SPECS, itemRect, patioRect, type Layout } from "@/lib/layout";

const GROUP_FILL = {
  seating: "oklch(0.96 0.012 85 / 0.34)",
  bar: "oklch(0.82 0.09 235 / 0.42)",
  kitchen: "oklch(0.64 0.015 75 / 0.5)",
  service: "oklch(0.78 0.015 80 / 0.26)",
} as const;

export type PlanDot = { x: number; y: number; kind: "seated" | "waiting" | "walked" | "empty" };

/**
 * A read-only drawing of the owner's plan: the footprint (scanned room outlines or the listing rectangle), every
 * item at its true size, and optional dots (guests, empty seats) in plan metres. Static SVG so it stays cheap in
 * tiles and in the lunch-rush play. The editable plan is chapter 3's own canvas.
 */
export function PlanMini({ layout, dots, label, className }: { layout: Layout; dots?: PlanDot[]; label: string; className?: string }) {
  const fp = layout.footprint;
  const patio = layout.items.some((i) => i.type === "patio-table") ? patioRect(layout) : null;
  const m = 0.5;
  const x0 = Math.min(0, patio?.x ?? 0) - m;
  const y0 = Math.min(0, patio?.y ?? 0) - m;
  const x1 = Math.max(fp.w, patio ? patio.x + patio.w : 0) + m;
  const y1 = Math.max(fp.d, patio ? patio.y + patio.d : 0) + m;
  const r = Math.max(0.12, (x1 - x0) / 120);
  return (
    <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} className={className} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {patio ? <rect x={patio.x} y={patio.y} width={patio.w} height={patio.d} fill="none" stroke="oklch(1 0 0 / 0.18)" strokeWidth={r * 0.6} strokeDasharray={`${r * 3} ${r * 2}`} /> : null}
      {fp.rooms ? (
        fp.rooms.map((room, i) => (
          <polygon key={i} points={room.polygon.join(" ")} fill="oklch(1 0 0 / 0.04)" stroke="oklch(1 0 0 / 0.42)" strokeWidth={r} strokeLinejoin="round" />
        ))
      ) : (
        <rect width={fp.w} height={fp.d} fill="oklch(1 0 0 / 0.04)" stroke="oklch(1 0 0 / 0.42)" strokeWidth={r} />
      )}
      {layout.items.map((it) => {
        const b = itemRect(it);
        return <rect key={it.id} x={b.x} y={b.y} width={b.w} height={b.d} rx={r * 1.5} fill={GROUP_FILL[ITEM_SPECS[it.type].group]} />;
      })}
      {dots?.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.kind === "waiting" ? r * 2.2 : r * 2.6}
          fill={d.kind === "seated" ? "oklch(0.82 0.09 235)" : d.kind === "waiting" ? "oklch(0.96 0.012 85)" : d.kind === "walked" ? "oklch(0.72 0.17 27)" : "none"}
          stroke={d.kind === "empty" ? "oklch(1 0 0 / 0.3)" : "none"}
          strokeWidth={r * 0.5}
        />
      ))}
      {/* the door */}
      <circle cx={layout.entry[0]} cy={layout.entry[1]} r={r * 2} fill="oklch(0.96 0.012 85)" />
    </svg>
  );
}
