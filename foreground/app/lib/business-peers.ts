// Types and pure helpers for the "Nearby businesses: peers and competition" section (GET /api/property/{id}/business-peers).
// Every number the API returns is labelled observed / derived / estimated / demo; helpers here never turn an unknown into a zero.

export type Interval = { value: number | null; low: number | null; high: number | null; evaluable: boolean; source?: string };
export type Neighbour = {
  id: string; distanceMi: number; kind: string; relation: "direct" | "partial" | "complement"; sameKind: boolean; weight: number;
  outcome: "open" | "closed" | "moved"; years: number; startYear: number; market: string; demo: boolean;
};
export type NearbyFood = { id: string; distanceMi: number; bearingDeg: number; kind: string; relation: "direct" | "partial" | "complement"; outcome: "open" | "closed" | "moved"; years: number; demo: boolean };
export type Driver = { name: string; points: number; detail: string; status: string };
export type Warning = { code: string; level: string; text: string };
export type KnnBlock = {
  status: "estimated" | "demo"; method: string; mode?: string; k?: number; nNeighbours?: number; effectiveN?: number; nearestMi?: number; farthestMi?: number;
  survival: Record<string, Interval>; closure2y: (Interval & { definition?: string }) | null;
  medianCompletedTenureYears?: (Interval & { basis: string }) | null; medianTenureKM?: number | null; shareStillOpen?: Interval;
  sameKind?: { n: number; open: number; closed: number; moved: number; note: string };
  marketPrior?: { survival: Record<string, number>; closure2y: number; note: string };
  neighbours: Neighbour[];
  evaluation?: {
    protocol: string; heldOutWindow: number[]; nTargets: number; nClosed2y: number; plainly: string; verdict: string[];
    closure2y: { brierKnn: number; brierMarketPrior: number; aucKnn: number | null }; ended2y: { brierKnn: number; brierMarketPrior: number; aucKnn: number | null };
  } | null;
};
export type NeighbourhoodBlock = {
  label: string; index: number | null; status: "derived" | "demo"; concept: string; drivers: Driver[]; warnings: Warning[]; adjacentCompetitor: boolean;
  components: { agglomeration: number | null; validation: number | null; competitionPressure: number | null };
  bands: Record<string, { directCompetitorsOpen: number; partialOpen: number; foodComplementsOpen: number; otherTenanciesOpen: number; successfulNonCompeting: number }>;
  nearestDirectCompetitorM: number | null; nearbyFood: NearbyFood[]; optimumBand: string; sources: string;
  sensitivity?: { base: number | null; range: number[] | null; variants: { name: string; index: number | null; adjacentCompetitor: boolean }[]; note: string; warningStable: boolean };
  config: { adjacent_m: number; region_mi: number; bands_mi: number[] };
};
export type BusinessPeers = {
  listingId: number; concept: string; dataAvailable: boolean; site: { lat: number | null; lon: number | null; market: string | null; locationSource: string | null };
  knn: KnnBlock; neighbourhood: NeighbourhoodBlock | null; coverage: { kitBuildingsWithin1mi: number; tenanciesWithin1mi: number; foodSpellsWithin1mi: number; note: string } | null;
  labels: Record<string, string>; demo: boolean; demoNote: string | null; notice: string;
};

