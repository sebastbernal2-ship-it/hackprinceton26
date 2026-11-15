import { describe, expect, it } from "vitest";
import { xray } from "@/lib/engine/xray";
import benchmarks from "@/data/benchmarks.json";
import { finding, makeSite, tenant } from "./fixtures";

const brief = { concept: "fast-casual" as const, budgetUsd: 150_000 };
const line = (x: ReturnType<typeof xray>, id: string) => {
  const l = x.lines.find((l) => l.id === id);
  if (!l) throw new Error(`no line ${id}`);
  return l;
};
const B = benchmarks.xray;

describe("xray lines from findings", () => {
  it("marks an existing hood and grease interceptor as saved with the finding id", () => {
    const x = xray(makeSite({ findings: [finding("hood", "present"), finding("grease-trap", "present")] }), brief);
    expect(line(x, "hood").status).toBe("saved");
    expect(line(x, "hood").findingId).toBe("f-hood");
    expect(line(x, "hood").range).toEqual({ low: B.hood.low, mid: 40_000, high: B.hood.high });
    expect(line(x, "grease-trap").status).toBe("saved");
    expect(x.saved.low).toBe(B.hood.low + B.greaseInGround.low);
    expect(x.saved.high).toBe(B.hood.high + B.greaseInGround.high);
  });

  it("marks a missing hood as needed", () => {
    const x = xray(makeSite({ findings: [finding("hood", "absent")] }), brief);
    expect(line(x, "hood").status).toBe("needed");
  });

  it("marks an unknown or unchecked hood as maybe", () => {
    expect(line(xray(makeSite({ findings: [finding("hood", "unknown")] }), brief), "hood").status).toBe("maybe");
    expect(line(xray(makeSite(), brief), "hood").status).toBe("maybe");
  });

  it("treats unchecked systems in a first-generation shell as needed, including sewer", () => {
    const x = xray(makeSite({ space: { spaceType: "New" } }), brief);
    for (const id of ["hood", "grease-trap", "walk-in", "ada-restroom", "electrical", "gas", "sewer"])
      expect(line(x, id).status).toBe("needed");
  });

  it("leaves sewer out for a second-generation space unless a finding raises it", () => {
    expect(xray(makeSite(), brief).lines.some((l) => l.id === "sewer")).toBe(false);
    const x = xray(makeSite({ findings: [finding("sewer", "absent")] }), brief);
    expect(line(x, "sewer").status).toBe("needed");
  });

  it("reads either a restrooms or an ada finding for the ADA restroom line", () => {
    const withRestrooms = xray(makeSite({ findings: [finding("restrooms", "present")] }), brief);
    expect(line(withRestrooms, "ada-restroom").status).toBe("saved");
    const noAda = xray(makeSite({ findings: [finding("ada", "absent")] }), brief);
    expect(line(noAda, "ada-restroom").status).toBe("needed");
  });

  it("prices a point-of-use grease trap for a cafe and an in-ground interceptor for full service", () => {
    const site = makeSite({ findings: [finding("grease-trap", "absent")] });
    expect(line(xray(site, { concept: "cafe" }), "grease-trap").range.high).toBe(B.greasePointOfUse.high);
    expect(line(xray(site, { concept: "full-service" }), "grease-trap").range.high).toBe(B.greaseInGround.high);
  });

  it("downgrades a missing hood to maybe for a cafe or bar, which may not cook under a Type 1 hood", () => {
    const site = makeSite({ findings: [finding("hood", "absent")] });
    expect(line(xray(site, { concept: "cafe" }), "hood").status).toBe("maybe");
    expect(line(xray(site, { concept: "bar" }), "hood").status).toBe("maybe");
  });
});

