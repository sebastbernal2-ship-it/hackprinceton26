import { describe, expect, it } from "vitest";
import { analyzeSite, DEFAULT_BRIEF } from "@/lib/engine";
import { findingFor, usd, usdSales } from "@/lib/engine/benchmarks";
import { scenarios } from "@/lib/engine/scenarios";
import { loadSite, loadSites } from "@/lib/sites/load";
import type { Finding } from "@/lib/sites/schema";
import { makeSite } from "./fixtures";

const run = (annualOccupancyUsd: number, buildoutUsd: number, year1Ramp?: number) =>
  scenarios({
    sf: 1800,
    annualOccupancyUsd,
    buildoutUsd,
    concept: "fast-casual",
    band: { low: 400, mid: 550, high: 700 },
    year1Ramp,
  });

describe("payback comes from the cumulative cash curve", () => {
  it("equals build-out / annual profit when there is no ramp (the plan-doc figure)", () => {
    const base = run(70_000, 250_000, 1).scenarios.base;
    expect(base.paybackYears).toBeCloseTo(250_000 / base.annualProfitUsd, 6);
  });

  it("takes longer with the year-1 ramp: one year plus what is left over steady profit", () => {
    const base = run(70_000, 250_000).scenarios.base;
    const year1 = base.years[0].profitUsd;
    expect(base.paybackYears).toBeCloseTo(1 + (250_000 - year1) / base.annualProfitUsd, 6);
    expect(base.paybackYears).toBeGreaterThan(3);
    expect(base.years[2].cumulativeCashUsd).toBeLessThan(0);
  });

  it("pays back inside year 1 when the first year's profit covers the build-out", () => {
    const strong = run(70_000, 40_000).scenarios.strong;
    expect(strong.paybackYears).toBeCloseTo(40_000 / strong.years[0].profitUsd, 6);
    expect(strong.paybackYears).toBeLessThan(1);
    expect(strong.years[0].cumulativeCashUsd).toBeGreaterThan(0);
  });

  it("is null when steady-state profit is not positive", () => {
    expect(run(200_000, 100_000).scenarios.slow.paybackYears).toBeNull();
  });
});