export async function fetchBusinessPeers(id: number): Promise<BusinessPeers | null> {
  try {
    const r = await fetch(`/api/property/${id}/business-peers`);
    return r.ok ? ((await r.json()) as BusinessPeers) : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- ring diagram geometry */
export const RING_MILES = [0.25, 0.5, 1] as const;
export const REGION_MILES = 3;
export const ADJACENT_MILES = 150 / 1609.344;
export const SIZE = 320;
const C = SIZE / 2;
const R_ONE = 100; // radius of the 1 mile ring in px
const R_REGION = 146; // radius of the 3 mile ring in px

/** Radial position of a distance. Square-root scale inside 1 mile so the inner rings stay legible, linear from 1 to 3 miles. */
export function ringRadius(mi: number): number {
  if (!(mi >= 0)) return 0;
  if (mi <= 1) return R_ONE * Math.sqrt(mi);
  return Math.min(R_REGION, R_ONE + ((R_REGION - R_ONE) * (mi - 1)) / (REGION_MILES - 1));
}

export function polar(bearingDeg: number, r: number): { x: number; y: number } {
  const t = (bearingDeg * Math.PI) / 180;
  return { x: C + r * Math.sin(t), y: C - r * Math.cos(t) };
}

export type Dot = { id: string; x: number; y: number; outcome: NearbyFood["outcome"]; relation: NearbyFood["relation"]; demo: boolean; label: string };

/** Dots for the diagram. Businesses in the same building share a point (distance ~0): spread them on a small circle so none hides another. */
export function placeDots(items: NearbyFood[]): Dot[] {
  const cell = new Map<string, number>();
  return items.map((f) => {
    const key = `${Math.round(f.bearingDeg / 10)}:${Math.round(ringRadius(f.distanceMi) / 3)}`;
    const n = cell.get(key) ?? 0;
    cell.set(key, n + 1);
    const same = f.distanceMi < 0.02;
    const r = same ? 9 + 5 * Math.floor(n / 6) : ringRadius(f.distanceMi);
    const b = same ? (n * 61) % 360 : f.bearingDeg + (n ? n * 5 : 0);
    const { x, y } = polar(b, r);
    return { id: f.id, x, y, outcome: f.outcome, relation: f.relation, demo: f.demo, label: dotLabel(f) };
  });
}

export const KIND_LABEL: Record<string, string> = {
  cafe_coffee: "cafe / coffee", bakery: "bakery", dessert_drink: "dessert / drinks", bar: "bar", quick_service: "quick service", full_service: "full service",
  unclassified_food: "food (kind unknown)", non_restaurant: "non-restaurant",
};
export const OUTCOME_LABEL: Record<string, string> = { open: "open", closed: "closed (CoStar closure label)", moved: "moved or other exit" };
export const RELATION_LABEL: Record<string, string> = { direct: "direct competitor", partial: "partial substitute", complement: "complement" };

export function dotLabel(f: { kind: string; relation: string; outcome: string; years: number; distanceMi: number; demo: boolean }): string {
  const d = f.distanceMi < 0.1 ? `${Math.round(f.distanceMi * 1609)} m` : `${f.distanceMi.toFixed(2)} mi`;
  return `${f.demo ? "DEMO " : ""}${RELATION_LABEL[f.relation] ?? f.relation}, ${KIND_LABEL[f.kind] ?? f.kind}, ${d}, ${f.outcome} after ${f.years.toFixed(1)} y`;
}

/* ---------------------------------------------------------------- formatting */
export const pct = (v: number | null | undefined): string => (v == null || Number.isNaN(v) ? "cannot say" : `${Math.round(v * 100)}%`);

/** "74% (68-81%)", or "cannot say" for an unknown; an interval-less value shows the point only. */
export function intervalText(iv: Interval | null | undefined, asPct = true): string {
  if (!iv || iv.value == null) return "cannot say";
  const f = (x: number) => (asPct ? `${Math.round(x * 100)}` : x.toFixed(1));
  const unit = asPct ? "%" : " y";
  if (iv.low == null || iv.high == null) return `${f(iv.value)}${unit}`;
  return `${f(iv.value)}${unit} (${f(iv.low)}-${f(iv.high)}${unit})`;
}

export type Chip = "observed" | "estimated" | "derived" | "demo";
/** The label a figure carries: demo wins; neighbour rows are observed; model aggregates are estimated; the index is derived. */
export function chipFor(kind: "neighbour" | "aggregate" | "index" | "kind", demo: boolean): Chip {
  if (demo) return "demo";
  return kind === "neighbour" ? "observed" : kind === "aggregate" ? "estimated" : "derived";
}

/** Nearest `limit` neighbours first, same-kind before others at equal distance; stable, never mutates. */
export function topNeighbours(ns: Neighbour[], limit: number): Neighbour[] {
  return [...ns].sort((a, b) => a.distanceMi - b.distanceMi || Number(b.sameKind) - Number(a.sameKind) || a.id.localeCompare(b.id)).slice(0, limit);
}

export function distanceText(mi: number): string {
  return mi < 0.1 ? `${Math.round(mi * 1609)} m` : `${mi.toFixed(2)} mi`;
}

/** Counts of nearby food businesses by outcome, for the legend line under the diagram. */
export function outcomeCounts(items: NearbyFood[]): { open: number; closed: number; moved: number; direct: number } {
  const c = { open: 0, closed: 0, moved: 0, direct: 0 };
  for (const f of items) {
    c[f.outcome] += 1;
    if (f.relation === "direct") c.direct += 1;
  }
  return c;
}

/** Index tone for text only (never a verdict): below 40 "low context", 40-65 "mixed", above "supportive context". */
export function indexBand(index: number | null): string {
  if (index == null) return "cannot say";
  return index < 40 ? "low context" : index <= 65 ? "mixed context" : "supportive context";
}
