import raw from "@/data/benchmarks.json";
import { findingFor, spaceClass } from "@/lib/engine/benchmarks";
import type { Concept, Range } from "@/lib/engine/types";
import type { Layout, Op } from "@/lib/layout/types";
import type { Site } from "@/lib/sites/schema";
import { F, ZERO, addR, changeLine, floorSf, n0, rng, roomFor, text } from "./lines";
import type { AssessInput, Assessment, Change, Check, CheckId, Citation, OccupantLoad, PermitStep, SourceRef, Status } from "./types";

export * from "./types";
export { changeLine } from "./lines";

/**
 * Feasibility engine: site + structured change list (+ plan) -> the checks each change triggers.
 *
 * Ten checks: hood, grease, wall, ceiling, plumbing, restrooms, egress, electrical, gas, use.
 * A check appears only when a change triggers it. Each carries a status, a cost range, citations, the permit
 * steps it adds (from the city pack) and weeks of work.
 *
 * Cost counting. A check's cost is `counted` only when nothing else prices it:
 *   counted      wall opening, ceiling consequences, slab trenching, a missing restroom, circuits, a new gas
 *                branch, hood re-certification, change-of-occupancy design and fees
 *   not counted  items the X-Ray already carries (a missing hood, grease interceptor, ADA restroom, service
 *                upgrade) and open risks (second exit). They are shown with their range and a note.
 *
 * Time. Permits run side by side, so the longest step sets the wait; the work follows:
 *   total = longest permit + (longest job .. all jobs end to end)
 */

const O = F.occupancy;
const STATUS_RANK: Status[] = ["likely-fine", "needs-professional", "likely-blocker"];
const COOKING: Concept[] = ["quick-service", "fast-casual", "full-service"];
const POINT_OF_USE: Concept[] = ["cafe", "quick-service"];

type Unit = { low: number; high: number; source: SourceRef };
const unit = (u: Unit): Range => rng(u.low, u.high);
const usd = (u: { low: number; high: number }) => `$${n0(u.low)}-${n0(u.high)}`;
const cites = (list: readonly { code: string; text: string; source: SourceRef }[], ...codes: string[]): Citation[] =>
  list.filter((c) => codes.length === 0 || codes.includes(c.code)).map((c) => ({ code: c.code, text: c.text, source: c.source }));

const RE = {
  grease: /fryer|grill|griddle|flat.?top|range|charbroil|wok|burner|\bhood\b|cook ?line|kitchen line|pizza oven|smoker|rotisserie|full kitchen/,
  gas: /\bgas\b|fryer|range|charbroil|wok|burner|grill|griddle|flat.?top|pizza oven/,
  sinks: /sink|dish|espresso|ice machine|\bbar\b|mop/,
  plumbing: /sink|dish|espresso|ice machine|\bbar\b|restroom|bathroom|toilet|drain|mop/,
  restroom: /restroom|bathroom|toilet/,
  patio: /patio|sidewalk seating|outdoor (seating|dining)|deck/,
  blockerWall: /exterior|demising|party wall|shear|load.?bearing|column|storefront wall/,
};

