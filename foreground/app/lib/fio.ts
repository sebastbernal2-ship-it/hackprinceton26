// Fio, the property assistant. No model and no key: it fetches the open property's own evidence from the API and answers
// from it with a deterministic, topic-matched answerer. Every number is either read from a response (and labelled with
// the response's own status) or is a labelled estimate; nothing is called observed unless the source says so.
import { rentLabel, type Match } from "./matches";
import { alignmentView, compatibility } from "./alignment";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type FioContext = {
  triage: J | null;
  lineage: J | null;
  structure: J | null;
  total: J | null;
  horizons: J | null;
  projections: J | null;
  presence: J | null;
};

export const EMPTY_CONTEXT: FioContext = { triage: null, lineage: null, structure: null, total: null, horizons: null, projections: null, presence: null };

export const FIO_CHIPS = [
  "Does this fit Sarah's brief?",
  "What will it cost to open?",
  "How many seats could it hold?",
  "Any structure or flood hazards?",
  "What happened to past restaurants here?",
  "What does the forecast say?",
  "What should I do next?",
];

async function get(base: string, path: string): Promise<J | null> {
  try {
    // The cost and projection endpoints can take 5 to 30 s; past 12 s Fio answers from what the match already carries.
    const res = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    return res.ok ? ((await res.json()) as J) : null;
  } catch {
    return null;
  }
}

/** Fetch everything Fio can cite for one listing. A failed endpoint is null; the answerer says so instead of guessing. */
export async function loadFioContext(listingId: number, base = "", scanOnly = false): Promise<FioContext> {
  // A scan with no CoStar record has no triage, lineage, structure or presence rows: skip those requests (they would only 404).
  if (scanOnly) {
    const none = null;
    const id = encodeURIComponent(String(listingId));
    const [total, horizons, projections] = await Promise.all([get(base, `/api/property/${id}/total-cost`), get(base, `/api/horizons/${id}`), get(base, `/api/property/${id}/projections`)]);
    return { triage: none, lineage: none, structure: none, total, horizons, projections, presence: none };
  }
  const id = encodeURIComponent(String(listingId));
  const [triage, lineage, structure, total, horizons, projections, presence] = await Promise.all([
    get(base, `/api/triage/property/${id}`),
    get(base, `/api/lineage/${id}`),
    get(base, `/api/structure/${id}`),
    get(base, `/api/property/${id}/total-cost`),
    get(base, `/api/horizons/${id}`),
    get(base, `/api/property/${id}/projections`),
    get(base, `/api/presence/${id}`),
  ]);
  return { triage, lineage, structure, total, horizons, projections, presence };
}

const n0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = (v: number) => (Math.abs(v) >= 10000 ? `$${n0.format(Math.round(v / 1000))}K` : `$${n0.format(Math.round(v))}`);
const range = (lo: number, hi: number) => (Math.round(lo) === Math.round(hi) ? usd(lo) : `${usd(lo)} to ${usd(hi)}`);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const name = (m: Match) => [m.detail, m.address].filter(Boolean).join(", ") || m.address;

function fact(m: Match, re: RegExp) {
  return [...(m.facts?.property ?? []), ...(m.facts?.location ?? [])].find((r) => re.test(r.label))?.value;
}
const spaceSqft = (m: Match) => (isNum(m.spaceSquareFeet) ? m.spaceSquareFeet : null);

/** Seats: 30 sq ft per seat overall (low) to 70% dining at 15 sq ft per seat (high), the same planning rule the matcher uses. */
export function seatRange(sqft: number): [number, number] {
  return [Math.floor(sqft / 30), Math.floor((sqft * 0.7) / 15)];
}

