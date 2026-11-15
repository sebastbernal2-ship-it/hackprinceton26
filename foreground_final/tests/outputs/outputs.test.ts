import { describe, expect, it } from "vitest";
import { analyzeSite, breakeven, operatedSeats } from "@/lib/engine";
import { loadSite } from "@/lib/sites/load";
import { rentFor } from "@/lib/ml/rent";
import { buildAskList } from "@/lib/outputs/ask-list";
import { emailPrompt, fallbackEmail } from "@/lib/outputs/email";
import { buildMemo } from "@/lib/outputs/memo";
import { finding, makeSite, tenant } from "../engine/fixtures";

const brief = { concept: "fast-casual" as const, seats: 40, budgetUsd: 100_000 };

describe("ask list", () => {
  it("asks the landlord to pay for needed building systems, with the X-Ray range", () => {
    const site = makeSite({ findings: [finding("hood", "absent"), finding("grease-trap", "absent")] });
    const a = analyzeSite(site, brief);
    const asks = buildAskList(site, a);
    const hood = asks.find((x) => x.id === "credit-hood");
    expect(hood?.kind).toBe("line-credit");
    expect(hood?.value).toEqual(a.xray.lines.find((l) => l.id === "hood")?.range);
    expect(hood?.priority).toBe("high");
    expect(asks.find((x) => x.id === "credit-grease-trap")).toBeDefined();
  });

  it("sizes the TI allowance to the gap between the X-Ray midpoint and the budget", () => {
    const site = makeSite({ findings: [finding("hood", "absent")] });
    const a = analyzeSite(site, brief);
    const ti = buildAskList(site, a).find((x) => x.kind === "ti-allowance");
    expect(ti).toBeDefined();
    expect(ti?.value?.low).toBeCloseTo(a.xray.total.mid - 100_000);
    expect(ti?.value?.high).toBeGreaterThanOrEqual(ti!.value!.low);
    expect(ti?.title).toMatch(/\/SF/);
  });

  it("skips the TI allowance when the build fits the budget or no budget is given", () => {
    const site = makeSite();
    expect(buildAskList(site, analyzeSite(site, { ...brief, budgetUsd: 5_000_000 })).some((x) => x.kind === "ti-allowance")).toBe(false);
    expect(buildAskList(site, analyzeSite(site, { concept: "fast-casual" })).some((x) => x.kind === "ti-allowance")).toBe(false);
  });

  it("sizes free rent from the dead-rent range", () => {
    const site = makeSite();
    const a = analyzeSite(site, brief);
    const fr = buildAskList(site, a).find((x) => x.kind === "free-rent");
    expect(fr?.value).toEqual(a.timeToOpen.deadRentUsd);
  });

  it("targets a rent at which break-even is comfortable", () => {
    const site = makeSite({ space: { rentPerSfYr: 90 } });
    const a = analyzeSite(site, brief);
    expect(a.breakeven.verdict).not.toBe("comfortable");
    const ask = buildAskList(site, a).find((x) => x.kind === "rent-level");
    expect(ask).toBeDefined();
    expect(ask!.value!.low).toBeGreaterThan(0);
    // re-run the model at the asked rent: it should read comfortable when the target was reachable
    const m = /Rent of \$([\d.,]+)\/SF/.exec(ask!.title);
    const rent = Number(m![1].replace(",", ""));
    expect(rent).toBeLessThan(90);
    if (/reads comfortable/.test(ask!.why)) {
      const occ = (rent + a.occupancy.extrasPerSfYr) * site.space.sf;
      const be = breakeven({
        annualOccupancyUsd: occ,
        seats: operatedSeats(a.seats, brief),
        concept: brief.concept,
        caseSalesUsd: { base: a.scenarios.scenarios.base.annualSalesUsd, strong: a.scenarios.scenarios.strong.annualSalesUsd },
      });
      expect(be.verdict).toBe("comfortable");
    }
  });

  it("asks for the top of the fair-rent range, with comps, when the ask is above market", () => {
    const site = loadSite("1018657")!;
    const r = rentFor("1018657")!;
    expect(r.band).toBe("above market");
    expect(r.basisUncertain).toBe(false);
    const ask = buildAskList(site, analyzeSite(site, brief)).find((x) => x.kind === "rent-level");
    expect(ask).toBeDefined();
    expect(ask!.askedRentPerSfYr).toBeLessThanOrEqual(r.intervalHighPerSfYr);
    expect(ask!.askedRentPerSfYr).toBeLessThan(r.askingNnnEquivPerSfYr);
    expect(ask!.value!.low).toBeGreaterThan(0);
    expect(ask!.why).toContain(r.comps[0].address);
  });

  it("makes no fair-rent ask for in-line, below-market or basis-uncertain rents", () => {
    for (const id of ["431465", "256760", "20219730"]) {
      const site = loadSite(id)!;
      const ask = buildAskList(site, analyzeSite(site, brief)).find((x) => x.kind === "rent-level");
      expect(ask?.source ?? "").not.toContain("fair-rent model");
    }
  });

  it("asks for no rent cut when break-even is already comfortable", () => {
    const site = makeSite({ space: { rentPerSfYr: 8 } });
    const a = analyzeSite(site, brief);
    if (a.breakeven.verdict === "comfortable") expect(buildAskList(site, a).some((x) => x.kind === "rent-level")).toBe(false);
  });

  it("adds an inspection contingency for unknown findings, high priority for hood or grease", () => {
    const site = makeSite({ findings: [finding("hood", "unknown"), finding("restrooms", "unknown")] });
    const ins = buildAskList(site, analyzeSite(site, brief)).find((x) => x.kind === "inspection");
    expect(ins?.priority).toBe("high");
    expect(ins?.why).toMatch(/kitchen hood/);
    expect(ins?.why).toMatch(/ADA restroom/);
  });

  it("uses closed vs left wording for same-suite tenant history", () => {
    const left = makeSite({ tenantHistory: [tenant({ name: "Taco Place", outcome: "unknown", sameSuite: true })] });
    const h1 = buildAskList(left, analyzeSite(left, brief)).find((x) => x.kind === "history");
    expect(h1?.why).toMatch(/Taco Place left/);
    expect(h1?.why).not.toMatch(/fail/i);
    expect(h1?.why).toMatch(/None is recorded as closed/);

    const closed = makeSite({ tenantHistory: [tenant({ name: "Pho Spot", outcome: "closed", sameSuite: true })] });
    const h2 = buildAskList(closed, analyzeSite(closed, brief)).find((x) => x.kind === "history");
    expect(h2?.why).toMatch(/Pho Spot closed/);
    expect(h2?.value).toBeNull();
  });

  it("has no history ask without same-suite food tenants", () => {
    const site = makeSite({ tenantHistory: [tenant({ sameSuite: false })] });
    expect(buildAskList(site, analyzeSite(site, brief)).some((x) => x.kind === "history")).toBe(false);
  });

  it("ranks high priority first, larger dollars first within a priority", () => {
    const site = makeSite({ findings: [finding("hood", "absent"), finding("grease-trap", "unknown")] });
    const asks = buildAskList(site, analyzeSite(site, brief));
    const w = { high: 3, medium: 2, low: 1 };
    for (let i = 1; i < asks.length; i++) {
      const p = w[asks[i - 1].priority] - w[asks[i].priority];
      expect(p).toBeGreaterThanOrEqual(0);
      if (p === 0) expect(asks[i - 1].value?.mid ?? -1).toBeGreaterThanOrEqual(asks[i].value?.mid ?? -1);
    }
  });
});

