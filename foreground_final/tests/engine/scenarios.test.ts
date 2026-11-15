import { describe, expect, it } from "vitest";
import { scenarios } from "@/lib/engine/scenarios";
import benchmarks from "@/data/benchmarks.json";

/** Worked example from the plan doc: 1,800 SF fast-casual, $70k/yr occupancy, $250k build-out. */
const worked = (year1Ramp?: number) =>
  scenarios({
    sf: 1800,
    annualOccupancyUsd: 70_000,
    buildoutUsd: 250_000,
    concept: "fast-casual",
    band: { low: 400, mid: 550, high: 700 },
    shares: { food: 0.3, labor: 0.31, other: 0.23 },
    year1Ramp,
  });

describe("scenarios: plan-doc worked example", () => {
  it("slow case: $400/SF gives $720k sales, 9.7% occupancy, $45k profit, 5.5 yr payback", () => {
    const s = worked(1).scenarios.slow;
    expect(s.salesPerSfYr).toBe(400);
    expect(s.annualSalesUsd).toBe(720_000);
    expect(s.occupancySharePct).toBeCloseTo(9.7, 1);
    expect(Math.abs(s.annualProfitUsd - 45_000)).toBeLessThan(1000);
    expect(s.paybackYears).toBeCloseTo(5.5, 1);
  });

  it("base case: $550/SF gives $990k sales, 7.1% occupancy, $88k profit, 2.8 yr payback", () => {
    const s = worked(1).scenarios.base;
    expect(s.annualSalesUsd).toBe(990_000);
    expect(s.occupancySharePct).toBeCloseTo(7.1, 1);
    expect(Math.abs(s.annualProfitUsd - 88_000)).toBeLessThan(1000);
    expect(s.paybackYears).toBeCloseTo(2.8, 1);
  });

  it("strong case: $700/SF gives $1.26M sales, 5.6% occupancy, $132k profit, 1.9 yr payback", () => {
    const s = worked(1).scenarios.strong;
    expect(s.annualSalesUsd).toBe(1_260_000);
    expect(s.occupancySharePct).toBeCloseTo(5.6, 1);
    expect(Math.abs(s.annualProfitUsd - 132_000)).toBeLessThan(1000);
    expect(s.paybackYears).toBeCloseTo(1.9, 1);
  });
});

describe("scenarios: yearly rows", () => {
  it("ramps year 1 to 80% of steady sales and runs years 2-3 at steady state", () => {
    const { years, annualSalesUsd, annualProfitUsd } = worked().scenarios.base;
    expect(years.map((y) => y.year)).toEqual([1, 2, 3]);
    expect(years[0].salesUsd).toBeCloseTo(annualSalesUsd * 0.8, 6);
    // variable costs scale with sales, occupancy does not
    expect(years[0].profitUsd).toBeCloseTo(990_000 * 0.8 * 0.16 - 70_000, 6);
    expect(years[1].salesUsd).toBe(annualSalesUsd);
    expect(years[2].profitUsd).toBeCloseTo(annualProfitUsd, 6);
  });

  it("starts cumulative cash at minus the build-out and adds each year's profit", () => {
    const { years } = worked().scenarios.base;
    expect(years[0].cumulativeCashUsd).toBeCloseTo(-250_000 + years[0].profitUsd, 6);
    expect(years[2].cumulativeCashUsd).toBeCloseTo(
      -250_000 + years[0].profitUsd + years[1].profitUsd + years[2].profitUsd,
      6,
    );
  });
});

describe("scenarios: defaults and verdicts", () => {
  it("uses the concept's benchmark band and default cost shares when none are passed", () => {
    const r = scenarios({ sf: 1000, annualOccupancyUsd: 50_000, buildoutUsd: 100_000, concept: "cafe" });
    const band = benchmarks.salesPerSfYr.cafe;
    expect(r.scenarios.slow.salesPerSfYr).toBe(band.low);
    expect(r.scenarios.base.salesPerSfYr).toBe(band.mid);
    expect(r.scenarios.strong.salesPerSfYr).toBe(band.high);
    expect(r.scenarios.base.annualProfitUsd).toBeCloseTo(band.mid * 1000 * 0.16 - 50_000, 6);
  });

  it("returns null payback when a case loses money", () => {
    const r = scenarios({ sf: 1000, annualOccupancyUsd: 200_000, buildoutUsd: 100_000, concept: "fast-casual" });
    expect(r.scenarios.slow.annualProfitUsd).toBeLessThan(0);
    expect(r.scenarios.slow.paybackYears).toBeNull();
  });

  it("cites a source for the sales band, each cost share and the ramp", () => {
    const labels = worked()
      .assumptions.map((a) => a.label.toLowerCase())
      .join("|");
    for (const word of ["sales", "food", "labor", "other", "year 1"]) expect(labels).toContain(word);
    for (const a of worked().assumptions) expect(a.source.length).toBeGreaterThan(0);
  });

  it("says the site loses money in every case when even strong sales cannot cover rent", () => {
    const r = scenarios({ sf: 1000, annualOccupancyUsd: 500_000, buildoutUsd: 100_000, concept: "fast-casual" });
    expect(r.verdict).toMatch(/loses money/i);
  });

  it("says it works only if sales are strong when base loses money but strong does not", () => {
    const r = scenarios({ sf: 1000, annualOccupancyUsd: 100_000, buildoutUsd: 100_000, concept: "fast-casual" });
    expect(r.scenarios.base.annualProfitUsd).toBeLessThan(0);
    expect(r.scenarios.strong.annualProfitUsd).toBeGreaterThan(0);
    expect(r.verdict).toMatch(/only if sales reach the strong case/i);
  });

  it("says it works only from the base case up when the slow case loses money", () => {
    const r = scenarios({ sf: 1000, annualOccupancyUsd: 70_000, buildoutUsd: 100_000, concept: "fast-casual" });
    expect(r.scenarios.slow.annualProfitUsd).toBeLessThan(0);
    expect(r.scenarios.base.annualProfitUsd).toBeGreaterThan(0);
    expect(r.verdict).toMatch(/only if sales reach the base case/i);
  });

});