describe("xray base lines", () => {
  it.each([
    ["a prior restaurant use finding", { findings: [finding("prior-use", "present")] }],
    ["an existing hood", { findings: [finding("hood", "present")] }],
    ["a past food tenant in the same suite", { tenantHistory: [tenant({ sameSuite: true })] }],
  ])("prices base build-out at the second-generation refresh rate given %s", (_why, evidence) => {
    const l = line(xray(makeSite({ space: { sf: 2000 }, ...evidence }), brief), "base-buildout");
    expect(l.status).toBe("needed");
    expect(l.range.low).toBe(2000 * B.baseBuildoutPerSf.secondGen.low);
    expect(l.range.high).toBe(2000 * B.baseBuildoutPerSf.secondGen.high);
    expect(l.label).toMatch(/second-generation/i);
  });

  it("prices base build-out at the full shell rate for a first-generation space", () => {
    const l = line(xray(makeSite({ space: { sf: 2000, spaceType: "New" } }), brief), "base-buildout");
    expect(l.range.low).toBe(2000 * B.baseBuildoutPerSf.shell.low);
  });

  it("prices a relet space with no sign of a past restaurant at the shell rate, even if a food tenant was elsewhere", () => {
    const site = makeSite({
      space: { sf: 2000 },
      findings: [finding("prior-use", "unknown"), finding("hood", "absent")],
      tenantHistory: [tenant({ sameSuite: false })],
    });
    const l = line(xray(site, brief), "base-buildout");
    expect(l.range.low).toBe(2000 * B.baseBuildoutPerSf.shell.low);
    expect(l.range.high).toBe(2000 * B.baseBuildoutPerSf.shell.high);
    expect(l.reason).toMatch(/no sign of a past restaurant/i);
  });

  it("scales FF&E to the seats the owner will operate, cheaper per seat when a kitchen is already there", () => {
    const secondGen = makeSite({ findings: [finding("prior-use", "present")] });
    const forty = line(xray(secondGen, { concept: "fast-casual", seats: 40 }), "ffe");
    expect(forty.range).toEqual({
      low: 40 * B.ffePerSeat.secondGen.low,
      mid: 20 * (B.ffePerSeat.secondGen.low + B.ffePerSeat.secondGen.high),
      high: 40 * B.ffePerSeat.secondGen.high,
    });
    expect(forty.reason).toMatch(/40 seats/);
    // 1,800 SF fits 86 fast-casual seats
    expect(line(xray(secondGen, { concept: "fast-casual" }), "ffe").range.low).toBe(86 * B.ffePerSeat.secondGen.low);
    expect(line(xray(secondGen, { concept: "fast-casual", seats: 500 }), "ffe").range.low).toBe(
      86 * B.ffePerSeat.secondGen.low,
    );
    expect(line(xray(makeSite(), { concept: "fast-casual", seats: 40 }), "ffe").range.low).toBe(
      40 * B.ffePerSeat.shell.low,
    );
  });

  it("leaves unchecked electrical and gas out of a former restaurant but keeps them as maybe elsewhere", () => {
    const former = xray(makeSite({ findings: [finding("prior-use", "present")] }), brief);
    expect(former.lines.some((l) => l.id === "electrical" || l.id === "gas")).toBe(false);
    expect(line(former, "walk-in").status).toBe("maybe");
    // a restaurant already ran on these services, so "could not see it" is not a cost risk; only a clear finding counts
    const unsure = xray(
      makeSite({
        findings: [finding("prior-use", "present"), finding("electrical", "unknown"), finding("gas", "absent")],
      }),
      brief,
    );
    expect(unsure.lines.some((l) => l.id === "electrical")).toBe(false);
    expect(line(unsure, "gas").status).toBe("needed");
    const retail = xray(makeSite(), brief);
    expect(line(retail, "electrical").status).toBe("maybe");
    expect(line(retail, "gas").status).toBe("maybe");
  });

  it("lands a 3,000 SF second-generation space with a hood near $150-250k and a similar shell above $400k", () => {
    const forty = { concept: "fast-casual" as const, seats: 40, budgetUsd: 250_000 };
    const secondGen = xray(
      makeSite({ space: { sf: 3000 }, findings: [finding("hood", "present"), finding("prior-use", "present")] }),
      forty,
    );
    expect(secondGen.total.mid).toBeGreaterThan(150_000);
    expect(secondGen.total.mid).toBeLessThan(260_000);
    expect(secondGen.saved.mid).toBe(40_000);
    const fitted = xray(
      makeSite({
        space: { sf: 3000 },
        findings: [finding("hood", "present"), finding("grease-trap", "present"), finding("walk-in", "present")],
      }),
      forty,
    );
    expect(fitted.total.mid).toBeLessThan(250_000);
    expect(fitted.overBudget).toBe(false);
    const shell = xray(makeSite({ space: { sf: 3000, spaceType: "New" } }), forty);
    expect(shell.total.mid).toBeGreaterThan(400_000);
    expect(shell.overBudget).toBe(true);
    expect(xray(makeSite({ space: { sf: 3000 } }), forty).total.mid).toBeGreaterThan(400_000);
  });

  it("always includes FF&E, permits and a 30% contingency line", () => {
    const x = xray(makeSite(), brief);
    expect(line(x, "ffe").status).toBe("needed");
    expect(line(x, "permits").status).toBe("needed");
    expect(line(x, "contingency").kind).toBe("contingency");
  });

  it("gives every line a low <= mid <= high range, a reason and a source", () => {
    for (const l of xray(makeSite({ findings: [finding("hood", "unknown")] }), brief).lines) {
      expect(l.range.low).toBeLessThanOrEqual(l.range.mid);
      expect(l.range.mid).toBeLessThanOrEqual(l.range.high);
      expect(l.reason.length).toBeGreaterThan(0);
      expect(l.source.length).toBeGreaterThan(0);
    }
  });
});

describe("xray total and budget", () => {
  it("totals needed lines plus half of maybe lines plus 30% contingency, and excludes saved lines", () => {
    const site = makeSite({
      space: { sf: 1000 },
      findings: [
        finding("hood", "present"),
        finding("grease-trap", "absent"),
        finding("walk-in", "unknown"),
        finding("restrooms", "present"),
        finding("electrical", "present"),
        finding("gas", "present"),
      ],
    });
    const x = xray(site, { concept: "fast-casual", seats: 40 });
    const F = B.ffePerSeat.secondGen;
    const needLow = 1000 * B.baseBuildoutPerSf.secondGen.low + B.greaseInGround.low + 40 * F.low + B.permits.low;
    const subLow = needLow + 0.5 * B.walkIn.low;
    expect(line(x, "contingency").range.low).toBeCloseTo(subLow * 0.3, 6);
    expect(x.total.low).toBeCloseTo(subLow * 1.3, 6);
    const needHigh = 1000 * B.baseBuildoutPerSf.secondGen.high + B.greaseInGround.high + 40 * F.high + B.permits.high;
    expect(x.total.high).toBeCloseTo((needHigh + 0.5 * B.walkIn.high) * 1.3, 6);
    expect(x.total.mid).toBeCloseTo((x.total.low + x.total.high) / 2, 6);
  });

  it("flags over budget when the total midpoint exceeds the owner's budget", () => {
    expect(xray(makeSite(), { concept: "fast-casual", budgetUsd: 50_000 }).overBudget).toBe(true);
    expect(xray(makeSite(), { concept: "fast-casual", budgetUsd: 5_000_000 }).overBudget).toBe(false);
  });

  it("returns null for overBudget when the owner gave no budget", () => {
    expect(xray(makeSite(), { concept: "fast-casual" }).overBudget).toBeNull();
  });
});