describe("scenario verdict follows the curves", () => {
  it("says profitable every year and gives both paybacks when all cases pay back within 3 years", () => {
    const r = run(50_000, 100_000);
    expect(r.scenarios.slow.years[0].profitUsd).toBeGreaterThan(0);
    expect(r.verdict).toMatch(/^Profitable every year, even in the slow case\./);
    expect(r.verdict).toMatch(/base case pays back the build-out in 1\.\d years, the slow case in \d\.\d\./);
  });

  it("says the slow case is still short after 3 years instead of claiming it makes money", () => {
    const r = run(70_000, 200_000);
    const slow = r.scenarios.slow;
    expect(slow.annualProfitUsd).toBeGreaterThan(0);
    expect(slow.years[2].cumulativeCashUsd).toBeLessThan(0);
    expect(r.scenarios.base.years[2].cumulativeCashUsd).toBeGreaterThanOrEqual(0);
    expect(r.verdict).toMatch(/base case pays back the build-out in \d\.\d years; the slow case is still \$\d+k short after 3 years/);
    expect(r.verdict).not.toMatch(/makes money even/i);
  });

  it("names a loss-making opening year in the slow case", () => {
    const r = run(100_000, 100_000);
    expect(r.scenarios.slow.annualProfitUsd).toBeGreaterThan(0);
    expect(r.scenarios.slow.years[0].profitUsd).toBeLessThan(0);
    expect(r.verdict).toMatch(/^Profitable in every case from year 2; the slow case loses about \$\d/);
  });

  it("says the base case does not pay back within 3 years, and whether the strong case does", () => {
    const r = run(70_000, 250_000);
    expect(r.verdict).toMatch(/base case does not pay back the build-out within 3 years \(about 3\.\d years at this pace\)/);
    expect(r.verdict).toMatch(/the strong case does, in \d\.\d years/);
    const slower = run(70_000, 600_000);
    expect(slower.verdict).toMatch(/base case does not pay back the build-out within 3 years \(about \d\.\d years at this pace\)\.$/);
  });

  it("says profitable only from the base case up, with the strong-case payback when base loses", () => {
    const baseUp = run(120_000, 100_000);
    expect(baseUp.verdict).toMatch(/^Profitable only if sales reach the base case \(\$550\/SF\); a slow year loses about \$4,800\./);
    const strongOnly = run(170_000, 50_000);
    expect(strongOnly.verdict).toMatch(/^Profitable only if sales reach the strong case \(\$700\/SF\); the base case loses about \$12k a year\./);
    expect(strongOnly.verdict).toMatch(/The strong case pays back the build-out in \d\.\d years\.$/);
    expect(run(190_000, 500_000).verdict).toMatch(/Even the strong case does not pay back the build-out within 3 years\.$/);
  });

  it("holds on every real site and concept: payback <= 3 exactly when year-3 cash is not negative, and wording matches signs", () => {
    const concepts = ["quick-service", "fast-casual", "full-service", "cafe", "bar"] as const;
    for (const site of loadSites())
      for (const concept of concepts) {
        const analysis = analyzeSite(site, { ...DEFAULT_BRIEF, concept });
        const { scenarios: s, verdict } = analysis.scenarios;
        // score reasons use the same profitable / pays-back distinction, read from the same yearly signs
        const reasons = analysis.score.reasons.join(" | ");
        const slowEveryYear = s.slow.years.every((y) => y.profitUsd > 0);
        const why = `${site.id} ${concept}: ${reasons}`;
        expect(/Profitable every year, even in the slow case/.test(reasons), why).toBe(slowEveryYear);
        expect(/Slow case turns profitable from year 2, after losing about \$/.test(reasons), why).toBe(
          s.slow.annualProfitUsd > 0 && !slowEveryYear,
        );
        expect(/and pays back the build-out in \d/.test(reasons), why).toBe(s.base.years[2].cumulativeCashUsd >= 0);
        expect(/does not pay back the build-out within 3 years/.test(reasons), why).toBe(
          s.base.annualProfitUsd > 0 && s.base.years[2].cumulativeCashUsd < 0,
        );
        expect(reasons, why).not.toMatch(/still profitable/i);
        for (const c of [s.slow, s.base, s.strong]) {
          const paidBack = c.paybackYears !== null && c.paybackYears <= 3;
          expect(paidBack, `${site.id} ${concept} ${c.name}`).toBe(c.years[2].cumulativeCashUsd >= 0);
          expect(c.paybackYears === null).toBe(c.annualProfitUsd <= 0);
        }
        const where = `${site.id} ${concept}: ${verdict}`;
        expect(/Loses money in every case/.test(verdict), where).toBe(s.strong.annualProfitUsd <= 0);
        expect(/base case pays back the build-out in/.test(verdict), where).toBe(s.base.years[2].cumulativeCashUsd >= 0);
        expect(/Profitable every year/.test(verdict), where).toBe(s.slow.years.every((y) => y.profitUsd > 0));
        expect(/slow case in \d/.test(verdict), where).toBe(s.slow.years[2].cumulativeCashUsd >= 0);
        if (s.base.annualProfitUsd <= 0) expect(verdict, where).not.toMatch(/^Profitable (every|in every)/);
      }
  });
});

