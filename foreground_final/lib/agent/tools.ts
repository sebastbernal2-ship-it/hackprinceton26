import { tool } from "langchain";
import { z } from "zod";
import { analyzeSite } from "@/lib/engine";
import type { Concept, OwnerBrief, SiteAnalysis } from "@/lib/engine/types";
import { loadSites } from "@/lib/sites/load";
import type { Site } from "@/lib/sites/schema";
import { customEvent, type AgentEvent, type RankedSite, type SiteNumbers } from "./events";

/**
 * Agent tools. They read only the local site cache and the pure engine: no network.
 * Every tool returns compact JSON with a one-line `summary` the notebook shows.
 * The owner's brief is bound when the toolkit is created, so the model cannot drift from it.
 */

const usd = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const round = (n: number, step = 100) => Math.round(n / step) * step;
const clip = (s: string | null | undefined, n: number) => (!s ? "" : s.length > n ? `${s.slice(0, n - 1)}…` : s);

type Writer = (chunk: unknown) => void;
function emit(config: unknown, event: AgentEvent) {
  const writer = (config as { writer?: Writer } | undefined)?.writer;
  try {
    writer?.(customEvent(event));
  } catch {
    // streaming is best-effort; a tool result must never fail because nobody is listening
  }
}

/** Rough dining+kitchen area a concept needs per seat, used only for the on-paper screen. */
const SF_PER_SEAT: Record<Concept, [min: number, max: number]> = {
  "quick-service": [18, 45],
  "fast-casual": [22, 55],
  "full-service": [28, 70],
  cafe: [20, 55],
  bar: [20, 60],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})/.exec(iso) : null;
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}

/**
 * What happened in the suite for lease, in words that match the CoStar record: a tenant that moved out
 * did not "fail"; only an outcome of closed (closed location or bankruptcy) is called closed.
 */
export function sameSuiteStory(site: Site) {
  const gone = site.tenantHistory.filter((t) => t.isFood && t.sameSuite && !t.current);
  const closed = gone.filter((t) => t.outcome === "closed");
  const tenants = gone.map((t) => ({
    name: t.name,
    outcome: t.outcome === "closed" ? "closed" : t.outcome === "moved" ? "moved out" : "left (reason not recorded)",
    left: monthYear(t.moveOut),
    years: t.years,
  }));
  let wording = "No food tenant has left this suite on record.";
  if (gone.length > 0) {
    const years = gone.map((t) => t.years).filter((y): y is number => y !== null);
    const longest = years.length === gone.length ? Math.max(...years) : null;
    const span = longest === null ? "" : longest <= 2 ? " within 2 years" : longest <= 3 ? " within 3 years" : "";
    const closedPart = closed.map((t) => `${t.name} closed${monthYear(t.moveOut) ? ` in ${monthYear(t.moveOut)}` : ""}`).join("; ");
    wording =
      `${gone.length} food tenant${gone.length === 1 ? "" : "s"} left this suite${span}` +
      (closedPart ? `; ${closedPart}` : "; none is recorded as closed") + ".";
  }
  return { left: gone.length, closed: closed.length, tenants, wording };
}

export type Candidate = {
  siteId: string;
  address: string;
  city: string;
  sf: number;
  rentPerSfYr: number | null;
  serviceType: string | null;
  annualBaseRentUsd: number | null;
  secondGen: boolean;
  listingMentions: string[];
  sizeFit: "fits" | "tight" | "oversized" | "unknown";
  paperRank: number;
  paperNote: string;
};

export type SiteDigest = {
  siteId: string;
  address: string;
  summary: string;
  buildout: { lowUsd: number; midUsd: number; highUsd: number; overBudget: boolean | null; budgetUsd: number | null; savedByExistingUsd: number };
  costLines: { label: string; status: "needed" | "saved" | "maybe"; lowUsd: number; highUsd: number; why: string }[];
  seats: { fits: number; basis: string };
  occupancyUsdPerYear: number;
  breakeven: { salesNeededUsd: number; coversPerDay: number; turnsPerDay: number; verdict: string; avgCheckUsd: number };
  threeYear: { slowProfitUsd: number; baseProfitUsd: number; strongProfitUsd: number; basePaybackYears: number | null; verdict: string };
  graveyard: {
    foodTenants: number;
    /** food tenants at the address recorded as closed (closed location or bankruptcy) */
    closedAtAddress: number;
    /** food tenants that left the suite for lease, for any reason */
    leftThisSuite: number;
    /** of those, the ones recorded as closed */
    closedInThisSuite: number;
    sameSuiteWording: string;
    medianYears: number | null;
    summary: string;
  };
  trend: { rating: string; signals: string[] };
  timeToOpenMonths: { low: number; high: number };
  score: { score: number; reasons: string[]; flags: string[] };
};

