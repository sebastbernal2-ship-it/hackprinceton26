import type { FactorCard, Match } from "./matches";

/** The "Discipline view": the same property experience, regrouped by the kind of expert who would read it. No new data, no LLM. */
export type DisciplineId = "financial" | "legal" | "structural" | "layout" | "market";
export type Dot = "ok" | "attention" | "unknown";
export type Page = "property" | "quantify";
export type ViewMode = "current" | "discipline";

export const DISCIPLINES: { id: DisciplineId; n: number; label: string; scope: string }[] = [
  { id: "financial", n: 1, label: "Financial", scope: "cost breakdown, rent, running costs, break-even, forecasts, budget" },
  { id: "legal", n: 2, label: "Legal and inspection", scope: "permitted use, permits, ADA, inspection findings, checklists" },
  { id: "structural", n: 3, label: "Structural and building", scope: "building record, hazards screening, climate, expansion" },
  { id: "layout", n: 4, label: "Layout and operations", scope: "Planner, equipment, seats, fill" },
  { id: "market", n: 5, label: "Market and history", scope: "lineage, tenancy, forecasts, neighbourhood data" },
];

/** Every panel the discipline view can host, with the page that owns it. The component renders the panels it has, in this order. */
export const PANELS: { id: string; page: Page; discipline: DisciplineId }[] = [
  { id: "cost-side", page: "property", discipline: "financial" },
  { id: "forecast-row", page: "property", discipline: "financial" },
  { id: "q-inputs", page: "quantify", discipline: "financial" },
  { id: "q-costs", page: "quantify", discipline: "financial" },
  { id: "q-running", page: "quantify", discipline: "financial" },
  { id: "q-money-details", page: "quantify", discipline: "financial" },
  { id: "legal-permits", page: "property", discipline: "legal" },
  { id: "inspection", page: "property", discipline: "legal" },
  { id: "q-legal-permits", page: "quantify", discipline: "legal" },
  { id: "building", page: "property", discipline: "structural" },
  { id: "growth", page: "property", discipline: "structural" },
  { id: "structure", page: "property", discipline: "structural" },
  { id: "triage", page: "property", discipline: "structural" },
  { id: "q-structure", page: "quantify", discipline: "structural" },
  { id: "planner", page: "property", discipline: "layout" },
  { id: "layout", page: "property", discipline: "layout" },
  { id: "q-layout", page: "quantify", discipline: "layout" },
  { id: "q-equipment", page: "quantify", discipline: "layout" },
  { id: "projections", page: "property", discipline: "market" },
  { id: "data-streams", page: "property", discipline: "market" },
  { id: "evidence", page: "property", discipline: "market" },
  { id: "q-market", page: "quantify", discipline: "market" },
];

/** Panel ids for one discipline on one page, in order, limited to the panels the page actually has. */
export function panelsFor(page: Page, discipline: DisciplineId, available: Iterable<string>): string[] {
  const have = new Set(available);
  return PANELS.filter((p) => p.page === page && p.discipline === discipline && have.has(p.id)).map((p) => p.id);
}

export function parseMode(raw: string | null | undefined): ViewMode {
  return raw === "discipline" ? "discipline" : "current";
}

// ---- Legal and permits: deterministic, labelled, driven by the concept and site facts ----

export type LegalStatus = "unknown" | "estimated" | "to-confirm";
export type LegalItem = { id: string; title: string; status: LegalStatus; text: string; ask: string };
export type SiteFacts = { concept: string; city: string; sqft: number | null; seats: number | null; yearBuilt: number | null; hasSprinklers: boolean | null; permittedUse: string | null };

const FOOD = /caf[eé]|coffee|restaurant|bakery|bar\b|juice|yogurt|food|kitchen|diner|pizza|espresso/i;
export const isFoodConcept = (concept: string): boolean => FOOD.test(concept);

function healthAuthority(city: string): string {
  if (/houston/i.test(city)) return "City of Houston Health Department (food establishment permit)";
  if (/los angeles|, ?ca\b/i.test(city)) return "LA County Public Health (food facility permit and plan check)";
  return "the local health department";
}

