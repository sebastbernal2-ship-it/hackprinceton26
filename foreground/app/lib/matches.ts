import type { Exchange } from "./next-question";

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
  /** 0 to 100. Placeholder until the matching agent scores spaces against the brief. */
  confidence: number;
};

const photo = (key: string) => `https://ahprd1cdn.csgpimgs.com/i2/${key}/113/image.jpg`;

/** Pool the stand-in ranker draws from. Address, size, rent, and tours are real; confidence is assigned at rank time. */
export const MATCH_POOL: Omit<Match, "confidence">[] = [
  {
    listingId: 4105591,
    address: "2600 Travis St",
    detail: "Suite 104",
    city: "Houston, TX",
    blurb: "Second-generation restaurant on a Midtown hard corner, move-in ready for a new concept.",
    photo: photo("_fMjYB-LRQqsWcJ4lFAuLzQ3lyfJS33NxLzNv2_WiVY"),
    squareFeet: 2946,
    rentPerSquareFootYear: 45,
    tourId: "4H2JSnQ3wSj",
  },
  {
    listingId: 40281878,
    address: "3402 Highway 6",
    detail: "Suite A",
    city: "Houston, TX",
    blurb: "Corner retail on the Far Katy corridor, previously a bar and lounge with drive-thru access.",
    photo: photo("bNRz4-a17yoAHWD6kQBW5LUls8VU6-WJWldn1ST8WiA"),
    squareFeet: 3600,
    rentPerSquareFootYear: 25,
    tourId: "skKNvMqD4w1",
  },
  {
    listingId: 27822184,
    address: "1023 Studewood St",
    detail: "Studewood 10.5",
    city: "Houston, TX",
    blurb: "Class A Heights space with a covered terrace and downtown views, suited to a rooftop restaurant.",
    photo: photo("gv4vPareorg_PAI2eqpdQnSn8iV1PFP0TTBgGC9MD1c"),
    squareFeet: 4593,
    rentPerSquareFootYear: 49,
    tourId: "vte2JuhRvq8",
  },
  {
    listingId: 4105591_100,
    address: "2600 Travis St",
    detail: "Suite 100",
    city: "Houston, TX",
    blurb: "Nearly 10,000 SF second-generation restaurant in Midtown, scaled for a flagship dining room.",
    photo: photo("RUETOzmwLhpoCPw4isfcR7yU3hCKMffXtc7swty3iQM"),
    squareFeet: 9889,
    rentPerSquareFootYear: 45,
    tourId: "NxYn1owequw",
  },
  {
    listingId: 4105591_107,
    address: "2600 Travis St",
    detail: "Suite 107",
    city: "Houston, TX",
    blurb: "Compact second-generation restaurant suite in the same Midtown collection as Suite 104.",
    photo: photo("tmDOFHswv8MYueUQlYqH_zg7IPTw8sGplwW-KYHoVoQ"),
    squareFeet: 2127,
    rentPerSquareFootYear: 37,
    tourId: "NxYn1owequw",
  },
];

export function monthlyRent(match: Pick<Match, "squareFeet" | "rentPerSquareFootYear">): number {
  return Math.round((match.squareFeet * match.rentPerSquareFootYear) / 12);
}

/** Stand-in for the matching agent: scores the pool against the brief and returns the top three. */
export function rankMatches(brief: Exchange[]): Match[] {
  const said = brief.map((exchange) => exchange.answer).join(" ").toLowerCase();
  const wantsCheap = /cheap|budget|afford|lower rent|less expensive|\b\d{2,3}\s?k\b/.test(said);
  const wantsLarge = /large|big|flagship|100|more seats|[5-9]\d\s*seats?|\d{3}\s*seats?/.test(said);
  const wantsPatio = /patio|terrace|outdoor|rooftop/.test(said);
  const wantsSmall = /small|intimate|cozy|bakery|cafe|coffee/.test(said);
  const wantsMidtown = /midtown|downtown|urban|travis/.test(said);
  const wantsHeights = /heights|studewood|neighborhood/.test(said);
  const wantsKaty = /katy|highway|suburb|drive.?thru/.test(said);

  const scored = MATCH_POOL.map((space, index) => {
    let score = 40 + ((index * 17) % 13);
    const rent = monthlyRent(space);
    if (wantsCheap && rent < 10000) score += 28;
    if (wantsCheap && rent >= 15000) score -= 20;
    if (wantsLarge && space.squareFeet >= 4500) score += 26;
    if (wantsLarge && space.squareFeet < 3000) score -= 18;
    if (wantsSmall && space.squareFeet <= 3600) score += 24;
    if (wantsSmall && space.squareFeet > 8000) score -= 22;
    if (wantsPatio && /terrace|rooftop|outdoor/i.test(space.blurb)) score += 30;
    if (wantsMidtown && /travis|midtown/i.test(`${space.address} ${space.blurb}`)) score += 22;
    if (wantsHeights && /studewood|heights/i.test(`${space.address} ${space.blurb}`)) score += 22;
    if (wantsKaty && /highway|katy|drive-thru/i.test(`${space.address} ${space.blurb}`)) score += 22;
    return { space, score };
  });

  scored.sort((a, b) => b.score - a.score || a.space.squareFeet - b.space.squareFeet);

  const confidences = [92, 84, 76];
  return scored.slice(0, 3).map((entry, index) => ({
    ...entry.space,
    confidence: confidences[index] ?? Math.max(60, 90 - index * 8),
  }));
}
