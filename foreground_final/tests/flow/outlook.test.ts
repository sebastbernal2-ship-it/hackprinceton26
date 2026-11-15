import { describe, expect, it } from "vitest";
import { buildOfferCta, buildOutlook } from "@/components/flow/outlook-data";
import { analyzeSite, DEFAULT_BRIEF } from "@/lib/engine";
import { loadSite } from "@/lib/sites/load";

const site = loadSite("1018657")!;
const brief = { ...DEFAULT_BRIEF, city: site.city };

describe("buildOutlook", () => {
  const o = buildOutlook(site, brief);
  const a = analyzeSite(site, brief);

  it("matches analyzeSite scenarios, year by year", () => {
    for (const k of ["slow", "base", "strong"] as const) {
      expect(o.scenarios[k].profitByYearUsd).toEqual(a.scenarios.scenarios[k].years.map((y) => Math.round(y.profitUsd)));
    }
  });
  it("matches break-even and verdict", () => {
    expect(o.breakevenCoversPerDay).toBe(Math.round(a.breakeven.coversPerDay));
    expect(o.verdict).toBe(a.breakeven.verdict);
    expect(o.turnsPerDay).toBeCloseTo(a.breakeven.turnsPerDay, 1);
  });
  it("carries rent, risks and sources", () => {
    expect(o.rentAskingPerSfYr).toBeGreaterThan(0);
    expect(o.rentFairPerSfYr!.low).toBeLessThan(o.rentFairPerSfYr!.high);
    expect(o.risks.length).toBeLessThanOrEqual(3);
    expect(o.sources.length).toBeGreaterThan(0);
    expect(o.read.length).toBeGreaterThan(10);
  });
  it("builds the offer cta", () => {
    const c = buildOfferCta(site, brief);
    expect(c).toMatchObject({ kind: "offerCta", siteId: "1018657", memoHref: "/site/1018657/offer?concept=fast-casual&seats=40&budget=250000", state: "idle" });
  });
});
