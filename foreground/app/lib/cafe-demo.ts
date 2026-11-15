// DEMO SHORTCUT. Typing "cafes" as the first intake answer skips the brief and shows three café interiors
// picked by hand from the Matterport catalog. They are scans of amenity cafés, not CoStar listings: there is
// no rent, size or availability on file, so those stay unknown and the listing panels are hidden (demo: true).
import type { Match } from "./matches";

type Cafe = { tourId: string; name: string; city: string; address: string; photos: number; costarPropertyId?: number };

const CAFES: Cafe[] = [
  { tourId: "w2JcUVybv9c", name: "The Preserve · Lobby café", city: "Los Angeles, CA", address: "The Preserve, Los Angeles, CA 90028", photos: 7, costarPropertyId: 11104240 },
  { tourId: "xVKH13z5MJ8", name: "Café", city: "Houston, TX", address: "Address not on file (northwest Houston)", photos: 6 },
  { tourId: "JAnuRsaVo9M", name: "Bayou Café", city: "Houston, TX", address: "2107 Tanglewilde St, Houston, TX 77063", photos: 6, costarPropertyId: 8035301 },
];

/** Scans with a local editable walk export, used to give the scripted Sarah scene a cafe to walk and furnish. */
export const CAFE_SCAN_IDS = CAFES.map((c) => c.tourId);

/** Listing ids of the scans: no CoStar structure, lineage, triage or aerial rows exist for them, so those requests are skipped (they would only 404). */
const SCAN_ONLY = new Set(CAFES.flatMap((c, i) => [-(i + 1), ...(c.costarPropertyId ? [c.costarPropertyId] : [])]));
export const isScanOnlyId = (id: number) => SCAN_ONLY.has(id);

export const CAFE_NOTICE =
  "Café demo: three Matterport interiors chosen by hand. They are amenity cafés, not listings, so rent, size and availability are unknown. Photos are served from local scan downloads.";

/** True when the first intake answer asks for the café demo. */
export function isCafePrompt(text: string): boolean {
  return /^caf(e|é)s?$/i.test(text.trim().replace(/[.!]+$/, ""));
}

const photo = (tourId: string, n: number) => `/api/scan-photo?modelId=${tourId}&n=${n}`;

export const CAFE_MATCHES: Match[] = CAFES.map((c, i) => ({
  listingId: -(i + 1),
  address: c.address,
  detail: c.name,
  city: c.city,
  blurb: "Café interior from a Matterport scan, picked for the demo. Not a listing; nothing here is ranked.",
  photo: photo(c.tourId, 0),
  squareFeet: 0,
  rentPerSquareFootYear: null,
  tourId: c.tourId,
  evidenceReadiness: 0,
  demo: true,
  costarPropertyId: c.costarPropertyId,
  facts: {
    photos: [0, ...Array.from({ length: c.photos }, (_, k) => k + 1)].map((n) => photo(c.tourId, n)),
    property: [
      { label: "Space Available", value: "Unknown (not a listing)" },
      { label: "Use", value: "Café (from the scan's name)" },
    ],
    location: [
      { label: "Matterport", value: `Model ${c.tourId}` },
      { label: "CoStar property", value: c.costarPropertyId ? String(c.costarPropertyId) : "Not linked" },
    ],
  },
  factors: [],
}));

// Café reference kit (DEMO). Illustrative layouts per scan; areas are ESTIMATED, never measured.
import kitSpec from "./cafe-kit.json";
import type { Asset } from "./assets";

export const CAFE_KIT_NOTE = "Reference kit: illustrative placements on an ESTIMATED demo floor area, not measured fit. Prices are catalog list prices or estimated demo prices.";

type KitScans = Record<string, Record<string, number>>;
type Variant = { label: string; note: string; base: string[]; scans: KitScans };
/** Concept variants of the kit besides the standard one (key "standard"). */
export const CAFE_KIT_VARIANTS = kitSpec.variants as Record<string, Variant>;
export type KitVariant = "standard" | keyof typeof kitSpec.variants;
const specFor = (variant: KitVariant): { base: string[]; scans: KitScans } =>
  CAFE_KIT_VARIANTS[variant] ?? { base: kitSpec.base, scans: kitSpec.scans as KitScans };

/** Estimated demo floor area (sq ft) for a scan, as a string for the area field; "" for a scan without a kit. */
export function cafeKitArea(tourId: string | undefined, variant: KitVariant = "standard"): string {
  const s = tourId ? specFor(variant).scans[tourId] : undefined;
  return s ? String(s.sqft) : "";
}

/** Ordered catalog ids for a scan's kit (repeats = quantity). Unknown scans get the equipment without dining. */
export function cafeKitIds(tourId: string | undefined, variant: KitVariant = "standard"): string[] {
  const spec = specFor(variant);
  const s = tourId ? spec.scans[tourId] : undefined;
  const dining = s ? Object.entries(s).filter(([k]) => k !== "sqft").flatMap(([id, n]) => Array<string>(n).fill(id)) : [];
  return [...spec.base, ...dining];
}

/** One asset per id: the catalog list can hold a profile draft and the library copy of the same id, so prefer a confirmed copy, else the first. */
export function dedupeAssets(assets: Asset[]): Map<string, Asset> {
  const byId = new Map<string, Asset>();
  for (const a of assets) {
    const have = byId.get(a.assetId);
    if (!have || (have.status !== "confirmed" && a.status === "confirmed")) byId.set(a.assetId, a);
  }
  return byId;
}

export function buildCafeKit(tourId: string | undefined, assets: Asset[], variant: KitVariant = "standard"): { kit: Asset[]; missing: string[] } {
  const byId = dedupeAssets(assets);
  const ids = cafeKitIds(tourId, variant);
  const missing = [...new Set(ids.filter((id) => !byId.has(id)))];
  return { kit: ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])), missing };
}