/** Permit and legal prompts. "estimated" items start with DEMO ESTIMATE: a typical-case assumption, never an observed requirement. */
export function legalItems(s: SiteFacts): LegalItem[] {
  const food = isFoodConcept(s.concept);
  const where = s.city || "the city";
  const items: LegalItem[] = [
    {
      id: "zoning", title: "Zoning and permitted use", status: s.permittedUse ? "to-confirm" : "unknown",
      text: s.permittedUse ? `Listing says: ${s.permittedUse}. Not verified against the zoning code.` : "No zoning or permitted-use record was found for this space. Unknown, not allowed or disallowed.",
      ask: `The landlord in writing, then the ${where} planning department`,
    },
    {
      id: "change-of-use", title: "Building permit and change of use", status: "estimated",
      text: food
        ? `DEMO ESTIMATE: moving from retail or office to ${s.concept || "food service"} usually needs a change-of-use or tenant-improvement building permit if the prior use was not food service. Whether it applies here is not known.`
        : "DEMO ESTIMATE: a tenant-improvement permit is usually needed for any build-out; change of use depends on the prior use, which is not known here.",
      ask: "The city permit office (pre-application meeting) and the broker for the prior use",
    },
  ];
  if (food) {
    items.push(
      { id: "health", title: "Health permit and plan review", status: "to-confirm", text: `DEMO ESTIMATE: a food business generally needs a plan review before build-out and a permit before opening, issued by ${healthAuthority(where)}. Fees and lead time are not estimated here.`, ask: healthAuthority(where) },
      { id: "grease", title: "Grease trap, hood and ventilation", status: "unknown", text: "Whether a grease interceptor and a Type I hood already exist is not in the evidence. Cooking with grease needs both; coffee-only service may not.", ask: "The landlord (as-built drawings) and a mechanical contractor" },
    );
  }
  items.push(
    { id: "ada", title: "ADA accessibility", status: "to-confirm", text: `DEMO ESTIMATE: public entrance, route, restroom and counter heights must meet ADA${s.seats ? ` for the planned ${s.seats} seats` : ""}. Not verified on site.`, ask: "An accessibility consultant or the city plan reviewer" },
    {
      id: "fire", title: "Fire and sprinkler", status: s.hasSprinklers === null ? "unknown" : "to-confirm",
      text: s.hasSprinklers === null ? "Sprinkler status and the occupant load limit are not on file." : `Record says sprinklers: ${s.hasSprinklers ? "yes" : "no"}. Occupant load and fire alarm still need the fire marshal.`,
      ask: "The fire marshal and the landlord's building engineer",
    },
    { id: "signage", title: "Signage", status: "unknown", text: "Sign size, lighting and any landlord criteria are not known. Many cities need a separate sign permit.", ask: "The landlord (sign criteria) and the city sign office" },
    { id: "lease", title: "Lease terms to verify", status: "to-confirm", text: "Permitted use clause, exclusives, who pays for base-building code upgrades, tenant-improvement allowance, assignment, and the real lease area.", ask: "The broker, then your lawyer" },
  );
  if (s.yearBuilt !== null && s.yearBuilt < 1992) items.push({ id: "pre-ada", title: "Pre-ADA building", status: "estimated", text: `DEMO ESTIMATE: built ${s.yearBuilt}, before the 1992 ADA effective date, so accessibility upgrades may be needed.`, ask: "An accessibility consultant" });
  return items;
}

export const brokerQuestions = (items: LegalItem[]): string[] => items.filter((i) => i.status !== "estimated" || i.id === "change-of-use").map((i) => `${i.title}: ${i.ask}`);

// ---- Verdicts ----

export type Signals = {
  /** Budget comparison from Quantify (null when unavailable). */
  budgetTone?: "under" | "tight" | "over" | "unknown" | null;
  paybackMonths?: number | null;
  hasRent?: boolean;
  hasAllIn?: boolean;
  seats?: number | null;
  equipmentCount?: number;
  structureTier?: string | null;
  yearBuilt?: number | null;
  legal: LegalItem[];
  factors: Pick<FactorCard, "factorId" | "status">[];
  scanOnly?: boolean;
};
export type Verdict = { dot: Dot; text: string };