export function digestAnalysis(site: Site, a: SiteAnalysis): SiteDigest {
  const x = a.xray;
  const base = a.scenarios.scenarios.base;
  const suite = sameSuiteStory(site);
  const over = x.overBudget === true ? "over budget" : x.overBudget === false ? "within budget" : "no budget given";
  return {
    siteId: site.id,
    address: site.address,
    summary:
      `${site.address}: build-out ${usd(x.total.low)}–${usd(x.total.high)} (${over}); fits ${a.seats.seats} seats; ` +
      `needs ${a.breakeven.turnsPerDay.toFixed(1)} turns/day to carry rent (${a.breakeven.verdict}); ` +
      `base case ${usd(base.annualProfitUsd)}/yr; score ${Math.round(a.score.score)}`,
    buildout: {
      lowUsd: round(x.total.low), midUsd: round(x.total.mid), highUsd: round(x.total.high),
      overBudget: x.overBudget, budgetUsd: a.brief.budgetUsd ?? null, savedByExistingUsd: round(x.saved.mid),
    },
    costLines: x.lines.map((l) => ({
      label: l.label, status: l.status, lowUsd: round(l.range.low), highUsd: round(l.range.high), why: clip(l.reason, 140),
    })),
    seats: { fits: a.seats.seats, basis: clip(a.seats.basis, 120) },
    occupancyUsdPerYear: round(a.occupancy.annualUsd.mid),
    breakeven: {
      salesNeededUsd: round(a.breakeven.salesNeededUsd, 1000),
      coversPerDay: Math.round(a.breakeven.coversPerDay),
      turnsPerDay: Math.round(a.breakeven.turnsPerDay * 10) / 10,
      verdict: a.breakeven.verdict,
      avgCheckUsd: a.breakeven.avgCheckUsd,
    },
    threeYear: {
      slowProfitUsd: round(a.scenarios.scenarios.slow.annualProfitUsd, 1000),
      baseProfitUsd: round(base.annualProfitUsd, 1000),
      strongProfitUsd: round(a.scenarios.scenarios.strong.annualProfitUsd, 1000),
      basePaybackYears: base.paybackYears === null ? null : Math.round(base.paybackYears * 10) / 10,
      verdict: a.scenarios.verdict,
    },
    graveyard: {
      foodTenants: a.graveyard.foodTenants, closedAtAddress: a.graveyard.closedHere,
      leftThisSuite: suite.left, closedInThisSuite: suite.closed, sameSuiteWording: suite.wording,
      medianYears: a.graveyard.medianYears, summary: a.graveyard.summary,
    },
    trend: { rating: a.trend.rating, signals: a.trend.signals.slice(0, 4).map((s) => `${s.label}: ${s.direction} (${clip(s.detail, 80)})`) },
    timeToOpenMonths: { low: a.timeToOpen.months.low, high: a.timeToOpen.months.high },
    score: { score: Math.round(a.score.score), reasons: a.score.reasons.slice(0, 4), flags: a.score.flags.slice(0, 4) },
  };
}

export function numbersFrom(site: Site, a: SiteAnalysis): SiteNumbers {
  return {
    address: site.address,
    city: site.city,
    sf: site.space.sf,
    rentPerSfYr: site.space.rentPerSfYr,
    buildoutUsd: { low: round(a.xray.total.low), mid: round(a.xray.total.mid), high: round(a.xray.total.high) },
    overBudget: a.xray.overBudget,
    seats: a.seats.seats,
    turnsPerDay: Math.round(a.breakeven.turnsPerDay * 10) / 10,
    breakevenVerdict: a.breakeven.verdict,
    baseProfitUsd: round(a.scenarios.scenarios.base.annualProfitUsd, 1000),
    sameSuiteFailures: a.graveyard.sameSuiteFailures,
    sameSuiteClosed: sameSuiteStory(site).closed,
    sameSuiteWording: sameSuiteStory(site).wording,
    trend: a.trend.rating,
    score: Math.round(a.score.score),
  };
}

