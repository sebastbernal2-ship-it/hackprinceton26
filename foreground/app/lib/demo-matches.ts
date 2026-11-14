// DEMO FALLBACK ONLY. Used when NEXT_PUBLIC_DEMO_FALLBACK=1 and the API has no data.
// Hand-typed sample data, not evidence from the candidate registry. The UI labels it as a demo.
import type { Exchange } from "./next-question";
import { monthlyRent, type Match, type SpaceFacts } from "./matches";

const photo = (key: string) => `https://ahprd1cdn.csgpimgs.com/i2/${key}/113/image.jpg`;

/** Pool the stand-in ranker draws from. Address, size, rent, and tours are real; readiness is not computed for demo data. */
export const MATCH_POOL: Omit<Match, "evidenceReadiness" | "factors">[] = [
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
    facts: travisFacts("2,946 sq ft", [
      photo("OrjMJfe7Zxqi9wZvtU-Rf39uLtH7bu3klYVjtfMhmfc"),
      photo("oXFElgM0qTiK7d_pwCE6SSaZWUrvMh_RpAlhInvaYkI"),
      photo("_fMjYB-LRQqsWcJ4lFAuLzQ3lyfJS33NxLzNv2_WiVY"),
      photo("jDwhpIGuRb6ByDvySR9t8NFIJOP6mPM7Jx1pkI2zFXY"),
    ], "4H2JSnQ3wSj"),
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
    facts: {
      photos: [
        photo("bNRz4-a17yoAHWD6kQBW5LUls8VU6-WJWldn1ST8WiA"),
        photo("UjhW9Iid_06AGakWls2fZ1ogV994oIUt-Up8ovSyqxQ"),
        photo("YRL3FHr1xFFR3fREvMz2KWSRhRedYB0orQnmAdB_4_I"),
        photo("cwjhOloq2B9m_fWWa419kIOjUbDdkt1TdvcI_AME9w0"),
      ],
      property: [
        { label: "Space Available", value: "3,600 sq ft" },
        { label: "Property Type", value: "Retail" },
        { label: "Availability", value: "Immediately" },
        { label: "Built", value: "2003 · renovated 2009" },
        { label: "Building", value: "Class B · 8,921 sq ft · 1 story" },
      ],
      location: [
        { label: "Neighborhood", value: "Far Katy South" },
        { label: "Frontage", value: "574 ft on Highway 6" },
        { label: "Parking", value: "30 spaces · ratio 3.36" },
        { label: "Matterport", value: "Model skKNvMqD4w1" },
      ],
    },
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
    facts: {
      photos: [
        photo("gv4vPareorg_PAI2eqpdQnSn8iV1PFP0TTBgGC9MD1c"),
        photo("WUs7tYoJDONoIn9I6Rvx0lJ8ELnGHqKVZDfh3DUJ2lc"),
        photo("Y7EAHG59TLcXOxBbWU82Jk8c7VjTjkQNQrKrVQJeUoo"),
        photo("2EC7Ov1HA5Bx9Pye1wcJWr0WVlXyImE5JgkLpws2gjw"),
      ],
      property: [
        { label: "Space Available", value: "4,593 sq ft" },
        { label: "Property Type", value: "Restaurant and office" },
        { label: "Availability", value: "Immediately" },
        { label: "Built", value: "2024" },
        { label: "Building", value: "Class B · 13,948 sq ft · 3 stories" },
      ],
      location: [
        { label: "Neighborhood", value: "Greater Heights" },
        { label: "Frontage", value: "125 ft on Studewood" },
        { label: "Parking", value: "11 spaces" },
        { label: "Matterport", value: "Model vte2JuhRvq8" },
      ],
    },
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
    facts: travisFacts("9,889 sq ft", [
      photo("RUETOzmwLhpoCPw4isfcR7yU3hCKMffXtc7swty3iQM"),
      photo("_fMjYB-LRQqsWcJ4lFAuLzQ3lyfJS33NxLzNv2_WiVY"),
      photo("jDwhpIGuRb6ByDvySR9t8NFIJOP6mPM7Jx1pkI2zFXY"),
      photo("tmDOFHswv8MYueUQlYqH_zg7IPTw8sGplwW-KYHoVoQ"),
    ], "NxYn1owequw"),
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
    facts: travisFacts("2,127–4,681 sq ft", [
      photo("tmDOFHswv8MYueUQlYqH_zg7IPTw8sGplwW-KYHoVoQ"),
      photo("_fMjYB-LRQqsWcJ4lFAuLzQ3lyfJS33NxLzNv2_WiVY"),
      photo("RUETOzmwLhpoCPw4isfcR7yU3hCKMffXtc7swty3iQM"),
      photo("jDwhpIGuRb6ByDvySR9t8NFIJOP6mPM7Jx1pkI2zFXY"),
    ], "NxYn1owequw"),
  },
];

function travisFacts(space: string, photos: string[], tourId: string): SpaceFacts {
  return {
    photos,
    property: [
      { label: "Space Available", value: space },
      { label: "Property Type", value: "Retail / Restaurant" },
      { label: "Availability", value: "Immediately" },
      { label: "Built", value: "1960 · renovated 2019" },
      { label: "Building", value: "Class A · 36,932 sq ft · 2 stories" },
    ],
    location: [
      { label: "Neighborhood", value: "Midtown" },
      { label: "Frontage", value: "203 ft on Travis St" },
      { label: "Daily traffic", value: "About 26,759 vehicles" },
      { label: "Matterport", value: `Model ${tourId}` },
    ],
  };
}

/** Demo-only keyword ranker: scores the pool against the brief and returns the top three. */
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

  return scored.slice(0, 3).map((entry) => ({ ...entry.space, evidenceReadiness: 0, factors: [], demo: true }));
}
