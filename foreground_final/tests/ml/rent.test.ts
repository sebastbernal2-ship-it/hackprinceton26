import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatGap,
  formatRent,
  formatRentRange,
  getRentModel,
  getRentSites,
  parseRentSites,
  rentBand,
  rentFor,
  rentModelSkill,
} from "@/lib/ml/rent";

describe("rent model export", () => {
  const model = getRentModel();

  it("parses and describes its data and basis", () => {
    expect(model.dataset.retailRows).toBeLessThan(model.dataset.rows);
    expect(model.dataset.retailRows).toBeGreaterThan(500);
    expect(model.target).toMatch(/NNN/);
    expect(model.dataset.features).not.toContain("rent_nnn_psf_yr");
    expect(model.dataset.features).not.toContain("rent_raw_psf_yr");
  });

  it("documents a data-derived gross-to-NNN adjustment", () => {
    const a = model.nnnAdjustment;
    expect(a.grossToNnnFactor).toBeCloseTo(1 / a.grossOverNnnRatio, 6);
    // economics: a gross rent is higher than the NNN rent for the same space, so the factor is below 1
    expect(a.grossToNnnFactor).toBeLessThan(1);
    expect(a.grossToNnnFactor).toBeGreaterThan(0.7);
  });

  it("reports metrics in valid ranges next to baselines, on both validation schemes", () => {
    for (const m of [model.metrics.groupedCv, model.metrics.timeSplit]) {
      for (const s of [m.model, m.marketMedian, m.submarketMedian, m.knnCompsMedian]) {
        expect(s.mae).toBeGreaterThan(0);
        expect(s.medianApe).toBeGreaterThan(0);
        expect(s.medianApe).toBeLessThan(1);
        expect(s.r2).toBeLessThanOrEqual(1);
        expect(s.n).toBeGreaterThan(100);
      }
    }
  });

  it("reports empirical coverage of the 80% interval", () => {
    expect(model.intervals.level).toBe(0.8);
    const c = model.metrics.groupedCv.intervals;
    for (const k of [c.conformalGlobal, c.conformalByMarket, c.quantileGbm]) {
      expect(k.coverage).toBeGreaterThan(0.5);
      expect(k.coverage).toBeLessThanOrEqual(1);
    }
    expect(model.metrics.timeSplit.interval.coverage).toBeGreaterThan(0.4);
  });

  it("ranks feature importance and states its limits", () => {
    expect(model.featureImportance.groups.length).toBeGreaterThan(3);
    expect(model.modelCard.limits.length).toBeGreaterThan(3);
  });

  it("summarises skill against the best baseline", () => {
    const s = rentModelSkill(model);
    expect(s.maeSkill).toBeCloseTo(1 - s.mae / s.baselineMae, 6);
    expect(s.maeSkill).toBeLessThan(1);
  });
});

describe("site rent estimates", () => {
  const data = getRentSites();
  const siteIds = readdirSync(join(process.cwd(), "data", "sites"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("has one estimate per demo site", () => {
    expect(Object.keys(data.sites).sort()).toEqual([...siteIds].sort());
  });

  it("has a point inside its interval, and gaps that follow from the numbers", () => {
    for (const s of Object.values(data.sites)) {
      expect(s.intervalLowPerSfYr).toBeLessThan(s.fairRentPerSfYr);
      expect(s.intervalHighPerSfYr).toBeGreaterThan(s.fairRentPerSfYr);
      expect(s.gapPerSfYr).toBeCloseTo(s.askingNnnEquivPerSfYr - s.fairRentPerSfYr, 1);
      expect(Math.abs(s.gapPerYr - s.gapPerSfYr * s.sf)).toBeLessThan(s.sf * 0.02 + 1);
      expect(s.gapPct).toBeCloseTo(s.gapPerSfYr / s.fairRentPerSfYr, 2);
      expect(Math.abs(s.fairRentPerYr - s.fairRentPerSfYr * s.sf)).toBeLessThan(s.sf * 0.01 + 1);
    }
  });

  it("gives a market verdict only when the interval excludes the asking rent", () => {
    for (const s of Object.values(data.sites)) {
      expect(s.band).toBe(rentBand(s.askingNnnEquivPerSfYr, s.intervalLowPerSfYr, s.intervalHighPerSfYr));
      if (s.band === "in line") {
        expect(s.askingNnnEquivPerSfYr).toBeGreaterThanOrEqual(s.intervalLowPerSfYr);
        expect(s.askingNnnEquivPerSfYr).toBeLessThanOrEqual(s.intervalHighPerSfYr);
      }
    }
    expect(rentBand(50, 30, 40)).toBe("above market");
    expect(rentBand(25, 30, 40)).toBe("below market");
    expect(rentBand(35, 30, 40)).toBe("in line");
  });

  it("lists up to five comparable spaces from other buildings, nearest first", () => {
    for (const s of Object.values(data.sites)) {
      expect(s.comps.length).toBeGreaterThanOrEqual(3);
      expect(s.comps.length).toBeLessThanOrEqual(5);
      const d = s.comps.map((c) => c.distanceKm);
      expect(d).toEqual([...d].sort((a, b) => a - b));
      expect(new Set(s.comps.map((c) => c.propertyId)).size).toBe(s.comps.length);
      for (const c of s.comps) expect(c.address).not.toBe("");
    }
  });

  it("uses the quoted asking rent converted to the NNN basis", () => {
    const fsg = Object.values(data.sites).find((s) => s.askingServiceType && s.askingServiceType !== "NNN");
    if (fsg) expect(fsg.askingNnnEquivPerSfYr).toBeLessThan(fsg.askingRentPerSfYr ?? 0);
    for (const s of Object.values(data.sites)) {
      if (s.askingServiceType === "NNN") expect(s.askingNnnEquivPerSfYr).toBeCloseTo(s.askingRentPerSfYr ?? 0, 1);
    }
  });

  it("looks a site up by id", () => {
    expect(rentFor(siteIds[0])?.siteId).toBe(siteIds[0]);
    expect(rentFor("nope")).toBeNull();
  });

  it("rejects a malformed file", () => {
    expect(() => parseRentSites({ sites: { a: { siteId: 1 } } })).toThrow();
  });
});

describe("formatting", () => {
  it("formats rents, ranges and gaps", () => {
    expect(formatRent(36.4)).toBe("$36");
    expect(formatRentRange(36.2, 39.1)).toBe("$36–40/SF/yr");
    expect(formatGap(9.2)).toBe("+$9/SF/yr");
    expect(formatGap(-3.4)).toBe("−$3/SF/yr");
    expect(formatGap(-0.2)).toBe("+$0/SF/yr");
  });
});
