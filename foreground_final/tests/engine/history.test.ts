import { describe, expect, it } from "vitest";
import { blockTrend } from "@/lib/engine/trend";
import { graveyard } from "@/lib/engine/graveyard";
import { timeToOpen } from "@/lib/engine/time-to-open";
import { occupancy } from "@/lib/engine/occupancy";
import { finding, makeSite, tenant } from "./fixtures";

const today = new Date("2026-11-14");
const signal = (t: ReturnType<typeof blockTrend>, re: RegExp) => {
  const s = t.signals.find((s) => re.test(s.label));
  if (!s) throw new Error(`no signal ${re}`);
  return s;
};
const trading = (over: Parameters<typeof tenant>[0] = {}) =>
  tenant({ moveOut: null, current: true, outcome: "current", ...over });

describe("graveyard", () => {
  it("counts food tenants, those that closed, and same-suite failures", () => {
    const g = graveyard(
      makeSite({
        tenantHistory: [
          tenant({ name: "A", years: 1, sameSuite: true }),
          tenant({ name: "B", years: 3, sameSuite: true, outcome: "unknown" }),
          tenant({ name: "C", years: 8, outcome: "moved", sameSuite: true }),
          trading({ name: "D", years: 10 }),
          tenant({ name: "Bank", isFood: false, years: 2 }),
        ],
      }),
    );
    expect(g.foodTenants).toBe(4);
    expect(g.closedHere).toBe(2);
    expect(g.sameSuiteFailures).toBe(3); // closed or moved out: all three left this suite
    expect(g.medianYears).toBe(3); // median stay of the 3 departed food tenants: 1, 3, 8
    expect(g.summary).toMatch(/2 of 4 food tenants/);
    expect(g.summary).toMatch(/3 left this same suite/);
  });

  it("takes the mean of the middle two for an even number of departed tenants", () => {
    const g = graveyard(makeSite({ tenantHistory: [tenant({ years: 1 }), tenant({ years: 4 })] }));
    expect(g.medianYears).toBe(2.5);
  });

  it("returns null median and a plain summary when there is no food history", () => {
    const g = graveyard(makeSite());
    expect(g).toMatchObject({ foodTenants: 0, closedHere: 0, sameSuiteFailures: 0, medianYears: null });
    expect(g.summary).toMatch(/no past food tenants/i);
  });

  it("says none have closed when all food tenants are still trading", () => {
    const g = graveyard(makeSite({ tenantHistory: [trading()] }));
    expect(g.closedHere).toBe(0);
    expect(g.summary).toMatch(/none/i);
  });
});