describe("deal memo", () => {
  const site = makeSite({
    findings: [finding("hood", "absent"), finding("grease-trap", "unknown"), finding("electrical", "present")],
    tenantHistory: [tenant({ sameSuite: true, outcome: "unknown" })],
  });
  const a = analyzeSite(site, brief);
  const asks = buildAskList(site, a);
  const memo = buildMemo(site, a, asks, brief);

  it("carries facts, X-Ray against budget, break-even, three scenarios, risks, asks and sources", () => {
    expect(memo.facts.find((f) => f.label === "Space")?.value).toBe("1,800 SF");
    expect(memo.xray.total).toEqual(a.xray.total);
    expect(memo.xray.budgetUsd).toBe(100_000);
    expect(memo.xray.gapUsd).toBeCloseTo(a.xray.total.mid - 100_000);
    expect(memo.breakeven.verdict).toBe(a.breakeven.verdict);
    expect(memo.scenarios.rows.map((r) => r.name)).toEqual(["slow", "base", "strong"]);
    expect(memo.scenarios.rows[1].annualSalesUsd).toBe(a.scenarios.scenarios.base.annualSalesUsd);
    expect(memo.risks.length).toBeGreaterThan(0);
    expect(memo.asks).toBe(asks);
    expect(memo.sources.length).toBeGreaterThan(0);
  });

  it("splits X-Ray lines by status", () => {
    expect(memo.xray.needed.some((l) => l.label.includes("hood"))).toBe(true);
    expect(memo.xray.maybe.length).toBeGreaterThan(0);
    expect(memo.xray.saved.some((l) => l.label.includes("Electrical"))).toBe(true);
  });

  it("has a null gap without a budget", () => {
    const m = buildMemo(site, analyzeSite(site, { concept: "fast-casual" }), asks, { concept: "fast-casual" });
    expect(m.xray.gapUsd).toBeNull();
  });
});

describe("email", () => {
  const site = makeSite({ findings: [finding("hood", "absent")] });
  const a = analyzeSite(site, brief);
  const asks = buildAskList(site, a);

  it("fallback email lists the top asks with their figures", () => {
    const e = fallbackEmail(site, asks, brief);
    expect(e.startsWith("Hello,")).toBe(true);
    expect(e).toContain(asks[0].title);
    expect(e).toContain("1 Test St");
    expect(e).not.toMatch(/fail/i);
  });

  it("prompt grounds the model in the asks only", () => {
    const p = emailPrompt(site, asks, brief);
    expect(p.user).toContain(asks[0].title);
    expect(p.system).toMatch(/Do not invent/);
  });
});
