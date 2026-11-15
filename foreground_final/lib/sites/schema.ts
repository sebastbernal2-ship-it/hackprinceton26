import { z } from "zod";

/**
 * The site contract. One JSON file per demo site lives in data/sites/<id>.json.
 * Written by scripts/prep_sites.py (+ media prep), read by lib/engine, lib/agent and the UI.
 * Units are in field names: Sf = square feet, Usd = US dollars, PerSfYr = $/SF/year, M = metres.
 * Optional fields are optional because the source may not have them; the UI must render without them.
 */

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "ISO date");
const Vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const Source = z.object({ label: z.string(), url: z.string().url().optional() });

export const Space = z.object({
  spaceId: z.number(),
  listingId: z.number(),
  suite: z.string().nullable(),
  floor: z.string().nullable(),
  sf: z.number().positive(),
  sfMin: z.number().positive().optional(),
  rentPerSfYr: z.number().nonnegative().nullable(),
  /** NNN, FSG, MG, IG, ... as CoStar abbreviates; null when not quoted */
  serviceType: z.string().nullable(),
  spaceUse: z.string().nullable(),
  /** Relet = second generation; New = first generation / shell */
  spaceType: z.string().nullable(),
  notes: z.string().nullable(),
  availableOn: Iso.nullable(),
  floorPlanUrl: z.string().url().nullable().optional(),
  restaurantKeywords: z.array(z.string()).default([]),
});
export type Space = z.infer<typeof Space>;

export const Tenancy = z.object({
  name: z.string(),
  industry: z.string().nullable(),
  isFood: z.boolean(),
  moveIn: Iso.nullable(),
  moveOut: Iso.nullable(),
  years: z.number().nullable(),
  suite: z.string().nullable().optional(),
  /** true when this tenancy was in the featured space's suite */
  sameSuite: z.boolean().default(false),
  current: z.boolean().default(false),
  /** closed / bankrupt / moved when the kit says so; else unknown */
  outcome: z.enum(["closed", "moved", "current", "unknown"]).default("unknown"),
  matchBasis: z.string().optional(),
});
export type Tenancy = z.infer<typeof Tenancy>;

export const Sale = z.object({
  date: Iso,
  priceUsd: z.number().nullable(),
  note: z.string().optional(),
});

export const Room = z.object({
  label: z.string(),
  areaSf: z.number().nullable(),
  widthFt: z.number().nullable().optional(),
  depthFt: z.number().nullable().optional(),
  heightFt: z.number().nullable().optional(),
  /** floor polygon in model space metres, [x, y] pairs */
  polygon: z.array(z.tuple([z.number(), z.number()])).optional(),
  center: Vec3.optional(),
});

/** Six cube faces of a pano's skybox, local paths under /public, Matterport face order 0..5 */
const CubeFaces = z.array(z.string()).length(6);

export const Pano = z.object({
  id: z.string(),
  position: Vec3,
  label: z.string().optional(),
  /** camera rotation quaternion from the Model API, used to orient the cube */
  rotation: z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() }).optional(),
  skybox: CubeFaces.optional(),
  skyboxEmpty: CubeFaces.optional(),
});

export const BeforeAfter = z.object({
  panoId: z.string(),
  /** local paths under /public, e.g. /sites/1018657/before.jpg */
  before: z.string(),
  after: z.string().nullable(),
  caption: z.string().optional(),
});

export const Matterport = z.object({
  modelId: z.string(),
  defurnishedViewId: z.string().nullable(),
  /** true when the scan shows the exact suite for lease, false when a neighbouring suite */
  scanOfExactSuite: z.boolean(),
  scanName: z.string().optional(),
  areaSf: z.number().nullable().optional(),
  rooms: z.array(Room).default([]),
  panos: z.array(Pano).default([]),
  beforeAfter: z.array(BeforeAfter).default([]),
  photos: z.array(z.string()).default([]),
  floorplanImage: z.string().nullable().optional(),
  description: z.string().optional(),
});

/** Detection polygon in image pixel coordinates of aerial.orthoPath */
export const Detection = z.object({
  label: z.string(),
  confidence: z.number().min(0).max(1),
  polygon: z.array(z.tuple([z.number(), z.number()])),
});

export const Aerial = z.object({
  orthoPath: z.string(),
  /** pixel size of the ortho image, so overlays can be placed before it loads */
  widthPx: z.number().int().positive().optional(),
  heightPx: z.number().int().positive().optional(),
  obliquePath: z.string().nullable().optional(),
  captureDate: Iso.nullable(),
  /** metres covered by the ortho image edge */
  extentM: z.number().positive(),
  gsdM: z.number().positive().optional(),
  footprintSf: z.number().nullable().optional(),
  vehicleCount: z.number().nullable().optional(),
  parkingSpaces: z.number().nullable().optional(),
  hardscapeSf: z.number().nullable().optional(),
  patioCandidateSf: z.number().nullable().optional(),
  detections: z.array(Detection).default([]),
});

export const FindingKind = z.enum([
  "hood",
  "grease-trap",
  "kitchen-line",
  "walk-in",
  "restrooms",
  "electrical",
  "gas",
  "sewer",
  "ada",
  "prior-use",
  "patio",
  "storefront",
]);
export type FindingKind = z.infer<typeof FindingKind>;

export const Finding = z.object({
  id: z.string(),
  kind: FindingKind,
  status: z.enum(["present", "absent", "unknown"]),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  source: z.enum(["matterport-vision", "matterport-rooms", "costar-notes", "costar-tenants", "vexcel"]),
  /** Matterport model-space anchor for a pin in the 3D tour */
  position: Vec3.optional(),
  imagePath: z.string().optional(),
  /** Matterport pano the evidence image came from, for moving the tour camera there */
  panoId: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const Neighborhood = z.object({
  medianHouseholdIncomeUsd: z.number().nullable().optional(),
  jobsNearby: z.number().nullable().optional(),
  populationGrowth5yPct: z.number().nullable().optional(),
  newUnitsPermitted12mo: z.number().nullable().optional(),
  foodOpenings3y: z.number().nullable().optional(),
  foodClosures3y: z.number().nullable().optional(),
  submarketVacancyPct: z.number().nullable().optional(),
  sources: z.array(Source).default([]),
});

export const Site = z.object({
  id: z.string(),
  address: z.string(),
  city: z.enum(["Houston", "Los Angeles"]),
  state: z.enum(["TX", "CA"]),
  postcode: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  buildingName: z.string().nullable().optional(),
  propertyType: z.string(),
  propertySubtype: z.string().nullable().optional(),
  buildingSf: z.number().nullable(),
  yearBuilt: z.number().nullable(),
  yearRenovated: z.number().nullable().optional(),
  stories: z.number().nullable().optional(),
  zoning: z.string().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  /** the space Foreground evaluates for the owner */
  space: Space,
  otherSpaces: z.array(Space).default([]),
  tenantHistory: z.array(Tenancy).default([]),
  sales: z.array(Sale).default([]),
  matterport: Matterport.nullable(),
  aerial: Aerial.nullable(),
  findings: z.array(Finding).default([]),
  neighborhood: Neighborhood.default({ sources: [] }),
  /** one-line story used in the demo (e.g. "two restaurants failed in this suite") */
  headline: z.string().optional(),
  sources: z.array(Source).default([]),
});
export type Site = z.infer<typeof Site>;
export type SiteInput = z.input<typeof Site>;