function costAnswer(m: Match, c: FioContext) {
  const out: string[] = [];
  const t = c.total;
  if (t?.oneTime && isNum(t.oneTime.low)) {
    out.push(`Build-out (estimated): ${range(t.oneTime.low, t.oneTime.high)} one time for ${n0.format(t.squareFeet ?? spaceSqft(m) ?? 0)} sq ft, including 10 to 20% contingency. It excludes repairs and hidden defects, so the high end is not a ceiling.`);
    const rent = (t.parts ?? []).find((p: J) => p.id === "rent");
    if (rent && isNum(rent.low)) out.push(`Rent is about ${range(rent.low, rent.high)} per month (${rent.status}): ${String(rent.label).replace(/^Rent: /, "")}. This is not this suite's asking rent.`);
    const op = (t.parts ?? []).find((p: J) => p.id === "operating");
    if (op && isNum(op.low)) out.push(`Utilities and maintenance add about ${range(op.low, op.high)} per month (estimated).`);
    if (t.total && isNum(t.total.low)) out.push(`First 12 months all in: ${range(t.total.low, t.total.high)} (estimated scenario, not a quote).`);
  } else if (m.buildout && m.buildout.status !== "unknown" && isNum(m.buildout.low)) {
    out.push(`Build-out (estimated): ${range(m.buildout.low, m.buildout.high as number)} one time, ${String(m.buildout.reason).replace(/\.$/, "")}.`);
  }
  const re = rentLabel(m);
  if (!t && m.rent?.status !== "unknown" && isNum(m.rent?.low) && isNum(m.rent?.high)) out.push(`Rent (${m.rent?.status}): about ${range(m.rent.low, m.rent.high)} per month, ${String(m.rent?.reason).replace(/\.$/, "")}.`);
  else if (m.rentPerSquareFootYear !== null && !out.some((s) => s.startsWith("Rent"))) out.push(`Listing rent: ${re}.`);
  const budget = m.constraints?.find((x) => x.constraint === "budget");
  if (budget) out.push(`Against Sarah's $250,000 build-out budget: ${budget.status === "PASS" ? "inside it" : budget.status === "FAIL" ? "over it" : "cannot confirm"} (${budget.reason}).${m.buildout && isNum(m.buildout.high) && m.buildout.high > 250000 && budget.status === "PASS" ? ` Note the full build-out range above reaches ${usd(m.buildout.high)}, so the budget fit holds only at the low end of that range.` : ""}`);
  return out.length ? out.join(" ") : "No cost estimate is available for this site yet. Unknown, not zero.";
}

function seatsAnswer(m: Match) {
  const sq = spaceSqft(m);
  const src = m.spaceSource === "scan" ? "measured from the Matterport scan (observed)" : "from the CoStar listing";
  if (sq === null) return `The listing does not state the available suite size, so I cannot estimate seats. The building is ${n0.format(m.squareFeet)} sq ft overall.`;
  const [lo, hi] = seatRange(sq);
  const seatC = m.constraints?.find((x) => x.constraint === "seats");
  const fit = seatC ? ` ${seatC.status === "PASS" ? "That covers" : "That does not clearly cover"} Sarah's 24 to 40 seats.` : "";
  return `The space is ${n0.format(sq)} sq ft, ${src}. Estimated seating is ${lo} to ${hi}: 30 sq ft per seat overall at the low end, or 70% dining at 15 sq ft per seat at the high end. These are planning assumptions, not a code occupancy figure.${fit}`;
}

function hazardAnswer(m: Match, c: FioContext) {
  const out: string[] = [];
  const s = c.structure;
  if (s?.kit) {
    const k = s.kit;
    const bits = [k.yearBuilt && `built ${k.yearBuilt}${k.renovatedYear ? `, renovated ${k.renovatedYear}` : ""}`, k.material, k.buildingClass && `class ${k.buildingClass}`, k.stories && `${k.stories} stor${k.stories === 1 ? "y" : "ies"}`, k.hasSprinklers === true && "sprinklered", k.hasSprinklers === false && "no sprinklers"].filter(Boolean);
    if (bits.length) out.push(`Building (CoStar record): ${bits.join(", ")}.`);
  }
  const sc = s?.screening;
  if (sc?.flags?.length) {
    out.push(`Hazard screening tier: ${sc.tier} (seismic ${sc.tierByLens?.seismic}, flood ${sc.tierByLens?.flood}, ground ${sc.tierByLens?.geotechnical}).`);
    for (const f of sc.flags.slice(0, 3)) out.push(`${f.text} (${f.status}).`);
  } else if (s) out.push("Hazard screening has no flags for this site, which is not the same as cleared.");
  const rows = (c.triage?.fields ?? []).filter((f: J) => f.field === "clear_height_ft" || f.field === "kitchen_present" || f.field === "rooftop_units");
  const h = rows.find((f: J) => f.field === "clear_height_ft");
  if (h && isNum(h.value)) out.push(`Scan-derived clear height is about ${h.value.toFixed(1)} ft (${h.valueStatus}).`);
  const k = rows.find((f: J) => f.field === "kitchen_present");
  if (k) out.push(k.value === null || k.value === undefined ? "Whether a kitchen, hood and grease line exist is unknown: nothing in the record or scan confirms it. Ask the landlord." : `Kitchen present: ${String(k.value)} (${k.valueStatus}).`);
  out.push("This is a screening read, not an engineering or flood-insurance assessment.");
  return out.length > 1 ? out.join(" ") : "No structure or hazard data is loaded for this site. Unknown, not safe.";
}