/** Occupants by IBC Table 1004.5: dining at 15 net SF, kitchen at 200 gross SF, patio at 15 SF. */
export function occupantLoad(site: Site, changes: Change[]): OccupantLoad {
  const scan = site.matterport;
  const areaSf = scan?.scanOfExactSuite && scan.areaSf ? scan.areaSf : site.space.sf;
  const share = raw.diningAreaShare.value;
  const diningSf = areaSf * share;
  const kitchenSf = areaSf - diningSf;
  const patioSf = changes.filter(isPatio).reduce((t, c) => t + (c.quantities.areaSf ?? F.changeCosts.defaultPatioSf.value), 0);
  const perDining = O.diningNetSfPerPerson.value;
  const baseline = Math.ceil(diningSf / perDining) + Math.ceil(kitchenSf / O.kitchenGrossSfPerPerson.value);
  const load = baseline + Math.ceil(patioSf / perDining);
  const assembly = load > O.singleExitMaxLoad.value;
  return {
    diningSf,
    kitchenSf,
    patioSf,
    load,
    baseline,
    occupancy: assembly ? "A-2" : "B",
    exitsRequired: assembly ? 2 : 1,
    sprinklersRequired: load >= O.sprinklerLoad.value,
    basis: `${n0(diningSf)} SF dining / ${perDining} + ${n0(kitchenSf)} SF kitchen / ${O.kitchenGrossSfPerPerson.value}${
      patioSf ? ` + ${n0(patioSf)} SF patio / ${perDining}` : ""
    } = ${load} occupants (${n0(areaSf)} SF, ${share * 100}% dining).`,
  };
}

const isPatio = (c: Change) => c.kind === "exterior" && (c.involves.includes("patio") || RE.patio.test(text(c)));
const ids = (cs: Change[]) => cs.map((c) => c.id);

type Ctx = {
  site: Site;
  concept: Concept;
  changes: Change[];
  layout: Layout | null;
  ops: Op[];
  occupant: OccupantLoad;
  formerRestaurant: boolean;
  /** midpoint of the change lines, the alteration cost path-of-travel is measured against */
  alterationMid: number;
};

type Draft = Omit<Check, "id" | "label" | "triggeredBy"> | null;

function hood(x: Ctx): Draft {
  const H = F.hood;
  const finding = findingFor(x.site, "hood");
  const line = x.layout?.items.find((i) => i.type === "kitchen-line");
  const anchor = x.layout?.kitchenAnchor;
  const moved = Boolean(line && anchor && Math.hypot(line.x - anchor[0], line.y - anchor[1]) > raw.layout.relocationToleranceM.value);
  const clearance = `Hood and grease duct need ${H.clearanceIn.value} in clear of combustible framing and a path to the roof.`;

  if (finding?.status === "present" && !moved)
    return {
      status: "likely-fine",
      summary: "The space already has a Type I hood; cook under it and have it cleaned and re-certified.",
      detail: `${finding.evidence} New appliances must fit under the existing canopy and its suppression nozzles. ${clearance}`,
      cost: { range: unit(H.recertify), counted: true, note: "Cleaning, suppression inspection and air balance.", source: H.recertify.source },
      citations: cites(H.code, "NFPA 96"),
      permits: [],
      weeks: null,
    };
  if (finding?.status === "present" && moved)
    return {
      status: "needs-professional",
      summary: "Moving the cook line away from the existing hood means a new duct run through the roof.",
      detail: `The plan puts the cook line away from the hood the scan found. ${clearance} A mechanical engineer has to route the new duct.`,
      professional: "Mechanical engineer and hood contractor",
      cost: { range: unit(H.relocate), counted: false, note: "Already in the plan costs as hood relocation.", source: H.relocate.source },
      citations: cites(H.code),
      permits: ["trades", "fire", "health"],
      weeks: H.weeks,
    };
  const stories = x.site.stories ?? 1;
  const above = stories > 1 ? ` This is a ${stories}-storey building: the duct must rise through the floor${stories > 2 ? "s" : ""} above in a rated shaft, or the landlord must allow a side-wall or pollution-control exhaust.` : "";
  return {
    status: stories >= 3 ? "likely-blocker" : "needs-professional",
    summary: stories >= 3 ? "Cooking with grease needs a Type I hood, and there may be no way to duct it to the roof here." : "Cooking with grease needs a new Type I hood ducted to the roof.",
    detail: `${finding ? finding.evidence : "No hood has been confirmed in this space."} ${clearance}${above}`,
    professional: "Mechanical engineer and hood contractor",
    cost: { range: unit(H.typeI), counted: false, note: "The X-Ray already carries a hood line; this is the fuller range for a new Type I system.", source: H.typeI.source },
    citations: cites(H.code),
    permits: ["trades", "fire", "health"],
    weeks: H.weeks,
  };
}