describe("blockTrend", () => {
  it("reads more food closures than openings in the last 5 years as a down signal from CoStar", () => {
    const t = blockTrend(
      makeSite({
        tenantHistory: [
          tenant({ moveIn: "2015-01-01", moveOut: "2023-01-01" }),
          tenant({ moveIn: "2016-01-01", moveOut: "2024-01-01" }),
          trading({ moveIn: "2024-06-01" }),
        ],
      }),
      today,
    );
    const s = signal(t, /openings/i);
    expect(s.direction).toBe("down");
    expect(s.detail).toMatch(/1 opened/);
    expect(s.detail).toMatch(/2 closed or left/);
    expect(s.source).toMatch(/CoStar/);
  });

  it("reads more openings than closures as up, and equal as flat", () => {
    const opened = makeSite({ tenantHistory: [trading({ moveIn: "2024-06-01" })] });
    expect(signal(blockTrend(opened, today), /openings/i).direction).toBe("up");
    expect(signal(blockTrend(makeSite(), today), /openings/i).direction).toBe("flat");
  });

  it("reads long-running current food tenants as up and none trading as down", () => {
    const t = blockTrend(makeSite({ tenantHistory: [trading({ moveIn: "2010-01-01", years: 16 })] }), today);
    expect(signal(t, /trading/i).direction).toBe("up");
    expect(signal(blockTrend(makeSite(), today), /trading/i).direction).toBe("down");
  });

  it("reads a space vacant over two years as down, under two as flat, and not yet vacant as up", () => {
    const at = (availableOn: string | null) =>
      signal(blockTrend(makeSite({ space: { availableOn } }), today), /on the market/i);
    expect(at("2018-08-13").direction).toBe("down");
    expect(at("2018-08-13").detail).toMatch(/8\.3 years/);
    expect(at("2025-05-14").direction).toBe("flat");
    expect(at("2026-08-14").direction).toBe("flat");
    expect(at("2026-08-14").detail).toMatch(/3 months/);
    expect(at("2027-01-01").direction).toBe("up");
  });

  it("skips the time-on-market signal when no availability date is known", () => {
    const t = blockTrend(makeSite({ space: { availableOn: null } }), today);
    expect(t.signals.some((s) => /on the market/i.test(s.label))).toBe(false);
  });

  it("adds neighborhood signals when present, labelled with the neighborhood source", () => {
    const t = blockTrend(
      makeSite({
        neighborhood: {
          populationGrowth5yPct: 6,
          newUnitsPermitted12mo: 400,
          foodOpenings3y: 3,
          foodClosures3y: 9,
          submarketVacancyPct: 12,
          medianHouseholdIncomeUsd: 80000,
          sources: [{ label: "Census ACS" }],
        },
      }),
      today,
    );
    expect(signal(t, /population/i)).toMatchObject({ direction: "up", source: "Census ACS" });
    expect(signal(t, /housing/i).direction).toBe("up");
    expect(signal(t, /nearby food/i).direction).toBe("down");
    expect(signal(t, /vacancy/i).direction).toBe("down");
  });

  it("reads shrinking population, no new housing and low vacancy the other way", () => {
    const t = blockTrend(
      makeSite({
        neighborhood: {
          populationGrowth5yPct: -3,
          newUnitsPermitted12mo: 0,
          foodOpenings3y: 5,
          foodClosures3y: 5,
          submarketVacancyPct: 3,
          sources: [],
        },
      }),
      today,
    );
    expect(signal(t, /population/i)).toMatchObject({ direction: "down", source: "Neighborhood data" });
    expect(signal(t, /housing/i).direction).toBe("flat");
    expect(signal(t, /nearby food/i).direction).toBe("flat");
    expect(signal(t, /vacancy/i).direction).toBe("up");
    const mid = blockTrend(
      makeSite({
        neighborhood: {
          populationGrowth5yPct: 1,
          submarketVacancyPct: 6,
          foodOpenings3y: 4,
          foodClosures3y: 1,
          sources: [],
        },
      }),
      today,
    );
    expect(signal(mid, /population/i).direction).toBe("flat");
    expect(signal(mid, /vacancy/i).direction).toBe("flat");
    expect(signal(mid, /nearby food/i).direction).toBe("up");
  });

  it("rates the block from the mean signal direction", () => {
    const up = blockTrend(
      makeSite({
        space: { availableOn: "2027-01-01" },
        tenantHistory: [trading({ moveIn: "2023-01-01", years: 3.9 })],
      }),
      today,
    );
    expect(up.score).toBe(1);
    expect(up.rating).toBe("tailwind");
    const down = blockTrend(
      makeSite({ space: { availableOn: "2020-01-01" }, tenantHistory: [tenant({ moveOut: "2025-01-01" })] }),
      today,
    );
    expect(down.score).toBe(-1);
    expect(down.rating).toBe("headwind");
    const neutral = blockTrend(makeSite({ tenantHistory: [trading({ moveIn: "2012-01-01" })] }), today);
    expect(neutral.rating).toBe("neutral");
  });

  it("defaults today to 2026-11-14 so results do not depend on the clock", () => {
    const site = makeSite({ space: { availableOn: "2018-08-13" } });
    expect(blockTrend(site)).toEqual(blockTrend(site, today));
  });
});

describe("timeToOpen", () => {
  it("takes 3-6 months for a second-generation space with a hood; dead rent is monthly occupancy times months", () => {
    const site = makeSite({ findings: [finding("hood", "present")] });
    const occ = occupancy(site);
    const t = timeToOpen(site, occ);
    expect(t.months).toEqual({ low: 3, mid: 4.5, high: 6 });
    expect(t.deadRentUsd.low).toBeCloseTo((occ.annualUsd.mid / 12) * 3, 6);
    expect(t.deadRentUsd.mid).toBeCloseTo((occ.annualUsd.mid / 12) * 4.5, 6);
    expect(t.deadRentUsd.high).toBeCloseTo((occ.annualUsd.mid / 12) * 6, 6);
    expect(t.basis).toMatch(/hood/i);
  });

  it("takes 4-9 months for a second-generation space without a confirmed hood", () => {
    const site = makeSite({ findings: [finding("prior-use", "present"), finding("hood", "unknown")] });
    expect(timeToOpen(site, occupancy(site)).months).toEqual({ low: 4, mid: 6.5, high: 9 });
  });

  it("takes 6-12 months for a shell or a space that was never a restaurant", () => {
    const shell = makeSite({ space: { spaceType: "New" } });
    expect(timeToOpen(shell, occupancy(shell)).months).toEqual({ low: 6, mid: 9, high: 12 });
    const retail = makeSite();
    expect(timeToOpen(retail, occupancy(retail)).months).toEqual({ low: 6, mid: 9, high: 12 });
    expect(timeToOpen(retail, occupancy(retail)).basis).toMatch(/no sign of a past restaurant/i);
  });
});
