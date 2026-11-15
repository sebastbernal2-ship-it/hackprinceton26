import type { CostLineItem } from "./costs";
import type { FactorCard } from "./matches";
import { CATEGORY_LABEL, type DefectFinding } from "./inspection";

export type ActItem = { id: string; group: string; text: string; origin: string };

/** Deterministic diligence prompts: no LLM. Findings become verification steps; unknown evidence and costs become requests for confirmation or quotes. */
export function buildChecklist(findings: DefectFinding[], factors: FactorCard[], lines: CostLineItem[]): ActItem[] {
  const items: ActItem[] = [];
  const rank = { high: 0, medium: 1, unknown: 2, low: 3 } as const;
  for (const f of [...findings].sort((a, b) => rank[a.severity] - rank[b.severity])) {
    items.push({
      id: `finding:${f.id}`,
      group: "Verify on site",
      text: `${f.title}: ${f.verificationStep}${f.canConfirmFromImagery ? "" : " Imagery cannot confirm this; inspect in person or request supporting records."}`,
      origin: `${CATEGORY_LABEL[f.category]} finding · ${f.severity} priority`,
    });
  }
  for (const factor of factors.filter((x) => x.status === "unknown")) {
    const name = factor.factorId.replace(/[_-]+/g, " ");
    items.push({
      id: `factor:${factor.factorId}`,
      group: "Confirm with landlord",
      text: `Confirm ${name} for this space and request the source document or written confirmation. No evidence was found in this review.`,
      origin: "Evidence gap",
    });
  }
  for (const line of lines.filter((x) => x.status === "unknown" || x.expected === null)) {
    items.push({
      id: `cost:${line.itemId}`,
      group: "Get written quotes",
      text: `Request an itemized written quote for ${line.label}, including scope, exclusions, timing, and whether it is one-time, monthly, or annual.`,
      origin: "Unpriced cost line",
    });
  }
  return items;
}

export type DiligenceInput = { unpricedPieces: string[]; assumedArea: boolean; linkedBuilding: boolean };

/**
 * Diligence and negotiation prompts for a café scan that is NOT a confirmed listing: records, inspections, itemized
 * quotes and landlord questions. Deterministic, no LLM. Nothing here asserts a fact about the space.
 */
export function buildDiligence({ unpricedPieces, assumedArea, linkedBuilding }: DiligenceInput): ActItem[] {
  const o = (origin: string) => origin;
  const items: ActItem[] = [
    { id: "q:avail", group: "Ask the landlord or broker", text: "Is a space like this actually available, and which suite is it (suite number, rentable area, floor)? A scan or building record does not show availability.", origin: o("Scan is not a listing") },
    { id: "q:rent", group: "Ask the landlord or broker", text: "What are the asking base rent, NNN or other charges, escalations, free-rent and tenant-improvement allowance? Rent is unknown here.", origin: o("Rent unknown") },
    { id: "q:use", group: "Ask the landlord or broker", text: "Is café or food-service use permitted in the lease and zoning, and who holds the grease-trap, hood and venting rights?", origin: o("Permitted use unconfirmed") },
    { id: "q:util", group: "Ask the landlord or broker", text: "What utility capacity is in place (gas, electric service size, water, drain), and who pays for upgrades?", origin: o("Utilities unconfirmed") },
    { id: "rec:cert", group: "Records to request", text: "Certificate of occupancy, last food-service permit and health inspection for the space, plus any open code or permit violations.", origin: o("Records") },
    { id: "rec:drawings", group: "Records to request", text: "As-built drawings with dimensions, and the lease and any prior tenant-improvement scope.", origin: o("Records") },
    { id: "insp:site", group: "Inspections", text: "Walk the space with a licensed inspector or contractor: hood and exhaust path, grease trap, electrical panel, plumbing, roof, ADA access.", origin: o("A scan cannot prove hidden defects") },
    { id: "insp:measure", group: "Inspections", text: "Measure the real floor and compare it to your layout. Placed equipment is illustrative until clearances are checked on site.", origin: o("Layout is illustrative") },
  ];
  if (assumedArea) items.push({ id: "q:area", group: "Ask the landlord or broker", text: "Confirm the area you would lease. The area used here is your own assumption, not a figure on file.", origin: o("Area assumed") });
  if (!linkedBuilding) items.push({ id: "q:link", group: "Records to request", text: "Identify the building and owner for this scan; no property record is linked to it.", origin: o("No property record") });
  for (const name of unpricedPieces) {
    items.push({ id: `quote:${name}`, group: "Get itemized quotes", text: `Request an itemized written quote for ${name}, including delivery, installation, exclusions and lead time.`, origin: o("Unpriced piece in your layout") });
  }
  items.push({ id: "quote:buildout", group: "Get itemized quotes", text: "Get at least one contractor quote for fit-out, hood and install. The fit-out per sq ft here is an analyst assumption.", origin: o("Fit-out assumption") });
  return items;
}
