import { describe, expect, it } from "vitest";
import { analyzeSite, DEFAULT_BRIEF } from "@/lib/engine";
import { scoreSite } from "@/lib/engine/score";
import { loadSites } from "@/lib/sites/load";
import type { FindingKind } from "@/lib/sites/schema";
import { finding, makeSite, tenant } from "./fixtures";

function nonFinite(value: unknown, path = "$"): string[] {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonFinite(v, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => nonFinite(v, `${path}.${k}`));
  return [];
}

describe("analyzeSite on every real site", () => {
  const sites = loadSites();

  it("finds the 12 demo sites", () => {
    expect(sites.length).toBeGreaterThanOrEqual(12);
  });

  it.each(sites.map((s) => [s.id, s] as const))("analyzes site %s with finite numbers", (_id, site) => {
    const a = analyzeSite(site, DEFAULT_BRIEF);
    expect(nonFinite(a)).toEqual([]);
    expect(a.siteId).toBe(site.id);
    expect(a.seats.seats).toBeGreaterThan(0);
    expect(a.xray.lines.length).toBeGreaterThanOrEqual(3);
    expect(a.xray.total.low).toBeLessThanOrEqual(a.xray.total.high);
    expect(a.occupancy.annualUsd.mid).toBeGreaterThan(0);
    expect(a.score.score).toBeGreaterThanOrEqual(0);
    expect(a.score.score).toBeLessThanOrEqual(100);
    expect(a.score.reasons.length).toBeGreaterThan(0);
  });

  it.each(["quick-service", "full-service", "cafe", "bar"] as const)(
    "handles the %s concept on every site",
    (concept) => {
      for (const site of sites) expect(nonFinite(analyzeSite(site, { concept }))).toEqual([]);
    },
  );
});

describe("analyzeSite composition", () => {
  const site = makeSite({ findings: [finding("hood", "present")] });
  const a = analyzeSite(site, DEFAULT_BRIEF);

  it("feeds occupancy and the seats the owner will operate into break-even", () => {
    expect(a.breakeven.salesNeededUsd).toBeCloseTo(a.occupancy.annualUsd.mid / 0.16, 6);
    expect(a.seats.seats).toBe(86);
    // the brief asks for 40 seats, fewer than the 86 that fit
    expect(a.breakeven.turnsPerDay).toBeCloseTo(a.breakeven.coversPerDay / 40, 6);
    expect(a.seats.basis).toMatch(/fits 86/i);
    expect(a.seats.basis).toMatch(/40 seats you want/i);
  });

  it("uses every fitted seat for break-even when the owner wants more than fit, or gave no number", () => {
    const more = analyzeSite(site, { concept: "fast-casual", seats: 200 });
    expect(more.breakeven.turnsPerDay).toBeCloseTo(more.breakeven.coversPerDay / 86, 6);
    const none = analyzeSite(site, { concept: "fast-casual" });
    expect(none.breakeven.turnsPerDay).toBeCloseTo(none.breakeven.coversPerDay / 86, 6);
    expect(none.seats.basis).toMatch(/all 86/i);
  });

  it("pays back the X-Ray total midpoint along the base-case cash curve", () => {
    const base = a.scenarios.scenarios.base;
    expect(base.annualSalesUsd).toBe(550 * 1800);
    expect(base.years[0].cumulativeCashUsd).toBeCloseTo(-a.xray.total.mid + base.years[0].profitUsd, 6);
    expect(base.paybackYears).toBeCloseTo(
      1 + (a.xray.total.mid - base.years[0].profitUsd) / base.annualProfitUsd,
      6,
    );
  });

  it("is deterministic and takes today as a parameter", () => {
    expect(analyzeSite(site, DEFAULT_BRIEF)).toEqual(a);
    const old = makeSite({ space: { availableOn: "2025-12-01" } });
    expect(analyzeSite(old, DEFAULT_BRIEF, new Date("2026-01-01")).trend).not.toEqual(
      analyzeSite(old, DEFAULT_BRIEF, new Date("2029-01-01")).trend,
    );
  });
});

describe("scoreSite", () => {
  const systems: FindingKind[] = ["hood", "grease-trap", "walk-in", "restrooms", "electrical", "gas"];
  const good = makeSite({
    space: { sf: 1800, rentPerSfYr: 20, availableOn: "2027-01-01" },
    findings: systems.map((k) => finding(k, "present")),
    tenantHistory: [
      tenant({ moveIn: "2012-01-01", moveOut: null, years: 14, current: true, outcome: "current" }),
      tenant({ moveIn: "2024-01-01", moveOut: null, years: 2.9, current: true, outcome: "current" }),
    ],
  });
  const bad = makeSite({
    city: "Los Angeles",
    state: "CA",
    space: { sf: 1000, rentPerSfYr: 200, availableOn: "2019-01-01" },
    findings: [finding("hood", "absent")],
    matterport: { modelId: "m", defurnishedViewId: null, scanOfExactSuite: false },
    tenantHistory: [
      tenant({ sameSuite: true, moveOut: "2024-01-01" }),
      tenant({ sameSuite: true, moveOut: "2025-06-01" }),
    ],
  });
  const badBrief = { concept: "fast-casual" as const, seats: 80, budgetUsd: 50_000, city: "Houston" as const };

  it("scores a cheap, fitted-out site on a healthy block above an expensive bare one", () => {
    const g = analyzeSite(good, { concept: "fast-casual", budgetUsd: 400_000 }).score;
    const b = analyzeSite(bad, badBrief).score;
    expect(g.score).toBeGreaterThan(b.score);
    expect(g.score).toBeGreaterThan(70);
    expect(b.score).toBeLessThan(30);
    expect(g.flags).toEqual([]);
  });

  it("flags over budget, same-suite failures, seat shortfall, wrong city, neighbouring scan and weak money", () => {
    const flags = analyzeSite(bad, badBrief).score.flags.join("|");
    expect(flags).toMatch(/over budget by \$/i);
    expect(flags).toMatch(/2 food tenants have left this same suite/i);
    expect(flags).toMatch(/fits about 48 seats, not the 80/i);
    expect(flags).toMatch(/Los Angeles, not Houston/);
    expect(flags).toMatch(/neighbouring suite/i);
    expect(flags).toMatch(/rent is hard to cover/i);
    expect(flags).toMatch(/loses money/i);
  });

  it("stays within 0 to 100, is a whole number and gives reasons", () => {
    const a = analyzeSite(bad, { concept: "full-service", seats: 80, budgetUsd: 1, city: "Houston" });
    expect(a.score.score).toBeGreaterThanOrEqual(0);
    expect(a.score.score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(a.score.score)).toBe(true);
    expect(a.score.reasons.length + a.score.flags.length).toBeGreaterThanOrEqual(3);
  });

  it("does not judge budget when the owner gave none", () => {
    const plain = makeSite();
    const a = analyzeSite(plain, { concept: "fast-casual" });
    const b = analyzeSite(plain, { concept: "fast-casual", budgetUsd: 10_000_000 });
    expect(b.score.score - a.score.score).toBe(10);
  });

  it("is exported as a pure function over the analysis parts", () => {
    const a = analyzeSite(good, DEFAULT_BRIEF);
    expect(scoreSite({ site: good, ...a })).toEqual(a.score);
  });
});