function grease(x: Ctx): Draft {
  const G = F.greaseInterceptor;
  const finding = findingFor(x.site, "grease-trap");
  if (finding?.status === "present" && finding.confidence >= 0.7)
    return {
      status: "likely-fine",
      summary: "A grease interceptor is already in place; ask for its size and last pump-out record.",
      detail: finding.evidence,
      cost: null,
      citations: cites(G.code),
      permits: [],
      weeks: null,
    };
  const small = POINT_OF_USE.includes(x.concept);
  const cost = small ? G.underSink : G.inGround;
  return {
    status: "needs-professional",
    summary: small ? "The sinks need a grease interceptor; an under-sink unit is usually enough for this concept." : "A full kitchen needs a grease interceptor sized by the city, usually a tank in the ground outside.",
    detail: `${finding ? finding.evidence : "No grease interceptor has been confirmed."} Size and location are set by the city's grease program: under the sink ${usd(G.underSink)}, in the ground ${usd(G.inGround)}.`,
    professional: "Licensed plumber, with the city grease program",
    cost: { range: unit(cost), counted: false, note: "Shown as a risk until the existing interceptor is confirmed; the X-Ray has its own grease line.", source: cost.source },
    citations: cites(G.code),
    permits: ["grease", "trades"],
    weeks: G.weeks,
  };
}

function wall(x: Ctx, by: Change[]): Draft {
  const W = F.wallRemoval;
  let range = ZERO;
  for (const c of by) {
    const k = Math.max(1, (c.quantities.lengthFt ?? W.baseLengthFt.value) / W.baseLengthFt.value) * Math.max(1, Math.round(c.quantities.count ?? 1));
    range = addR(range, rng(W.nonBearing.low * k + W.engineer.low, W.bearing.high * k + W.engineer.high));
  }
  const hard = by.some((c) => RE.blockerWall.test(text(c)));
  return {
    status: hard ? "likely-blocker" : "needs-professional",
    summary: hard
      ? "This wall is likely structural or a fire separation. A structural engineer and the landlord must agree before anything is cut."
      : "A structural engineer is required before any wall is opened; we never assume a wall is non-structural.",
    detail: `If it is a simple partition: ${usd(W.nonBearing)} per opening. If it carries load: ${usd(W.bearing)} for shoring, a beam and posts. The engineer's visit and stamped drawing: ${usd(W.engineer)}. Wiring, ducts or pipes inside the wall are extra.`,
    professional: "Structural engineer",
    cost: { range, counted: true, note: "From a simple partition to a load-bearing wall with a beam, plus the engineer.", source: W.bearing.source },
    citations: cites(W.code),
    permits: ["building", "structural"],
    weeks: W.weeks,
  };
}

