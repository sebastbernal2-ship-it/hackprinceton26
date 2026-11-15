"use client";

import { ADJACENT_MILES, REGION_MILES, RING_MILES, SIZE, placeDots, ringRadius, type Dot, type NearbyFood } from "../../lib/business-peers";

const C = SIZE / 2;
const FILL: Record<Dot["outcome"], string> = { open: "var(--match)", closed: "var(--accent)", moved: "rgba(27,26,23,0.4)" };

function Marker({ d }: { d: Dot }) {
  const common = { fill: FILL[d.outcome], stroke: d.demo ? "var(--foreground)" : "var(--background)", strokeWidth: d.demo ? 1.4 : 1, strokeDasharray: d.demo ? "2 1.5" : undefined };
  const body =
    d.relation === "direct" ? <rect x={d.x - 5} y={d.y - 5} width={10} height={10} {...common} /> :
    d.relation === "partial" ? <polygon points={`${d.x},${d.y - 6} ${d.x + 6},${d.y} ${d.x},${d.y + 6} ${d.x - 6},${d.y}`} {...common} /> :
    <circle cx={d.x} cy={d.y} r={4} {...common} />;
  return <g>{body}<title>{d.label}</title></g>;
}

/** Map-free ring diagram: the site at the centre, rings at 0.25 / 0.5 / 1 mile (plus the 3 mile region), the too-close zone shaded, nearby food
 *  businesses as dots (colour = outcome, shape = relation to the target concept). Radial scale is square-root inside 1 mile, linear beyond. */
export default function PeerRings({ items, adjacentM }: { items: NearbyFood[]; adjacentM: number }) {
  const dots = placeDots(items);
  const rAdj = ringRadius(adjacentM / 1609.344 || ADJACENT_MILES);
  const r025 = ringRadius(0.25);
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto h-auto w-full max-w-[22rem]" role="img" data-testid="peer-rings"
      aria-label={`Ring diagram of ${items.length} nearby food businesses around the site, rings at 0.25, 0.5 and 1 mile and a 3 mile region`}>
      <circle cx={C} cy={C} r={ringRadius(REGION_MILES)} fill="rgba(27,26,23,0.025)" stroke="rgba(27,26,23,0.2)" strokeDasharray="3 3" />
      <circle cx={C} cy={C} r={r025} fill="rgba(217,81,44,0.07)" />
      <circle cx={C} cy={C} r={rAdj} fill="rgba(217,81,44,0.2)" data-testid="too-close-zone"><title>Too close: a direct competitor here is penalised fully ({Math.round(adjacentM)} m)</title></circle>
      {RING_MILES.map((m) => (
        <g key={m}>
          <circle cx={C} cy={C} r={ringRadius(m)} fill="none" stroke="rgba(27,26,23,0.3)" />
          <text x={C + 3} y={C - ringRadius(m) - 2} fontSize="9" fill="rgba(27,26,23,0.55)">{m} mi</text>
        </g>
      ))}
      <text x={C - 4} y={C - ringRadius(REGION_MILES) + 11} textAnchor="end" fontSize="9" fill="rgba(27,26,23,0.55)">{REGION_MILES} mi region</text>
      {dots.map((d) => <Marker key={d.id} d={d} />)}
      <circle cx={C} cy={C} r={5} fill="var(--foreground)"><title>The site</title></circle>
      <text x={C} y={SIZE - 4} textAnchor="middle" fontSize="9" fill="rgba(27,26,23,0.5)">north up; distance scale is square-root inside 1 mi</text>
    </svg>
  );
}
