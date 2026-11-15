import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  displayProbabilityText,
  formatEffect,
  formatProbability,
  getSiteSurvival,
  getSurvivalModel,
  getSurvivalSites,
  modelSkill,
  parseSurvivalSites,
  relativeBand,
  survivalBand,
} from "@/lib/ml/survival";

describe("survival model export", () => {
  const model = getSurvivalModel();

  it("parses and has a consistent dataset", () => {
    expect(model.dataset.survived + model.dataset.notSurvived).toBe(model.dataset.rows);
    expect(model.dataset.baseRate).toBeCloseTo(model.dataset.survived / model.dataset.rows, 3);
    expect(model.metrics.timeSplit.train.n + model.metrics.timeSplit.test.n).toBe(model.dataset.rows);
  });

  it("reports metrics in valid ranges, with baselines", () => {
    for (const s of Object.values(model.metrics.timeSplit.models)) {
      expect(s.rocAuc).toBeGreaterThanOrEqual(0);
      expect(s.rocAuc).toBeLessThanOrEqual(1);
      expect(s.brier).toBeGreaterThan(0);
      expect(s.brier).toBeLessThan(0.5);
    }
    expect(model.metrics.timeSplit.models.baseRate.rocAuc).toBe(0.5);
  });

  it("does not use lease-record fields or outcome fields as features", () => {
    for (const f of ["has_lease_deal", "lease_type", "rent_psf_yr", "move_out", "duration_years", "end_reason"]) {
      expect(model.dataset.features).not.toContain(f);
    }
  });

  it("has calibration bins that cover every scored row", () => {
    const n = model.calibration.bins.reduce((a, b) => a + b.n, 0);
    expect(n).toBe(model.metrics.groupedCv.n);
    for (const b of model.calibration.bins) expect(b.observed).toBeLessThanOrEqual(1);
  });

  it("states its limits", () => {
    expect(model.modelCard.limits.length).toBeGreaterThan(3);
  });

  it("summarises skill against the base rate", () => {
    const s = modelSkill(model);
    expect(s.brierSkill).toBeCloseTo(1 - s.brier / s.baselineBrier, 6);
    expect(s.testRows).toBe(model.metrics.timeSplit.test.n);
  });
});

describe("site survival predictions", () => {
  const data = getSurvivalSites();
  const siteIds = readdirSync(join(process.cwd(), "data", "sites"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("has one prediction per demo site", () => {
    expect(data.sites.map((s) => s.siteId).sort()).toEqual(siteIds.sort());
  });

  it("has three top factors, ordered by size, whose text carries the signed effect", () => {
    for (const s of data.sites) {
      expect(s.topFactors.length).toBeGreaterThan(0);
      expect(s.topFactors.length).toBeLessThanOrEqual(3);
      for (const f of s.topFactors) {
        expect(f.measuredSkill).toBe(true);
        expect(data.noSkillGroups).not.toContain(f.group);
      }
      const sizes = s.topFactors.map((f) => Math.abs(f.effectPts));
      expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
      for (const f of s.topFactors) {
        // the exported summary is rounded in Python (half-to-even), so allow half a point of difference
        const m = f.summary.match(/^(.*): ([+−])(\d+) pts$/);
        expect(m?.[1]).toBe(f.text);
        expect(Math.abs(Number(m?.[3]) - Math.abs(f.effectPts))).toBeLessThanOrEqual(0.5);
        if (Math.abs(f.effectPts) >= 0.5) expect(m?.[2]).toBe(f.effectPts > 0 ? "+" : "−");
      }
    }
  });

  it("factors add up to probability minus baseline", () => {
    for (const s of data.sites) {
      const sum = s.allFactors.reduce((a, f) => a + f.effectPts, 0);
      expect(Math.abs(sum - 100 * (s.probability - s.baselineProbability))).toBeLessThan(0.6);
    }
  });

  it("bands match the thresholds", () => {
    for (const s of data.sites) expect(s.band).toBe(survivalBand(s.probability));
  });

  it("gives a calibration-aware relative band and capped text", () => {
    expect(data.disclosure).toMatch(/^Trained on 895 Houston\/LA food tenancies; out-of-time AUC 0\.64/);
    for (const s of data.sites) {
      expect(s.relativeBand).toBe(relativeBand(s.probability, s.baselineProbability));
      expect(s.displayText).toBe(displayProbabilityText(s.probability));
      expect(s.displayProbability).toBeLessThanOrEqual(0.75);
      if (s.probability > 0.8) expect(s.displayText).toBe("about 3 in 4");
    }
    expect(displayProbabilityText(0.52)).toBe("about 52%");
    expect(relativeBand(0.9, 0.69)).toBe("above typical");
    expect(relativeBand(0.7, 0.69)).toBe("typical");
    expect(relativeBand(0.52, 0.69)).toBe("below typical");
  });

  it("looks a site up by id", () => {
    expect(getSiteSurvival(siteIds[0])?.siteId).toBe(siteIds[0]);
    expect(getSiteSurvival("nope")).toBeNull();
  });

  it("rejects a malformed file", () => {
    expect(() => parseSurvivalSites({ sites: [{ siteId: 1 }] })).toThrow();
  });
});

describe("formatting", () => {
  it("formats effects with a true minus sign", () => {
    expect(formatEffect(9.2)).toBe("+9 pts");
    expect(formatEffect(-11.6)).toBe("−12 pts");
    expect(formatEffect(-0.2)).toBe("+0 pts");
  });

  it("formats probabilities and bands", () => {
    expect(formatProbability(0.899)).toBe("90%");
    expect(survivalBand(0.8)).toBe("strong");
    expect(survivalBand(0.7)).toBe("typical");
    expect(survivalBand(0.55)).toBe("weak");
    expect(survivalBand(0.4)).toBe("poor");
  });
});

describe("survivalFor", () => {
  it("returns a flat view with signed factor directions", async () => {
    const { survivalFor } = await import("@/lib/ml/survival");
    const s = survivalFor("256760");
    expect(s?.topFactors.length).toBeGreaterThan(0);
    expect(s?.disclosure).toMatch(/weak signal/);
    for (const f of s?.topFactors ?? []) expect(f.direction).toBe(f.effect >= 0 ? "up" : "down");
    expect(survivalFor("nope")).toBeNull();
  });
});