function ceiling(x: Ctx, by: Change[]): Draft {
  const K = F.ceiling;
  let range = ZERO;
  let status: Status = "needs-professional";
  const notes: string[] = [];
  for (const c of by) {
    const room = roomFor(x.site, c);
    const { sf } = floorSf(x.site, c);
    const target = c.quantities.heightFt;
    const now = room?.heightFt ?? null;
    const where = room ? room.label : "the room";
    if (target !== undefined && target < K.minHeightFt.value) {
      status = "likely-blocker";
      notes.push(`${target} ft is below the 7 ft 6 in minimum for an occupied room.`);
    } else if (target !== undefined && now !== null && target > now) {
      status = "likely-blocker";
      notes.push(`${where} measures ${now} ft in the scan, so ${target} ft is above the structure.`);
    } else if (target !== undefined && now !== null) {
      notes.push(`${where} measures ${now} ft in the scan; ${target} ft leaves a ${Math.round((now - target) * 10) / 10} ft space above the new ceiling.`);
    }
    const heads = Math.ceil(sf / K.sfPerSprinklerHead.value);
    range = addR(range, rng(heads * K.sprinklerHeadRelocation.low + sf * K.ductAndDiffusers.low, heads * K.sprinklerHeadRelocation.high + sf * K.ductAndDiffusers.high));
    notes.push(`About ${heads} sprinkler heads (one per ${K.sfPerSprinklerHead.value} SF) must move to the new ceiling at ${usd(K.sprinklerHeadRelocation)} each, and ducts, diffusers and lights follow at ${usd(K.ductAndDiffusers)}/SF.`);
  }
  if (findingFor(x.site, "hood")?.status === "present") notes.push(`Keep ${F.hood.clearanceIn.value} in between the kitchen hood and any combustible ceiling framing.`);
  return {
    status,
    summary:
      status === "likely-blocker"
        ? "That ceiling height does not work in this room."
        : "A new ceiling height moves the sprinkler heads, ducts and lights with it; a fire-sprinkler contractor has to draw it.",
    detail: notes.join(" "),
    professional: "Fire-sprinkler contractor and mechanical contractor",
    cost: { range, counted: true, note: "Sprinkler heads, ducts, diffusers and lights brought to the new ceiling. The ceiling itself is the line item.", source: K.sprinklerHeadRelocation.source },
    citations: cites(K.code),
    permits: ["building", "fire", "trades"],
    weeks: K.weeks,
  };
}

function plumbing(x: Ctx, by: Change[]): Draft {
  const P = F.plumbing;
  const stated = by.reduce((t, c) => t + (c.quantities.runFt ?? 0), 0);
  const run = stated > 0 ? { low: stated, high: stated } : { low: P.defaultRunFt.low, high: P.defaultRunFt.high };
  const range = rng(run.low * P.trenchPerFt.low + P.slabScan.low, run.high * P.trenchPerFt.high + P.slabScan.high);
  const upper = x.site.space.floor !== null && !/first|ground/i.test(x.site.space.floor);
  return {
    status: "needs-professional",
    summary: upper ? "New drains on an upper floor run through the ceiling of the tenant below; the landlord has to allow it." : "New sinks or drains away from the existing ones mean cutting a trench in the slab.",
    detail: `${stated > 0 ? `${n0(stated)} ft` : `An assumed ${run.low}-${run.high} ft`} of new drain at ${usd(P.trenchPerFt)} per ft, plus a slab scan (${usd(P.slabScan)}) before cutting. A post-tensioned slab cannot be trenched freely.`,
    professional: "Licensed plumber",
    cost: { range, counted: true, note: stated > 0 ? "Trench length as stated." : "Trench length assumed until the plumber measures it.", source: P.trenchPerFt.source },
    citations: cites(P.code),
    permits: ["trades", "health"],
    weeks: P.weeks,
  };
}