/** One-line verdict per discipline. Always labelled: estimates say so, gaps say "unknown", and "ok" is only ever "no red flag in what we have". */
export function verdicts(s: Signals): Record<DisciplineId, Verdict> {
  const open = s.legal.filter((i) => i.status !== "estimated").length;
  const known = s.factors.filter((f) => f.status !== "unknown").length;
  const financial: Verdict = !s.hasAllIn && !s.hasRent && s.budgetTone == null
    ? { dot: "unknown", text: "Unknown: no cost estimate yet. Open Quantify with a seat count." }
    : s.budgetTone === "over" ? { dot: "attention", text: "Estimated all-in cost is over budget." }
    : s.paybackMonths != null && s.paybackMonths > 36 ? { dot: "attention", text: `Estimated break-even ${s.paybackMonths} months, beyond 3 years.` }
    : s.budgetTone === "tight" ? { dot: "attention", text: "Estimated all-in cost is close to the budget." }
    : s.budgetTone === "under" ? { dot: "ok", text: `Estimated within budget${s.paybackMonths != null ? `, break-even about ${s.paybackMonths} months` : ""}.` }
    : { dot: "unknown", text: "Estimates exist. Open Quantify with a seat count and a budget to judge them." };
  const legal: Verdict = s.legal.some((i) => i.id === "zoning" && i.status === "unknown")
    ? { dot: "attention", text: `Permitted use unknown. ${open} legal items to confirm; none are verified.` }
    : { dot: "attention", text: `${open} legal items to confirm with the landlord and the city.` };
  const age = s.yearBuilt != null ? new Date().getFullYear() - s.yearBuilt : null;
  const structural: Verdict = s.structureTier === "elevated" ? { dot: "attention", text: "Hazard screening is elevated on at least one lens (screening, not an engineering opinion)." }
    : age !== null && age > 50 ? { dot: "attention", text: `Built ${s.yearBuilt}; older buildings need an inspection (estimated).` }
    : s.structureTier || age !== null ? { dot: "ok", text: `No red flag in the screening${s.structureTier ? ` (${s.structureTier})` : ""}${s.yearBuilt ? `, built ${s.yearBuilt}` : ""}. Not an inspection.` }
    : { dot: "unknown", text: s.scanOnly ? "Unknown: a scan has no building record linked. Hazards and year built are not on file." : "Unknown: no building record or hazard screening loaded." };
  const layout: Verdict = (s.equipmentCount ?? 0) > 0 ? { dot: "ok", text: `${s.equipmentCount} pieces placed${s.seats ? `, ${s.seats} seats` : ""} (estimated, from your Planner).` } : { dot: "unknown", text: "Unknown: nothing placed yet. Use the Planner to set seats and equipment." };
  const market: Verdict = known > 0 ? { dot: "ok", text: `${known} evidence cards found (observed, derived or estimated; each says which).` } : { dot: "unknown", text: "Unknown: no neighbourhood evidence is built for this space." };
  return { financial, legal, structural, layout, market };
}

// ---- Site facts from a match ----

const factValue = (m: Pick<Match, "facts">, re: RegExp): string | null => [...(m.facts?.property ?? []), ...(m.facts?.location ?? [])].find((r) => re.test(r.label))?.value ?? null;

export function siteFacts(m: Match, concept: string, seats: number | null, kit?: { yearBuilt?: number | null; hasSprinklers?: boolean | null }): SiteFacts {
  const sprink = factValue(m, /sprinkler/i);
  const year = factValue(m, /year built/i);
  return {
    concept, city: m.city, sqft: m.spaceSquareFeet || m.squareFeet || null, seats,
    yearBuilt: kit?.yearBuilt ?? (year && /\d{4}/.test(year) ? Number(year.match(/\d{4}/)![0]) : null),
    hasSprinklers: kit?.hasSprinklers ?? (sprink ? /^(yes|true)/i.test(sprink) : null),
    permittedUse: factValue(m, /zoning|permitted use/i),
  };
}

/** The most specific food word in the answers, in priority order (a "yogurt shop" owner opening a "cafe" gets "cafe"). */
export function conceptFromBrief(brief: { answer: string }[]): string {
  const text = brief.map((b) => b.answer).join(" ").toLowerCase();
  return ["cafe", "café", "coffee", "restaurant", "bakery", "bar", "pizza", "diner", "juice", "yogurt", "food", "kitchen"].find((w) => new RegExp(`\\b${w}`).test(text)) ?? "";
}
