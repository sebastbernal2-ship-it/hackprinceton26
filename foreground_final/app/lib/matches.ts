export type Match = {
  /** CoStar commercial listing id. */
  listingId: number;
  /** Site id in data/sites: the key every backend route takes. */
  siteId: string;
  address: string;
  /** Suite or building name. */
  detail: string;
  city: string;
  /** Why the agent picked it (its one-line reason), else the site's headline. */
  blurb: string;
  /** The agent's main worry about this space, when it ran. */
  topRisk?: string;
  /** Listing photo (CoStar CDN or a local scan photo). Serves browsers only; skip the Next image optimizer. */
  photo: string;
  squareFeet: number;
  /** Asking rent in dollars per square foot per year (or the rent model's fair rent when no ask is listed). */
  rentPerSquareFootYear: number;
  /** Matterport model id for Open Tour. */
  tourId: string;
  /** 0 to 100: the engine's site score for this brief. */
  confidence: number;
  /** Extra CoStar facts for the info screen. */
  facts: SpaceFacts;
};

export type Fact = { label: string; value: string };

export type SpaceFacts = {
  /** Extra listing photos, hero first. */
  photos: string[];
  property: Fact[];
  location: Fact[];
};

export function monthlyRent(match: Pick<Match, "squareFeet" | "rentPerSquareFootYear">): number {
  return Math.round((match.squareFeet * match.rentPerSquareFootYear) / 12);
}