function restrooms(x: Ctx, by: Change[]): Draft {
  const R = F.restrooms;
  const { load, baseline } = x.occupant;
  const perSex = Math.ceil(load / 2);
  const required = load <= R.singleRoomMaxLoad.value ? 1 : 2 * Math.ceil(perSex / R.waterClosetPer.value);
  const lavs = Math.max(1, Math.ceil(load / R.lavatoryPer.value));
  const drawn = x.layout?.items.filter((i) => i.type === "restroom").length;
  const seen = findingFor(x.site, "restrooms")?.status === "present" ? 1 : 0;
  const have = drawn ?? seen;
  const ada = findingFor(x.site, "ada");
  const grew = load > baseline || by.some((c) => c.kind === "use");
  const short = have < required && (grew || !x.formerRestaurant);
  const cap = x.alterationMid * R.pathOfTravelShare.value;
  const count = `${load} occupants (${perSex} of each sex, one water closet per ${R.waterClosetPer.value}) need ${required} water closet${required === 1 ? "" : "s"} and ${lavs} lavatory${lavs === 1 ? "" : "s"}; ${
    drawn !== undefined ? `the plan has ${have} restroom${have === 1 ? "" : "s"}` : seen ? "the scan shows at least one restroom" : "no restroom has been confirmed"
  }.`;
  const path = cap > 0 ? ` Altering a public area also triggers path-of-travel work up to 20% of the alteration cost, about $${n0(cap)} here.` : "";
  const base = { detail: `${count}${path}`, citations: cites(R.code), weeks: R.weeks };

  if (short)
    return {
      ...base,
      status: "needs-professional",
      summary: `The occupant load calls for ${required} water closets; the space is ${required - have} short.`,
      professional: "Architect, with a plumber",
      cost: { range: rng((required - have) * R.newRestroom.low, (required - have) * R.newRestroom.high), counted: true, note: `${required - have} new accessible restroom${required - have === 1 ? "" : "s"}.`, source: R.newRestroom.source },
      permits: ["building", "trades", "accessibility"],
    };
  if (ada?.status === "present")
    return { ...base, status: "likely-fine", summary: "Restroom count and access look adequate for this load.", cost: null, permits: [], weeks: null };
  return {
    ...base,
    status: "needs-professional",
    summary: "The restroom count looks adequate, but accessibility has not been confirmed.",
    detail: `${base.detail} ${ada ? ada.evidence : "No accessible restroom or route has been confirmed."}`,
    professional: x.site.state === "CA" ? "Certified Access Specialist (CASp)" : "Registered accessibility specialist (TDLR)",
    cost: { range: unit(R.adaRetrofit), counted: false, note: "A risk until checked; the X-Ray has its own ADA restroom line.", source: R.adaRetrofit.source },
    permits: ["accessibility"],
  };
}

function egress(x: Ctx, by: Change[]): Draft {
  const o = x.occupant;
  const grew = o.load > o.baseline || by.some((c) => c.kind === "use");
  const seats = x.layout ? x.layout.items.reduce((t, i) => t + (i.type === "patio-table" ? 0 : seatsOf(i.type)), 0) : null;
  const over = seats !== null && seats > o.load;
  const rules = [
    o.exitsRequired === 2 ? `Over ${O.singleExitMaxLoad.value} occupants makes it Assembly A-2: two exits set apart, doors that swing out, panic hardware.` : `At ${O.singleExitMaxLoad.value} or fewer it stays a B occupancy and one exit is enough.`,
    o.sprinklersRequired ? `At ${O.sprinklerLoad.value} or more occupants the space must be sprinklered.` : "",
    over ? `The plan seats ${seats}, more than the ${o.load} the area allows.` : "",
  ].filter(Boolean);
  const detail = `${o.basis} ${rules.join(" ")}`;
  if (over)
    return {
      status: "likely-blocker",
      summary: `The plan seats more people than the occupant load of ${o.load}.`,
      detail,
      professional: "Architect",
      cost: null,
      citations: cites(O.code),
      permits: ["building"],
      weeks: null,
    };
  if (o.exitsRequired === 1 || (!grew && x.formerRestaurant))
    return {
      status: "likely-fine",
      summary: o.exitsRequired === 1 ? `About ${o.load} occupants: one exit is enough.` : `Occupant load stays about ${o.load}, as when it traded as a restaurant; keep both exit paths clear.`,
      detail,
      cost: null,
      citations: cites(O.code),
      permits: [],
      weeks: null,
    };
  return {
    status: "needs-professional",
    summary: `About ${o.load} occupants: an architect must confirm two exits${o.sprinklersRequired ? " and sprinklers" : ""} before the load goes up.`,
    detail,
    professional: "Architect",
    cost: { range: unit(O.secondExit), counted: false, note: "Only if a second exit has to be added.", source: O.secondExit.source },
    citations: cites(O.code),
    permits: o.sprinklersRequired ? ["building", "fire"] : ["building"],
    weeks: null,
  };
}