function lineageAnswer(c: FioContext) {
  const l = c.lineage;
  if (!l) return "No tenant history is on file for this site. Unknown, not clean.";
  const cn = l.counts ?? {};
  const out: string[] = [];
  out.push(l.foodHistoryInKit ? `CoStar shows ${cn.foodTenants} food tenanc${cn.foodTenants === 1 ? "y" : "ies"} here (anonymized): ${cn.open} still open, ${cn.ended} ended${cn.clearFailure ? `, ${cn.clearFailure} flagged as a closure or bankruptcy` : ", none flagged as a closure or bankruptcy"}.` : "CoStar shows no earlier food tenants in this building.");
  if (isNum(l.medianCompletedTenureYears)) out.push(`Median finished tenancy: ${l.medianCompletedTenureYears} years (${l.medianTenureBasis}).`);
  if (l.isSecondGenerationSpace) out.push("It is a second-generation restaurant space, so some kitchen infrastructure may already exist (unconfirmed).");
  out.push(l.churnFlag ? "Churn flag: raised." : "Churn flag: not raised.");
  const km = l.marketPrior?.tenancyEndKM?.atYears;
  if (km?.["3"]) out.push(`Market context for ${l.market}: about ${Math.round(km["3"].survival * 100)}% of tenancies in comparable kit buildings are still going at 3 years (exploratory prior, not a per-site prediction).`);
  return out.join(" ");
}

function forecastAnswer(m: Match, c: FioContext) {
  const out: string[] = [];
  const cards = (c.projections?.projections ?? []).filter((p: J) => p.status === "estimated" && isNum(p.point));
  for (const p of cards.slice(0, 3)) out.push(`${p.metric} (${p.horizon}): ${n0.format(p.point)}${p.unit ? ` ${p.unit}` : ""}, ${p.kind} ${p.status} (${p.method}).`);
  const km = c.lineage?.marketPrior?.tenancyEndKM?.atYears;
  if (km) {
    const at = (y: string) => (km[y] ? `${Math.round(km[y].survival * 100)}% at ${y} yr` : null);
    out.push(`Tenancy survival in this market (observed past tenancies, exploratory prior): ${["1", "2", "3", "5"].map(at).filter(Boolean).join(", ")}.`);
    const f = c.lineage?.marketPrior?.failureCumulativeIncidence;
    if (f?.["3"]) out.push(`Clear closure within 3 years: about ${(f["3"].expected * 100).toFixed(1)}% (${(f["3"].low * 100).toFixed(1)} to ${(f["3"].high * 100).toFixed(1)}%).`);
  }
  const t = c.total;
  if (t?.monthly && isNum(t.monthly.low)) out.push(`Monthly running cost, rent plus utilities and maintenance (estimated): ${range(t.monthly.low, t.monthly.high)}.`);
  if (!c.total && m.rent && isNum(m.rent.low) && isNum(m.rent.high)) out.push(`Rent run-rate (${m.rent.status}): about ${range(m.rent.low, m.rent.high)} per month, held flat; this is not a rent forecast.`);
  const pop = (c.horizons?.rows ?? []).find((r: J) => r.key === "population_trend");
  if (pop && (Object.values(pop.cells ?? {}) as J[]).some((x: J) => x.state === "published")) out.push("A published county population projection is on the evidence board, but it carries no number I can quote here.");
  if (!cards.length) out.push("The fitted rent and foot-traffic forecast models are not built for this site, so I will not give a rent or revenue forecast. Unknown, not flat.");
  return out.join(" ");
}

function fitAnswer(m: Match) {
  const a = alignmentView(m);
  const score = compatibility(m);
  const out: string[] = [];
  if (a) {
    out.push(`It meets ${a.pass} of ${a.total} of Sarah's stated requirements${a.fail ? `, contradicts ${a.fail}` : ""}${a.unknown ? `, cannot confirm ${a.unknown}` : ""}.`);
    if (a.confirmed.length) out.push(`Confirmed: ${a.confirmed.join(", ")}${(a.estimatedItems ?? []).length ? ` (${(a.estimatedItems ?? []).join(" and ")} rest on estimates)` : ""}.`);
    if (a.unknownItems.length) out.push(`Cannot confirm: ${a.unknownItems.join(", ")}.`);
  } else out.push("No requirement check came back for this site.");
  if (score !== null) out.push(`Compatibility ${score} out of 100: a blend of requirements met and evidence readiness (${m.evidenceReadiness}%), not a prediction.`);
  const sq = spaceSqft(m);
  if (sq !== null) out.push(`Suite ${n0.format(sq)} sq ft against her 800 to 1,500.`);
  out.push("Her dealbreakers are unknown utilities, an unconfirmed lease area and an unstated permitted use. Utilities and permitted use are not confirmed by the record, so ask the landlord before a visit.");
  return out.join(" ");
}