const AnalyzeOverrides = z.object({
  seats: z.number().int().min(4).max(400).optional().describe("What-if: seats to plan for instead of the owner's number"),
  concept: z.enum(["quick-service", "fast-casual", "full-service", "cafe", "bar"]).optional().describe("What-if: a different service style"),
});

export type Toolkit = ReturnType<typeof createToolkit>;

export function createToolkit(brief: OwnerBrief, opts: { sites?: Site[] } = {}) {
  const sites = opts.sites ?? loadSites();
  const byId = new Map(sites.map((s) => [s.id, s]));
  const cache = new Map<string, SiteAnalysis>();

  function analysis(site: Site, overrides: Partial<OwnerBrief> = {}): SiteAnalysis {
    const b = { ...brief, ...overrides };
    const key = `${site.id}|${b.concept}|${b.seats ?? ""}|${b.budgetUsd ?? ""}`;
    let a = cache.get(key);
    if (!a) {
      a = analyzeSite(site, b);
      cache.set(key, a);
    }
    return a;
  }

  /** Engine numbers for the owner's own brief; undefined when the site is unknown or the engine fails. */
  function numbers(siteId: string): SiteNumbers | undefined {
    const site = byId.get(siteId);
    if (!site) return undefined;
    try {
      return numbersFrom(site, analysis(site));
    } catch {
      return undefined;
    }
  }

  function unknownSite(siteId: string) {
    return JSON.stringify({ error: `Unknown siteId ${siteId}. Valid ids: ${[...byId.keys()].join(", ")}`, summary: `No site ${siteId}` });
  }

  /** Listing-only screen: what a broker flyer would tell you, before anyone looks inside. */
  function searchCandidates(filter: { city?: string; minSf?: number; maxSf?: number; maxRentPerSfYr?: number } = {}): Candidate[] {
    const city = filter.city ?? brief.city;
    const [perMin, perMax] = SF_PER_SEAT[brief.concept];
    const wantMin = brief.seats ? brief.seats * perMin : undefined;
    const wantMax = brief.seats ? brief.seats * perMax : undefined;
    const scored = sites
      .filter((s) => !city || s.city === city)
      .filter((s) => (filter.minSf ? s.space.sf >= filter.minSf : true))
      .filter((s) => (filter.maxSf ? s.space.sf <= filter.maxSf : true))
      .filter((s) => (filter.maxRentPerSfYr && s.space.rentPerSfYr !== null ? s.space.rentPerSfYr <= filter.maxRentPerSfYr : true))
      .map((s) => {
        const kw = s.space.restaurantKeywords;
        const text = `${s.space.notes ?? ""} ${kw.join(" ")}`.toLowerCase();
        const secondGen = /second[- ]gen|2nd[- ]gen|restaurant|pizzeria|kitchen/.test(text) || s.space.spaceType === "Relet" && kw.length > 0;
        let sizeFit: Candidate["sizeFit"] = "unknown";
        if (wantMin !== undefined && wantMax !== undefined) {
          sizeFit = s.space.sf < wantMin ? "tight" : s.space.sf > wantMax ? "oversized" : "fits";
        }
        const rent = s.space.rentPerSfYr;
        // On-paper appeal: second-gen and listing promises count for a lot, rent per SF for a little.
        let paper = 0;
        if (secondGen) paper += 3;
        if (/hood|vent/.test(text)) paper += 2;
        if (/grease/.test(text)) paper += 1;
        if (/move-in|turn-?key|built/.test(text)) paper += 1;
        if (sizeFit === "fits") paper += 2;
        if (sizeFit === "oversized") paper -= 1;
        if (rent !== null) paper += rent <= 20 ? 2 : rent <= 30 ? 1 : rent > 45 ? -1 : 0;
        const mentions = ["hood", "grease", "patio", "bar", "corner", "drive"].filter((k) => text.includes(k));
        return { site: s, paper, secondGen, sizeFit, mentions };
      })
      .sort((a, b) => b.paper - a.paper || a.site.id.localeCompare(b.site.id));
    return scored.map(({ site: s, secondGen, sizeFit, mentions }, i) => ({
      siteId: s.id,
      address: s.address,
      city: s.city,
      sf: s.space.sf,
      rentPerSfYr: s.space.rentPerSfYr,
      serviceType: s.space.serviceType,
      annualBaseRentUsd: s.space.rentPerSfYr === null ? null : Math.round(s.space.rentPerSfYr * s.space.sf),
      secondGen,
      listingMentions: mentions,
      sizeFit,
      paperRank: i + 1,
      paperNote: clip(s.space.notes ?? s.headline ?? "", 160),
    }));
  }

  function inspect(site: Site) {
    const food = site.tenantHistory.filter((t) => t.isFood);
    const gone = food.filter((t) => !t.current);
    return {
      siteId: site.id,
      summary:
        `${site.address}: ${site.space.sf.toLocaleString("en-US")} SF at ` +
        `${site.space.rentPerSfYr === null ? "unquoted rent" : `$${site.space.rentPerSfYr}/SF/yr ${site.space.serviceType ?? ""}`.trim()}; ` +
        `${site.findings.length} findings; ${food.length} past or current food tenants`,
      costar: {
        address: `${site.address}, ${site.city}, ${site.state}`,
        propertyType: site.propertySubtype ?? site.propertyType,
        yearBuilt: site.yearBuilt,
        yearRenovated: site.yearRenovated ?? null,
        suite: site.space.suite,
        sf: site.space.sf,
        rentPerSfYr: site.space.rentPerSfYr,
        serviceType: site.space.serviceType,
        spaceType: site.space.spaceType,
        availableOn: site.space.availableOn,
        listingNotes: clip(site.space.notes, 320),
        otherSuites: site.otherSpaces.slice(0, 4).map((o) => ({ suite: o.suite, sf: o.sf, rentPerSfYr: o.rentPerSfYr })),
        lastSale: site.sales.at(-1) ?? null,
      },
      findings: site.findings.map((f) => ({
        kind: f.kind, status: f.status, confidence: f.confidence, evidence: clip(f.evidence, 160), source: f.source,
      })),
      notChecked: (["hood", "grease-trap", "restrooms"] as const).filter((k) => !site.findings.some((f) => f.kind === k)),
      tenantHistory: {
        foodTenants: food.length,
        thisSuite: sameSuiteStory(site),
        thisSuiteCurrent: food.filter((t) => t.sameSuite && t.current).map((t) => t.name),
        shortLived: gone.filter((t) => t.years !== null && t.years < 3).map((t) => `${t.name} (${t.years} yr)`),
        longestRunning: [...food].sort((a, b) => (b.years ?? 0) - (a.years ?? 0)).slice(0, 2).map((t) => `${t.name} (${t.years} yr${t.current ? ", still open" : ""})`),
        closedOrBankruptAtAddress: food.filter((t) => t.outcome === "closed").map((t) => t.name),
        note: "Only tenants listed as closed may be described as closed. A tenant that moved out or left did not fail.",
      },
      inside: site.matterport
        ? {
            scanOfExactSuite: site.matterport.scanOfExactSuite,
            hasDefurnishedView: site.matterport.defurnishedViewId !== null,
            rooms: site.matterport.rooms.slice(0, 8).map((r) => `${r.label}${r.areaSf ? ` ${Math.round(r.areaSf)} SF` : ""}`),
            description: clip(site.matterport.description, 200),
          }
        : null,
      above: site.aerial
        ? { parkingSpaces: site.aerial.parkingSpaces ?? null, vehicleCount: site.aerial.vehicleCount ?? null, patioCandidateSf: site.aerial.patioCandidateSf ?? null }
        : null,
      neighborhood: { ...site.neighborhood, sources: undefined },
    };
  }

  function compare(siteIds: string[]) {
    const rows = siteIds.flatMap((id) => {
      const site = byId.get(id);
      if (!site) return [];
      const n = numbersFrom(site, analysis(site));
      return [{ siteId: id, ...n }];
    });
    rows.sort((a, b) => b.score - a.score);
    const within = rows.filter((r) => r.overBudget !== true);
    const cheapest = [...rows].sort((a, b) => a.buildoutUsd.mid - b.buildoutUsd.mid)[0];
    const easiest = [...rows].sort((a, b) => a.turnsPerDay - b.turnsPerDay)[0];
    return {
      summary:
        rows.length === 0
          ? "Nothing to compare"
          : `${rows.length} sites compared: ${within.length} within budget; cheapest build-out ${cheapest.address} (${usd(cheapest.buildoutUsd.mid)}); ` +
            `easiest break-even ${easiest.address} (${easiest.turnsPerDay} turns/day)`,
      byEngineScore: rows,
      overBudget: rows.filter((r) => r.overBudget === true).map((r) => r.siteId),
      breakevenUnlikely: rows.filter((r) => r.breakevenVerdict === "unlikely").map((r) => r.siteId),
      tenantsLeftThisSuite: rows.filter((r) => r.sameSuiteFailures > 0).map((r) => ({ siteId: r.siteId, wording: r.sameSuiteWording })),
    };
  }

  /** Deterministic ranking by engine score, used when the planner ends without submitting one. */
  function fallbackRanking(limit = 5): RankedSite[] {
    const rows = searchCandidates().flatMap((c) => {
      const n = numbers(c.siteId);
      return n ? [{ siteId: c.siteId, n }] : [];
    });
    rows.sort((a, b) => b.n.score - a.n.score);
    return rows.slice(0, limit).map(({ siteId, n }, i) => ({
      siteId,
      rank: i + 1,
      oneLineReason: `Build-out about ${usd(n.buildoutUsd.mid)}, ${n.turnsPerDay} turns/day to carry rent (${n.breakevenVerdict}).`,
      topRisk: n.overBudget ? "Build-out estimate is over budget." : n.sameSuiteFailures > 0 ? n.sameSuiteWording : `Break-even is ${n.breakevenVerdict}.`,
      numbers: n,
    }));
  }

  const searchSites = tool(
    async (input) => {
      const candidates = searchCandidates(input);
      return JSON.stringify({
        summary: `${candidates.length} available spaces${input.city ?? brief.city ? ` in ${input.city ?? brief.city}` : ""}, ranked on listing facts only`,
        note: "paperRank is how the listings look on paper (second-gen, rent, size). Nothing here has been checked inside the space yet.",
        candidates,
      });
    },
    {
      name: "search_sites",
      description:
        "Search the available restaurant-suitable spaces (12 total, Houston and Los Angeles). Filters default to the owner's brief. " +
        "Returns compact candidates ranked on listing facts only (paperRank).",
      schema: z.object({
        city: z.enum(["Houston", "Los Angeles"]).optional(),
        minSf: z.number().optional(),
        maxSf: z.number().optional(),
        maxRentPerSfYr: z.number().optional(),
      }),
    },
  );

  const inspectSite = tool(
    async ({ siteId }) => {
      const site = byId.get(siteId);
      return site ? JSON.stringify(inspect(site)) : unknownSite(siteId);
    },
    {
      name: "inspect_site",
      description:
        "Facts for one site: CoStar listing and building facts, X-Ray findings from the 3D scan and listing notes (hood, grease trap, prior use), " +
        "tenant history at the address, and what the scan and aerial show.",
      schema: z.object({ siteId: z.string() }),
    },
  );

  const analyzeSiteTool = tool(
    async ({ siteId, whatIf }, config) => {
      const site = byId.get(siteId);
      if (!site) return unknownSite(siteId);
      emit(config, {
        type: "tool", id: `xray-${siteId}`, name: "analyze_site", args: { siteId }, status: "progress",
        summary: `Pricing the build-out and break-even for ${site.address}`, siteId, agent: "site-inspector",
      });
      try {
        const digest = digestAnalysis(site, analysis(site, whatIf ?? {}));
        return JSON.stringify(whatIf && Object.keys(whatIf).length ? { ...digest, whatIf } : digest);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: `Engine failed for ${siteId}: ${message}`, summary: `Could not price ${site.address}` });
      }
    },
    {
      name: "analyze_site",
      description:
        "Run the Hidden-Cost X-Ray and money model for one site against the owner's brief: build-out cost lines with low/high ranges, " +
        "seats the space fits, break-even (covers and table turns per day), slow/base/strong 3-year profit, address graveyard, block trend, score. " +
        "Optional whatIf re-runs it with different seats or service style.",
      schema: z.object({ siteId: z.string(), whatIf: AnalyzeOverrides.optional() }),
    },
  );

  const compareSites = tool(
    async ({ siteIds }) => {
      try {
        return JSON.stringify(compare(siteIds));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: `Engine failed: ${message}`, summary: "Could not compare sites" });
      }
    },
    {
      name: "compare_sites",
      description: "Side-by-side engine numbers for several sites, sorted by engine score, with the sites that are over budget, unlikely to break even, or have had food tenants leave the same suite called out.",
      schema: z.object({ siteIds: z.array(z.string()).min(2).max(8) }),
    },
  );

  const recordDecision = tool(
    async ({ siteId, action, reason, finding }, config) => {
      if (!byId.has(siteId)) return unknownSite(siteId);
      const n = numbers(siteId);
      emit(config, { type: "decision", siteId, action, reason: clip(reason, 400), ...(finding ? { finding: clip(finding, 80) } : {}), ...(n ? { numbers: n } : {}) });
      return JSON.stringify({ summary: `Recorded: ${action} ${byId.get(siteId)!.address}` });
    },
    {
      name: "record_decision",
      description:
        "Tell the owner about a change of mind, the moment you make it: keep a site, drop it, or move it up or down (rerank) versus how it looked on paper. " +
        "The reason must name the finding and its number.",
      schema: z.object({
        siteId: z.string(),
        action: z.enum(["keep", "drop", "rerank"]),
        reason: z.string().describe("One plain sentence for the owner, number first. Example: '$210k build-out against a $150k budget: there is no hood and a new one runs $40k–$90k.'"),
        finding: z.string().optional().describe("The finding that drove it, e.g. 'over budget', 'no hood', '2 tenants left this suite', 'rent too high for 40 seats'"),
      }),
    },
  );

  const submitRanking = tool(
    async ({ ranking, summary }, config) => {
      const unknown = ranking.filter((r) => !byId.has(r.siteId)).map((r) => r.siteId);
      if (unknown.length) return unknownSite(unknown.join(", "));
      const ranked: RankedSite[] = [...ranking]
        .sort((a, b) => a.rank - b.rank)
        .map((r, i) => {
          const n = numbers(r.siteId);
          return { siteId: r.siteId, rank: i + 1, oneLineReason: clip(r.oneLineReason, 400), topRisk: clip(r.topRisk, 400), ...(n ? { numbers: n } : {}) };
        });
      emit(config, { type: "result", ranking: ranked, summary: clip(summary, 700) });
      return JSON.stringify({ summary: `Ranking delivered: ${ranked.length} sites`, done: true });
    },
    {
      name: "submit_ranking",
      description: "Deliver the final ranked shortlist to the owner. Call exactly once, last. Leave dropped sites out.",
      schema: z.object({
        ranking: z
          .array(
            z.object({
              siteId: z.string(),
              rank: z.number().int().min(1),
              oneLineReason: z.string().describe("Why it is ranked here, number first, plain words"),
              topRisk: z.string().describe("The one thing most likely to hurt the owner at this site, in one or two short sentences"),
            }),
          )
          .min(1)
          .max(8),
        summary: z.string().describe("Two short sentences for the owner: the pick and why, and what changed your mind along the way. No promises about revenue."),
      }),
    },
  );

  return {
    brief,
    sites,
    searchCandidates,
    inspect,
    compare,
    numbers,
    fallbackRanking,
    plannerTools: [searchSites, compareSites, analyzeSiteTool, recordDecision, submitRanking],
    inspectorTools: [inspectSite, analyzeSiteTool],
    tools: { searchSites, inspectSite, analyzeSite: analyzeSiteTool, compareSites, recordDecision, submitRanking },
  };
}