const SEATS: Record<string, number> = { "two-top": 2, "four-top": 4, "six-top": 6, booth: 4, "bar-stool": 1 };
const seatsOf = (type: string) => SEATS[type] ?? 0;

function electrical(x: Ctx): Draft {
  const E = F.electrical;
  const finding = findingFor(x.site, "electrical");
  const amps = COOKING.includes(x.concept) ? E.typicalAmps.restaurant : E.typicalAmps.cafe;
  const need = `A ${x.concept} kitchen typically runs on about ${amps} A at 208 V three-phase.`;
  const circuits = { range: unit(E.circuits), counted: true, note: "Circuits or a sub-panel for the added load.", source: E.circuits.source };
  if (finding?.status === "present")
    return { status: "likely-fine", summary: "The existing service looks adequate; new equipment needs its own circuits.", detail: `${finding.evidence} ${need}`, cost: circuits, citations: cites(E.code), permits: ["trades"], weeks: E.weeks };
  return {
    status: "needs-professional",
    summary: "An electrician must run a load calculation before equipment is added; the panel has not been seen.",
    detail: `${finding ? finding.evidence : "No electrical panel has been confirmed."} ${need} If the service itself must grow, that is ${usd(E.serviceUpgrade)} and a utility lead time.`,
    professional: "Licensed electrician",
    cost: circuits,
    citations: cites(E.code),
    permits: ["trades"],
    weeks: E.weeks,
  };
}

function gas(x: Ctx, by: Change[]): Draft {
  const G = F.gas;
  const lineSeen = findingFor(x.site, "kitchen-line")?.status === "present" || findingFor(x.site, "gas")?.status === "present";
  const adding = by.some((c) => c.kind !== "use");
  if (lineSeen && !adding)
    return { status: "likely-fine", summary: "Gas already serves a cook line here.", detail: "A cook line was seen in the scan, so gas is on site. Like-for-like appliances should not need a larger meter.", cost: null, citations: cites(G.code), permits: [], weeks: null };
  return {
    status: "needs-professional",
    summary: lineSeen ? "More gas appliances mean a plumber must check the meter and pipe size against the total BTU load." : "No gas service has been confirmed; a plumber and the gas utility must size a new line.",
    detail: `Pipe and meter are sized to the total connected load. A new branch, regulator and shut-offs run ${usd(G.line)}; a larger meter is the utility's work and can take weeks.`,
    professional: "Licensed plumber (gas) and the gas utility",
    cost: { range: unit(G.line), counted: lineSeen, note: lineSeen ? "New branch piping for the added appliances." : "The X-Ray has its own gas line.", source: G.line.source },
    citations: cites(G.code),
    permits: ["trades"],
    weeks: G.weeks,
  };
}

function use(x: Ctx, by: Change[]): Draft {
  const U = F.changeOfUse;
  const alcohol = x.concept === "bar" || by.some((c) => c.involves.includes("alcohol"));
  const pack = F.cityPacks[x.site.city];
  if (x.formerRestaurant && !alcohol)
    return {
      status: "likely-fine",
      summary: "It already traded as a restaurant, so the use should not change; confirm the certificate of occupancy on file.",
      detail: `A restaurant-to-${x.concept} switch stays in the same occupancy group. ${pack.note}`,
      cost: null,
      citations: cites(U.code),
      permits: ["health"],
      weeks: null,
    };
  if (x.formerRestaurant)
    return {
      status: "needs-professional",
      summary: "The use stays food service, but selling alcohol needs its own approval, and that sets the timeline.",
      detail: `${pack.steps.alcohol.label}: ${pack.steps.alcohol.weeks.low}-${pack.steps.alcohol.weeks.high} weeks. ${pack.note}`,
      professional: "Licensing consultant or attorney",
      cost: null,
      citations: cites(U.code),
      permits: ["health", "alcohol"],
      weeks: null,
    };
  return {
    status: "needs-professional",
    summary: "Nothing shows this space was ever a restaurant, so it needs a change of occupancy: drawings, plan check and a new certificate of occupancy.",
    detail: `The new use must meet today's egress, fire and plumbing rules (${x.occupant.load} occupants, ${x.occupant.occupancy}). Design and fees: ${usd(U.designAndFees)}. ${pack.note}`,
    professional: "Architect",
    cost: { range: unit(U.designAndFees), counted: true, note: "Code analysis, drawings, plan-check and certificate fees.", source: U.designAndFees.source },
    citations: cites(U.code),
    permits: alcohol ? ["building", "occupancy", "health", "alcohol"] : ["building", "occupancy", "health"],
    weeks: null,
  };
}

