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
