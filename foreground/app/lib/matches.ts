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
  /** Client-side only: true for NEXT_PUBLIC_DEMO_FALLBACK sample data. */
  demo?: boolean;
};

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
