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
  rentPerSquareFootYear: number;
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

export function monthlyRent(match: Pick<Match, "squareFeet" | "rentPerSquareFootYear">): number {
  return Math.round((match.squareFeet * match.rentPerSquareFootYear) / 12);
}
