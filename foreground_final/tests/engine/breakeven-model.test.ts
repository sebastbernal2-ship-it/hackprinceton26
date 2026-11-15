import { describe, expect, it } from "vitest";
import { analyzeSite, DEFAULT_BRIEF } from "@/lib/engine";
import { breakeven } from "@/lib/engine/breakeven";
import { scenarios, withSeatCaveat } from "@/lib/engine/scenarios";
import { loadSites } from "@/lib/sites/load";
import { finding, makeSite } from "./fixtures";

describe("breakeven", () => {
  it("finds the sales where profit is zero under the scenario cost model, then covers and turns", () => {
    const b = breakeven({ annualOccupancyUsd: 70_000, seats: 86, concept: "fast-casual" });
    // occupancy / (1 - 30% food - 31% labor - 23% other)
    expect(b.salesNeededUsd).toBeCloseTo(437_500, 6);
    expect(b.avgCheckUsd).toBe(18);
    expect(b.coversPerDay).toBeCloseTo(437_500 / 18 / 360, 6);
    expect(b.turnsPerDay).toBeCloseTo(437_500 / 18 / 360 / 86, 6);
    expect(b.verdict).toBe("comfortable");
  });

  it("gives zero profit in the scenario model at exactly the break-even sales", () => {
    const b = breakeven({ annualOccupancyUsd: 70_000, seats: 86, concept: "fast-casual" });
    const perSf = b.salesNeededUsd / 1800;
    const s = scenarios({
      sf: 1800,
      annualOccupancyUsd: 70_000,
      buildoutUsd: 1,
      concept: "fast-casual",
      band: { low: perSf, mid: perSf, high: perSf },
    });
    expect(s.scenarios.base.annualProfitUsd).toBeCloseTo(0, 6);
  });

  it("uses the caller's cost shares when given", () => {
    const b = breakeven({
      annualOccupancyUsd: 60_000,
      seats: 40,
      concept: "fast-casual",
      shares: { food: 0.3, labor: 0.3, other: 0.2 },
    });
    expect(b.salesNeededUsd).toBeCloseTo(300_000, 6);
  });

  it("is a stretch when turns exceed the comfortable limit for the concept", () => {
    const b = breakeven({ annualOccupancyUsd: 70_000, seats: 25, concept: "fast-casual" });
    expect(b.turnsPerDay).toBeGreaterThan(2);
    expect(b.turnsPerDay).toBeLessThanOrEqual(3.5);
    expect(b.verdict).toBe("stretch");
  });

  it("allows fewer turns for full service than for quick service", () => {
    const at = (concept: "full-service" | "quick-service") =>
      breakeven({ annualOccupancyUsd: 70_000, seats: 40, concept, avgCheckUsd: 18 }).verdict;
    // 437,500 / 18 / 360 / 40 = 1.7 turns a day
    expect(at("full-service")).toBe("stretch");
    expect(at("quick-service")).toBe("comfortable");
  });

  it("is unlikely when turns exceed the stretch limit", () => {
    expect(breakeven({ annualOccupancyUsd: 70_000, seats: 10, concept: "fast-casual" }).verdict).toBe("unlikely");
  });

  it("is unlikely with no seats instead of dividing by zero", () => {
    const b = breakeven({ annualOccupancyUsd: 70_000, seats: 0, concept: "fast-casual" });
    expect(b.turnsPerDay).toBe(0);
    expect(b.verdict).toBe("unlikely");
  });

  it("accepts overrides for check and open days", () => {
    const b = breakeven({
      annualOccupancyUsd: 60_000,
      seats: 40,
      concept: "cafe",
      avgCheckUsd: 10,
      openDaysPerYear: 300,
    });
    expect(b.salesNeededUsd).toBeCloseTo(375_000, 6);
    expect(b.coversPerDay).toBeCloseTo(125, 6);
  });

  it("is never comfortable when break-even sales exceed the base case, and unlikely beyond the strong case", () => {
    const easyTurns = { annualOccupancyUsd: 70_000, seats: 200, concept: "fast-casual" as const };
    expect(breakeven(easyTurns).verdict).toBe("comfortable");
    expect(breakeven({ ...easyTurns, caseSalesUsd: { base: 500_000, strong: 700_000 } }).verdict).toBe("comfortable");
    expect(breakeven({ ...easyTurns, caseSalesUsd: { base: 400_000, strong: 700_000 } }).verdict).toBe("stretch");
    expect(breakeven({ ...easyTurns, caseSalesUsd: { base: 300_000, strong: 400_000 } }).verdict).toBe("unlikely");
  });

  it("cites the cost model, the 8% rent target with its dollar figure, check, open days and turn limits", () => {
    const b = breakeven({ annualOccupancyUsd: 70_000, seats: 86, concept: "full-service" });
    expect(b.assumptions).toHaveLength(5);
    expect(b.assumptions[0].label).toMatch(/break-even.*16% of sales/i);
    const rent = b.assumptions[1];
    expect(rent.label).toBe("To keep rent at 8% of sales: $880k/yr");
    expect(rent.url).toContain("paytronix");
    expect(b.assumptions.some((a) => a.source === "Foreground estimate")).toBe(true);
    const ten = breakeven({ annualOccupancyUsd: 70_000, seats: 86, concept: "cafe", targetOccupancyShare: 0.1 });
    expect(ten.assumptions[1].label).toBe("To keep rent at 10% of sales: $700k/yr");
  });
});