const LABELS: Record<CheckId, string> = {
  hood: "Kitchen hood and grease duct",
  grease: "Grease interceptor",
  wall: "Wall removal",
  ceiling: "Ceiling height",
  plumbing: "Plumbing moves",
  restrooms: "Restrooms and accessibility",
  egress: "Occupant load and exits",
  electrical: "Electrical capacity",
  gas: "Gas capacity",
  use: "Change of use",
};

const PLUMBED_ITEMS = ["bar-counter", "restroom", "kitchen-line", "prep"];

export function assess(input: AssessInput): Assessment {
  const { site } = input;
  const changes = input.changes.filter((c) => c.enabled);
  const ops = input.layoutOps ?? [];
  const useChange = [...changes].reverse().find((c) => c.kind === "use");
  const concept = useChange?.concept ?? ops.reduce<Concept | undefined>((c, op) => (op.op === "setConcept" ? op.concept : c), undefined) ?? input.brief.concept;
  const lines = changes.map((c) => changeLine(c, site));
  const occupant = occupantLoad(site, changes);
  const x: Ctx = {
    site,
    concept,
    changes,
    layout: input.layout ?? null,
    ops,
    occupant,
    formerRestaurant: spaceClass(site) === "former-restaurant",
    alterationMid: lines.reduce((t, l) => t + (l.range?.mid ?? 0), 0),
  };

  // which changes trigger which check
  const has = (c: Change, re: RegExp) => re.test(text(c));
  const built = (c: Change) => c.kind === "layout" || c.kind === "equipment" || c.kind === "exterior" || c.kind === "use";
  const layoutChanges = changes.filter((c) => c.kind === "layout");
  const opAdds = (types: string[]) => ops.some((op) => (op.op === "add" || op.op === "move") && op.type !== undefined && types.includes(op.type));
  const cookingUse = (c: Change) => c.kind === "use" && COOKING.includes(concept);

  const by: Record<CheckId, Change[]> = {
    hood: changes.filter((c) => c.involves.includes("grease-cooking") || (c.kind === "equipment" && has(c, RE.grease)) || cookingUse(c)),
    grease: changes.filter((c) => c.involves.includes("grease-cooking") || (c.kind === "equipment" && (has(c, RE.grease) || has(c, RE.sinks))) || cookingUse(c)),
    wall: changes.filter((c) => c.kind === "wall"),
    ceiling: changes.filter((c) => c.kind === "ceiling"),
    plumbing: changes.filter((c) => built(c) && c.kind !== "use" && (c.involves.includes("plumbing-fixture") || c.involves.includes("restroom") || has(c, RE.plumbing))),
    restrooms: changes.filter((c) => c.kind === "use" || c.kind === "wall" || c.kind === "storefront" || isPatio(c) || c.involves.includes("restroom") || c.involves.includes("seating") || has(c, RE.restroom)),
    egress: changes.filter((c) => c.kind === "use" || c.kind === "wall" || c.kind === "storefront" || c.kind === "layout" || isPatio(c) || c.involves.includes("seating")),
    electrical: changes.filter((c) => c.kind === "equipment" || c.involves.includes("electric-load") || cookingUse(c)),
    gas: changes.filter((c) => c.involves.includes("gas-appliance") || (c.kind === "equipment" && has(c, RE.gas)) || cookingUse(c)),
    use: changes.filter((c) => c.kind === "use" || c.involves.includes("alcohol")),
  };
  if (by.plumbing.length === 0 && layoutChanges.length && opAdds(PLUMBED_ITEMS)) by.plumbing = layoutChanges;
  if (by.hood.length === 0 && layoutChanges.length && opAdds(["kitchen-line"])) by.hood = layoutChanges;

  const rules: Record<CheckId, (x: Ctx, by: Change[]) => Draft> = { hood, grease, wall, ceiling, plumbing, restrooms, egress, electrical, gas, use };
  const checks: Check[] = [];
  for (const id of Object.keys(rules) as CheckId[]) {
    if (by[id].length === 0) continue;
    const draft = rules[id](x, by[id]);
    if (draft) checks.push({ id, label: LABELS[id], triggeredBy: ids(by[id]), ...draft });
  }
  checks.sort((a, b) => STATUS_RANK.indexOf(b.status) - STATUS_RANK.indexOf(a.status));

  // permits: from the checks, plus the changes that need one on their own
  const pack = F.cityPacks[site.city];
  const need = new Map<string, string[]>();
  const want = (step: string, who: string) => need.set(step, [...(need.get(step) ?? []), who]);
  for (const c of checks) for (const step of c.permits) want(step, c.id);
  for (const c of changes) {
    if (c.kind === "storefront") want("building", c.id);
    if (c.kind === "equipment") want("trades", c.id);
    if (isPatio(c)) want("patio", c.id);
    if (c.involves.includes("signage") || (c.kind !== "finish" && /\bsign(age)?\b/.test(text(c)))) want("sign", c.id);
  }
  const steps = pack.steps as Record<string, Omit<PermitStep, "id" | "neededBy">>;
  const permits: PermitStep[] = Object.keys(steps)
    .filter((id) => need.has(id))
    .map((id) => ({ id, ...steps[id], neededBy: [...new Set(need.get(id))] }));

  const changeCost = lines.reduce((t, l) => (l.range ? addR(t, l.range) : t), ZERO);
  const checkCost = checks.reduce((t, c) => (c.cost?.counted ? addR(t, c.cost.range) : t), ZERO);

  const W = F.changeCosts.weeks;
  const jobs: { low: number; high: number }[] = [
    ...checks.flatMap((c) => (c.weeks ? [c.weeks] : [])),
    ...changes.flatMap((c) => (c.kind === "finish" || c.kind === "storefront" || c.kind === "exterior" || c.kind === "equipment" || c.kind === "layout" ? [W[c.kind]] : [])),
  ];
  const permitWeeks = rng(Math.max(0, ...permits.map((p) => p.weeks.low)), Math.max(0, ...permits.map((p) => p.weeks.high)));
  const workWeeks = rng(Math.max(0, ...jobs.map((j) => j.low)), jobs.reduce((t, j) => t + j.high, 0));

  return {
    city: site.city,
    codeBasis: pack.codeBasis,
    cityNote: pack.note,
    lines,
    checks,
    permits,
    occupant,
    cost: { changes: changeCost, checks: checkCost, total: addR(changeCost, checkCost) },
    time: {
      permitWeeks,
      workWeeks,
      totalWeeks: addR(permitWeeks, workWeeks),
      basis: permits.length
        ? "Permits run side by side, so the longest one sets the wait; the work follows. Low assumes the jobs overlap, high that they run end to end."
        : "No permit expected. Low assumes the jobs overlap, high that they run end to end.",
    },
    worst: checks.reduce<Status>((w, c) => (STATUS_RANK.indexOf(c.status) > STATUS_RANK.indexOf(w) ? c.status : w), "likely-fine"),
  };
}
