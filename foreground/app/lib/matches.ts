export type Fact = { label: string; value: string };

export type SpaceFacts = {
  /** Extra listing photos, hero first. */
  photos: string[];
  property: Fact[];
  location: Fact[];
};

export type FactorStatus = "observed" | "derived" | "estimated" | "unknown";

/** One evidence card. `unknown` means no evidence was found; it is not a negative finding. */
export type FactorCard = {
  factorId: string;
  status: FactorStatus;
  value: string | number | null;
  unit: string | null;
  source: string | null;
  recordId: string | null;
  asOf: string | null;
  geography: string | null;
  limitations: string | null;
};

/** What the API's concept gate removed for a food brief: sites that cannot host the concept, grouped by type with the reason for each. */
export type ConceptGate = {
  concept: string;
  excluded: number;
  total: number;
  groups: { type: string; count: number; sites: { listingId: number; address: string; city: string; type: string; reason: string }[] }[];
};

export type Match = {
  /** CoStar commercial listing id. */
  listingId: number;
  address: string;
  /** Suite or building name. */
  detail: string;
  city: string;
  /** One-line description from the listing. */
  blurb: string;
  /** Listing photo on CoStar's CDN. Serves browsers only; skip the Next image optimizer. */
  photo: string;
  squareFeet: number;
  /** Listed available space in sq ft (not the building); null when not listed. */
  spaceSquareFeet?: number | null;
  /** "listing" (CoStar available space) or "scan" (floor area measured from the Matterport scan). */
  spaceSource?: "listing" | "scan" | "scan-estimate" | null;
  /** Why the API's space picker placed this site here. `bestMatch` is a labelled demo pick, not a fit score. */
  pick?: { reasons: string[]; bestMatch: boolean; label: string | null; concept: string | null } | null;
  /** Asking rent in dollars per square foot per year, triple net. */
  rentPerSquareFootYear: number | null;
  /** Matterport model id for Open Tour. */
  tourId: string;
  /**
   * 0 to 100: how much of the evidence we looked for is verified. Computed from verified
   * fields only. It is NOT a fit, quality, or ranking score.
   */
  evidenceReadiness: number;
  facts: SpaceFacts;
  factors: FactorCard[];
  /** CoStar PropertyId of the building, when it differs from listingId (demo scans: listingId is a placeholder). */
  costarPropertyId?: number;
  /** Client-side only: true for NEXT_PUBLIC_DEMO_FALLBACK sample data. */
  demo?: boolean;
  /** Site build-out estimate from /api/matches (deterministic, server-side). "unknown" carries no numbers. */
  buildout?: Buildout | null;
  /** Monthly rent estimate from /api/matches: best rate option x the same area as the build-out. */
  rent?: RentEstimate | null;
  /** Requirements the evidence confirms / cannot confirm / contradicts. Absent from older services. Not a fit score. */
  alignment?: import("./alignment").Alignment | null;
  /** Per-requirement verdicts from /api/matches (city, area, seats, budget, scan). Used by Fio. */
  constraints?: { constraint: string; status: "PASS" | "FAIL" | "UNKNOWN"; reason: string }[];
};

export type RentEstimate = {
  status: "observed" | "estimated" | "unknown";
  low: number | null;
  high: number | null;
  rateLabel: string | null;
  rateStatus: string | null;
  basis?: string | null;
  reason: string;
};

/** "~$1.9K/mo est." (or a range), "$1.9K/mo" when it is the listing's own asking rent, null when unknown. */
export function rentEstimateLabel(r: RentEstimate | null | undefined): string | null {
  if (!r || r.status === "unknown" || r.low === null || r.high === null) return null;
  const f = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  const amount = Math.round(r.low) === Math.round(r.high) ? f.format(r.low) : `${f.format(r.low)}–${f.format(r.high)}`;
  return r.status === "observed" ? `${amount}/mo rent` : `~${amount}/mo rent est.`;
}

export type Buildout = {
  status: "estimated" | "unknown";
  low: number | null;
  high: number | null;
  squareFeet: number | null;
  /** Where the area came from: the listing's available space, the owner's brief, or an area entered by the owner. */
  basis?: "listing" | "scan" | "brief" | "owner" | null;
  reason: string;
};

/** Small label above the headline; says when the size came from the brief rather than the listing. */
export function buildoutCaption(b: Buildout | null | undefined): string {
  if (b?.status === "estimated" && b.basis === "brief" && b.squareFeet)
    return `Est. build-out · your ${new Intl.NumberFormat("en-US").format(b.squareFeet)} sq ft`;
  if (b?.status === "estimated" && b.basis === "scan") return "Est. build-out · scanned area";
  return "Est. build-out";
}

const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

/** "$412K – $1.1M", or "Unknown" when the estimate has no numbers. Never $0. */
export function buildoutLabel(b: Buildout | null | undefined): string {
  if (!b || b.status !== "estimated" || b.low === null || b.high === null) return "Unknown";
  return `${compact.format(b.low)} – ${compact.format(b.high)}`;
}

/** The listing photo, or the Matterport scan's preview image when the listing has none. */
/** A café scan offered as a candidate: a scan, not a CoStar record, so the building/lineage/aerial endpoints have nothing for it. */
export function isScanOnly(match: Pick<Match, "spaceSource">): boolean {
  return match.spaceSource === "scan-estimate";
}

export function heroPhoto(match: Pick<Match, "photo" | "tourId">): string {
  // The API only sets `photo` when an image exists, so an empty value means "draw the placeholder", never "guess a URL that may 404".
  return match.photo || "";
}

/** Monthly rent in dollars, or null when the listing states no rent. Unknown is never shown as $0. */
export function monthlyRent(match: Pick<Match, "squareFeet" | "rentPerSquareFootYear">): number | null {
  const rate = match.rentPerSquareFootYear;
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0 || !(match.squareFeet > 0)) return null;
  return Math.round((match.squareFeet * rate) / 12);
}

const usd = new Intl.NumberFormat("en-US");

/** "$7,500/mo", or "Rent not listed". */
export function rentLabel(match: Pick<Match, "squareFeet" | "rentPerSquareFootYear">): string {
  const rent = monthlyRent(match);
  return rent === null ? "Rent not listed" : `$${usd.format(rent)}/mo`;
}
