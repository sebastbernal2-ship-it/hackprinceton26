import { Site, type FindingKind, type SiteInput } from "@/lib/sites/schema";

type Overrides = Omit<Partial<SiteInput>, "space"> & { space?: Partial<SiteInput["space"]> };

/** A plain 1,800 SF second-generation Houston space at $30/SF NNN with no findings. */
export function makeSite(overrides: Overrides = {}): Site {
  const { space, ...rest } = overrides;
  return Site.parse({
    id: "test-1",
    address: "1 Test St",
    city: "Houston",
    state: "TX",
    postcode: "77002",
    lat: 29.7,
    lng: -95.4,
    propertyType: "Retail",
    buildingSf: 10000,
    yearBuilt: 1990,
    matterport: null,
    aerial: null,
    ...rest,
    space: {
      spaceId: 1,
      listingId: 1,
      suite: "100",
      floor: "1",
      sf: 1800,
      rentPerSfYr: 30,
      serviceType: "NNN",
      spaceUse: "Retail",
      spaceType: "Relet",
      notes: null,
      availableOn: "2026-08-14",
      ...space,
    },
  });
}

export function finding(kind: FindingKind, status: "present" | "absent" | "unknown") {
  return { id: `f-${kind}`, kind, status, confidence: 0.7, evidence: "test", source: "costar-notes" as const };
}

type TenantInput = NonNullable<SiteInput["tenantHistory"]>[number];

export function tenant(over: Partial<TenantInput> = {}): TenantInput {
  return {
    name: "Tenant",
    industry: "Accommodation and Food Services",
    isFood: true,
    moveIn: "2015-01-01",
    moveOut: "2018-01-01",
    years: 3,
    outcome: "closed",
    ...over,
  };
}