describe("break-even and scenarios agree", () => {
  const sites = loadSites();
  const concepts = ["quick-service", "fast-casual", "full-service", "cafe", "bar"] as const;

  it("puts break-even sales below base-case sales exactly when the base case makes money, on every site and concept", () => {
    for (const site of sites)
      for (const concept of concepts) {
        const a = analyzeSite(site, { ...DEFAULT_BRIEF, concept });
        const base = a.scenarios.scenarios.base;
        expect(base.annualProfitUsd > 0).toBe(a.breakeven.salesNeededUsd < base.annualSalesUsd);
        if (base.annualProfitUsd <= 0) expect(a.breakeven.verdict).not.toBe("comfortable");
        if (a.scenarios.scenarios.strong.annualProfitUsd <= 0) expect(a.breakeven.verdict).toBe("unlikely");
      }
  });

  it("explains in the scenario verdict when the seats, not the cost model, are the limit", () => {
    // 3,000 SF at a high rent: the full space makes money at benchmark sales, but 40 seats cannot turn fast enough
    const site = makeSite({ space: { sf: 3000, rentPerSfYr: 45 }, findings: [finding("hood", "present")] });
    const a = analyzeSite(site, DEFAULT_BRIEF);
    expect(a.scenarios.scenarios.base.annualProfitUsd).toBeGreaterThan(0);
    expect(a.breakeven.verdict).toBe("unlikely");
    expect(a.scenarios.verdict).toMatch(/assume the whole 3,000 SF sells at benchmark rates/i);
    expect(a.scenarios.verdict).toMatch(/on 40 seats, break-even alone takes \d\.\d turns a day/i);
  });

  it("leaves the scenario verdict alone when break-even is within reach", () => {
    const site = makeSite({ findings: [finding("hood", "present")] });
    const a = analyzeSite(site, DEFAULT_BRIEF);
    expect(a.breakeven.verdict).not.toBe("unlikely");
    expect(a.scenarios.verdict).not.toMatch(/whole/i);
    const s = scenarios({ sf: 1800, annualOccupancyUsd: 70_000, buildoutUsd: 250_000, concept: "fast-casual" });
    expect(withSeatCaveat(s, a.breakeven, 40, 1800)).toBe(s);
  });

  it("does not add the seat caveat when the scenarios already lose money", () => {
    const site = makeSite({ space: { sf: 1000, rentPerSfYr: 200 } });
    const a = analyzeSite(site, DEFAULT_BRIEF);
    expect(a.breakeven.verdict).toBe("unlikely");
    expect(a.scenarios.verdict).toMatch(/loses money in every case/i);
    expect(a.scenarios.verdict).not.toMatch(/whole/i);
  });
});