describe("finding conflicts", () => {
  const f = (over: Partial<Finding>): Finding => ({
    id: "x",
    kind: "hood",
    status: "unknown",
    confidence: 0.5,
    evidence: "e",
    source: "costar-notes",
    ...over,
  });
  const exactScan = { modelId: "m", defurnishedViewId: null, scanOfExactSuite: true };
  const pick = (findings: Finding[], matterport: typeof exactScan | null = exactScan) =>
    findingFor(makeSite({ findings, matterport }), "hood")?.id;

  it("prefers a present or absent finding over an unknown one, whatever the order or confidence", () => {
    const unknown = f({ id: "notes", status: "unknown", confidence: 0.9 });
    const present = f({ id: "vision", status: "present", confidence: 0.6, source: "matterport-vision" });
    expect(pick([unknown, present])).toBe("vision");
    expect(pick([present, unknown])).toBe("vision");
  });

  it("takes the highest confidence among decided findings", () => {
    const low = f({ id: "low", status: "present", confidence: 0.6 });
    const high = f({ id: "high", status: "absent", confidence: 0.8, source: "costar-tenants" });
    expect(pick([low, high])).toBe("high");
    expect(pick([f({ id: "u1", confidence: 0.3 }), f({ id: "u2", confidence: 0.4 })])).toBe("u2");
  });

  it("lets a confident vision sighting (present, 0.7+) beat listing notes", () => {
    const notes = f({ id: "notes", status: "absent", confidence: 0.9 });
    const vision = f({ id: "vision", status: "present", confidence: 0.7, source: "matterport-vision" });
    expect(pick([notes, vision])).toBe("vision");
    const weak = f({ id: "weak", status: "present", confidence: 0.65, source: "matterport-vision" });
    expect(pick([notes, weak])).toBe("notes");
  });

  it("does not let vision from a scan of a neighbouring suite overrule a decided finding about this suite", () => {
    const notes = f({ id: "notes", status: "present", confidence: 0.6 });
    const vision = f({ id: "vision", status: "absent", confidence: 0.86, source: "matterport-vision" });
    const neighbour = { ...exactScan, scanOfExactSuite: false };
    expect(pick([notes, vision], neighbour)).toBe("notes");
    expect(pick([notes, vision], exactScan)).toBe("vision");
    // but it still beats an unknown, and stands when it is the only finding
    expect(pick([f({ id: "u" }), vision], neighbour)).toBe("vision");
    expect(pick([vision], neighbour)).toBe("vision");
  });

  it("returns undefined when no finding of that kind exists", () => {
    expect(pick([f({ kind: "gas" })])).toBeUndefined();
  });

  it("marks the hood at 2600 Travis St (1018657) as saved from the 3D-scan sighting", () => {
    const site = loadSite("1018657");
    if (!site) throw new Error("site 1018657 missing");
    const vision = site.findings.find((x) => x.kind === "hood" && x.source === "matterport-vision");
    const a = analyzeSite(site, DEFAULT_BRIEF);
    const hood = a.xray.lines.find((l) => l.id === "hood");
    expect(hood?.status).toBe("saved");
    expect(hood?.findingId).toBe(vision?.id);
    expect(hood?.reason).toContain(vision?.evidence);
    expect(a.xray.saved.mid).toBeGreaterThanOrEqual(40_000);
    expect(a.timeToOpen.months.low).toBe(3);
  });
});

describe("money in sentences is rounded; numbers stay exact", () => {
  it("rounds dollars by size", () => {
    expect(usd(1_951_725)).toBe("$1.95M");
    expect(usd(103_110)).toBe("$103k");
    expect(usd(24_242)).toBe("$24k");
    expect(usd(4_540)).toBe("$4,500");
    expect(usd(950.4)).toBe("$950");
    expect(usd(-215_300)).toBe("-$215k");
    expect(usd(999_600)).toBe("$1.00M");
  });

  it("rounds yearly sales to the nearest $10k", () => {
    expect(usdSales(875_000)).toBe("$880k");
    expect(usdSales(1_020_858)).toBe("$1.02M");
    expect(usdSales(437_500)).toBe("$440k");
  });

  it("leaves no unrounded dollar figure in any sentence the engine writes, on every site and concept", () => {
    const concepts = ["quick-service", "fast-casual", "full-service", "cafe", "bar"] as const;
    // a dollar amount of $10,000 or more written out in full, or any amount with cents
    const unrounded = /\$\d{2,3},\d{3}(?!\d)(?!-)|\$\d{1,3},\d{3},\d{3}|\$\d+\.\d\d?(?![\dM])/;
    for (const site of loadSites())
      for (const concept of concepts) {
        const a = analyzeSite(site, { ...DEFAULT_BRIEF, concept });
        const sentences = [
          a.seats.basis,
          a.occupancy.basis,
          a.timeToOpen.basis,
          a.scenarios.verdict,
          a.graveyard.summary,
          ...a.breakeven.assumptions.map((x) => x.label),
          ...a.scenarios.assumptions.map((x) => x.label),
          ...a.score.reasons,
          ...a.score.flags,
          ...a.trend.signals.map((x) => x.detail),
        ];
        for (const s of sentences) expect(s, `${site.id} ${concept}`).not.toMatch(unrounded);
      }
  });

  it("keeps numeric fields exact", () => {
    const a = analyzeSite(makeSite({ space: { sf: 2894, rentPerSfYr: 20.22 } }), DEFAULT_BRIEF);
    expect(a.occupancy.annualUsd.mid).toBeCloseTo(2894 * 28.22, 6);
    expect(a.occupancy.basis).toMatch(/^\$20\/SF\/yr asking rent/);
    expect(a.breakeven.assumptions[1].label).toBe("To keep rent at 8% of sales: $1.02M/yr");
  });
});
