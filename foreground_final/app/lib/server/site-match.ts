import type { Concept, OwnerBrief } from "@/lib/engine";
import { analyzeSite } from "@/lib/engine";
import { rentFor } from "@/lib/ml/rent";
import type { Site } from "@/lib/sites/schema";
import type { Fact, Match } from "../matches";

const number = new Intl.NumberFormat("en-US");
const CONCEPTS: Concept[] = ["quick-service", "fast-casual", "full-service", "cafe", "bar"];

/** A brief the engine accepts: unknown concepts fall back to full-service, the most conservative build-out. */
export function engineBrief(brief: Partial<OwnerBrief> | null | undefined, site?: Site): OwnerBrief {
  const concept = brief?.concept && CONCEPTS.includes(brief.concept) ? brief.concept : "full-service";
  return {
    concept,
    cuisine: brief?.cuisine,
    seats: brief?.seats,
    budgetUsd: brief?.budgetUsd,
    city: site?.city ?? brief?.city,
    mustHaves: brief?.mustHaves,
  };
}

function words(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function photosOf(site: Site): string[] {
  const local = (site.matterport?.photos ?? []).filter(Boolean);
  const hero = site.photoUrl ? [site.photoUrl] : [];
  const ba = (site.matterport?.beforeAfter ?? []).map((b) => b.before).filter(Boolean);
  const all = [...hero, ...local, ...ba];
  return [...new Set(all)].slice(0, 6);
}

/** Rent used for the card: the asking rent, else the model's fair-rent midpoint. */
function rentPerSf(site: Site): number {
  if (site.space.rentPerSfYr) return site.space.rentPerSfYr;
  const fair = rentFor(site.id);
  return fair ? Math.round(fair.fairRentPerSfYr) : 0;
}

/** One CoStar site from data/sites as the UI's Match card. Confidence is the engine's site score. */
export function siteToMatch(site: Site, brief?: Partial<OwnerBrief> | null, extra?: { reason?: string; topRisk?: string; confidence?: number }): Match {
  const a = analyzeSite(site, engineBrief(brief, site));
  const photos = photosOf(site);
  const food = site.tenantHistory.filter((t) => t.isFood);
  const closedHere = site.tenantHistory.filter((t) => t.sameSuite && t.outcome === "closed").length;
  const property: Fact[] = [
    { label: "Space Available", value: `${number.format(site.space.sf)} sq ft${site.space.suite ? ` · Suite ${site.space.suite}` : ""}` },
    { label: "Property Type", value: words(site.propertyType) || "Retail" },
    { label: "Availability", value: site.space.availableOn ? new Date(site.space.availableOn).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Immediately" },
    { label: "Built", value: String(site.yearBuilt ?? "Unknown") },
    { label: "Building", value: site.buildingSf ? `${number.format(site.buildingSf)} sq ft` : "Not listed" },
    { label: "Lease", value: `${site.space.serviceType ?? "Lease"}${site.space.rentPerSfYr ? ` · $${site.space.rentPerSfYr}/sq ft/yr` : " · rent on request"}` },
  ];
  const location: Fact[] = [
    { label: "City", value: `${site.city}, ${site.state} ${site.postcode}` },
    { label: "Zoning", value: site.zoning ?? "Not listed" },
    { label: "Food tenants before", value: food.length ? `${food.length} (${closedHere} closed in this suite)` : "None on record" },
    { label: "Block trend", value: a.trend.rating },
    { label: "Matterport", value: site.matterport ? `Model ${site.matterport.modelId}` : "No scan" },
  ];
  if (site.aerial?.parkingSpaces) location.push({ label: "Parking", value: `${site.aerial.parkingSpaces} spaces seen from above` });

  return {
    listingId: site.space.listingId ?? Number(site.id),
    siteId: site.id,
    address: site.address,
    detail: site.space.suite ? `Suite ${site.space.suite}` : (site.buildingName ?? ""),
    city: site.city,
    blurb: extra?.reason ?? site.headline ?? site.space.notes ?? "",
    topRisk: extra?.topRisk,
    photo: photos[0] ?? `/sites/${site.id}/photo-1.jpg`,
    squareFeet: site.space.sf,
    rentPerSquareFootYear: rentPerSf(site),
    tourId: site.matterport?.modelId ?? "",
    confidence: Math.max(1, Math.min(99, Math.round(extra?.confidence ?? a.score.score))),
    facts: { photos, property, location },
  };
}