function nextSteps(m: Match, c: FioContext) {
  const steps: string[] = [];
  steps.push("Walk the 3D scan and move the counter and seating in to see what fits.");
  const k = (c.triage?.fields ?? []).find((f: J) => f.field === "kitchen_present");
  if (!k || k.value === null || k.value === undefined) steps.push("Ask the landlord whether a hood, grease trap and gas line exist, and the permitted use in writing.");
  steps.push("Confirm the lease area and asking rent: the figures here are building rates and scan areas, not this suite's quote.");
  if (c.structure?.screening?.tier && c.structure.screening.tier !== "low") steps.push(`Order a site check for the ${c.structure.screening.tier}-tier flags (${(c.structure.screening.flags ?? []).filter((f: J) => f.severity !== "low").map((f: J) => f.lens).join(", ") || "see structure"}).`);
  if (c.total?.oneTime) steps.push(`Get contractor quotes: the build-out range is wide (${range(c.total.oneTime.low, c.total.oneTime.high)}, estimated).`);
  return `Suggested next steps: ${steps.map((s, i) => `${i + 1}. ${s}`).join(" ")}`;
}

function sizeAnswer(m: Match) {
  const sq = spaceSqft(m);
  const bld = fact(m, /^Area$/);
  return sq === null ? `The suite size is not stated. The building is ${bld ?? `${n0.format(m.squareFeet)} sq ft`}.` : `The space is ${n0.format(sq)} sq ft (${m.spaceSource === "scan" ? "measured from the scan, observed" : "CoStar listing"}) inside a ${bld ?? `${n0.format(m.squareFeet)} sq ft`} building. ${seatsAnswer(m).split(". ").slice(1).join(". ")}`;
}

const HELP = "I can answer about rent and cost, size and seats, structure and flood hazards, restaurant history, forecasts, the build-out budget, next steps, and how this fits Sarah's brief.";

/** Deterministic answer for one question about one property. Pure: all data comes from the match and the fetched context. */
export function answerFio(match: Match, c: FioContext, question: string): string {
  const q = question.toLowerCase();
  const has = (re: RegExp) => re.test(q);
  const head = `${name(match)}: `;
  if (has(/\bfit\b(?!.?out)|sarah|brief|compat|match|requirement|good for|right for|score/)) return head + fitAnswer(match);
  if (has(/next|should i|do now|what now|recommend|to do|todo|step/)) return head + nextSteps(match, c);
  if (has(/forecast|future|project|predict|trend|outlook|next year|5 year|five year|survive|surviv/)) return head + forecastAnswer(match, c);
  if (has(/histor|past|previous|former|tenant|lineage|restaurant|closed|closure|churn|fail|who was/)) return head + lineageAnswer(c);
  if (has(/hazard|struct|flood|seismic|earthquake|fema|risk|safe|roof|foundation|built|\bage\b|clay|ceiling|height|kitchen|hood|grease/)) return head + hazardAnswer(match, c);
  if (has(/seat|capacity|cover|how many/)) return head + seatsAnswer(match);
  if (has(/size|big|square|sq|foot|area/)) return head + sizeAnswer(match);
  if (has(/budget|build.?out|cost|fit.?out|open|price|total|spend|invest|cheap/)) return head + costAnswer(match, c);
  if (has(/rent|lease|month|afford/)) return head + costAnswer(match, c);
  if (has(/where|neigh|area|near|traffic|foot|worker|office|location|street/)) {
    const day = c.presence?.radii?.["0.5mi"]?.day;
    const bits = [fact(match, /^Neighborhood/), match.city, day && isNum(day.workers) ? `${n0.format(day.workers)} daytime workers within 0.5 mi (${day.status})` : null].filter(Boolean);
    return head + bits.join(". ") + ".";
  }
  if (has(/tour|matterport|3d|walk|scan/)) return head + "A Matterport scan is on file. Open the 3D tour or scope out your vision to walk it and place furniture.";
  return head + `${HELP} ${fitAnswer(match)}`;
}
