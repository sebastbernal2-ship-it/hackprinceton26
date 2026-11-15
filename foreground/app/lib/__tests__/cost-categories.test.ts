import { describe, expect, it } from "vitest";
import { allInTotal, buildCostBreakdown, sumSubtotals, type BreakdownInput } from "../cost-categories";
import { climateRunningCostDelta } from "../climate";
import { xrayLines } from "../cost-side";
import type { Asset } from "../assets";
import type { LayoutCost } from "../layout-cost";
import type { TotalCost } from "../total-cost";
import type { ClimateModel } from "../structure";

const kit = [{ assetId: "convection_oven_full" }, { assetId: "sink_hand_17" }] as unknown as Asset[];
const lc: LayoutCost = {
  lines: [
    { assetId: "espresso", label: "Espresso", quantity: 1, low: 3549, high: 3549, status: "observed", source: "https://shop.example/e" },
    { assetId: "table", label: "Table", quantity: 4, low: 352.4, high: 2200.6, status: "estimated", source: "estimate://x" },
  ],
  unpriced: [{ assetId: "sink", quantity: 2, reason: "no catalogue price for this piece" }],
  equipment: { low: 3901, high: 5750 },
  fitout: { squareFeet: 900, low: 54000, high: 337500, status: "estimated", source: "estimate://x" },
  buildout: { p5: 118792.77, p50: 232168.11, p95: 344722.3 }, pOverBudget: null, budget: null, totalStatus: "partial", notice: "",
};
const tc = (over: Partial<TotalCost> = {}): TotalCost => ({
  listingId: 1, months: 12, squareFeet: 900, buildingSquareFeet: null, rentOptions: [], rentChosen: null,
  parts: [
    { id: "operating", label: "Utilities and maintenance", basis: "monthly", low: 402.45, high: 1906.96, status: "estimated", source: "s" },
    { id: "rent", label: "Rent", basis: "monthly", low: 1275, high: 1275, status: "derived", source: "s" },
  ],
  excluded: [{ id: "buildout", reason: "priced from layout" }], oneTime: null, monthly: { low: 1677.45, high: 3181.96 }, total: null, totalStatus: "partial", notice: "", ...over,
});
const model = (cool: number, ins: number): ClimateModel => ({ scenarios: ["Intermediate"], horizons: [2050], assumptions: {}, notice: "", metrics: ["cool", "ins"].map((id, i) => ({ id, label: id, unit: "", kind: "demo", today: 0, note: "", series: { Intermediate: { "2050": i ? ins : cool } } })) as unknown as ClimateModel["metrics"] });
const input = (over: Partial<BreakdownInput> = {}): BreakdownInput => ({ fromLayout: true, lc, nameFor: (id) => `Name ${id}`, xray: xrayLines(kit), tc: tc(), climate: null, ...over });

describe("one-time categories", () => {
  const b = buildCostBreakdown(input());
  const cat = (id: string) => b.oneTime.find((c) => c.id === id)!;

  it("has every category in order and subtotals add up exactly to the headline", () => {
    expect(b.oneTime.map((c) => c.id)).toEqual(["equipment", "install", "repairs", "permits", "contingency"]);
    expect(b.oneTimeTotal).not.toBeNull();
    expect(sumSubtotals(b.oneTime)).toEqual(b.oneTimeTotal);
    // the same headline the Quantify summary shows: P5/P95 of the build-out plus hidden systems at their counted share
    expect(b.oneTimeTotal).toEqual(allInTotal(lc.buildout!, xrayLines(kit)));
    // low = P5 118,793 + hidden lows (hood 10,000 + grease 2,500 + electrical 5,000 + ada 2,500 + permits 3,000)
    expect(b.oneTimeTotal!.low).toBe(118793 + 23000);
  });

  it("equipment lists quantity and unit price; the unpriced piece is named with its reason and adds nothing", () => {
    const e = cat("equipment");
    expect(e.count).toBe(3);
    expect(e.items[1]).toMatchObject({ label: "Name table", quantity: 4, unitLow: 88, unitHigh: 550, low: 352, high: 2201, status: "estimated" });
    const u = e.items[2];
    expect(u).toMatchObject({ status: "unpriced", low: null, expected: null, high: null, quantity: 2 });
    expect(u.note).toContain("no catalogue price");
    expect(e.subtotal).toEqual({ low: 3901, expected: 3549 + 1277, high: 5750 });
    expect([e.observed, e.estimated, e.unpriced]).toEqual([1, 1, 1]);
  });

  it("an unpriced-only category has no subtotal (not $0) and no share", () => {
    const b2 = buildCostBreakdown(input({ lc: { ...lc, fitout: null } }));
    const i = b2.oneTime.find((c) => c.id === "install")!;
    expect(i.subtotal).toBeNull();
    expect(i.share).toBeNull();
    expect(i.items[0]).toMatchObject({ status: "unpriced", low: null });
    expect(i.items[0].note).toContain("no floor area");
    expect(sumSubtotals(b2.oneTime)).toEqual(b2.oneTimeTotal);
  });

  it("hidden systems are counted at half weight, permits in full, and follow the placed pieces", () => {
    const rep = cat("repairs");
    expect(rep.items.map((i) => i.id)).toEqual(["hood", "grease", "electrical", "ada"]);
    expect(rep.items[0]).toMatchObject({ low: 10000, high: 30000, unitLow: 20000, unitHigh: 60000 });
    expect(cat("permits").items[0]).toMatchObject({ id: "permits", low: 3000, high: 20000 });
    const none = buildCostBreakdown(input({ xray: xrayLines([]) }));
    expect(none.oneTime.find((c) => c.id === "repairs")!.items.map((i) => i.id)).toEqual(["ada"]);
    expect(sumSubtotals(none.oneTime)).toEqual(none.oneTimeTotal);
  });

  it("shares of the expected total add up to 1", () => {
    expect(b.oneTime.reduce((s, c) => s + (c.share ?? 0), 0)).toBeCloseTo(1, 10);
  });

  it("is not priced until the build-out answers", () => {
    const wait = buildCostBreakdown(input({ lc: null }));
    expect(wait.oneTime).toEqual([]);
    expect(wait.oneTimeTotal).toBeNull();
  });

  it("without placed pieces the generic build-out is one bundled item and still sums to the total", () => {
    const g = buildCostBreakdown(input({ fromLayout: false, lc: null, tc: tc({ parts: [{ id: "buildout", label: "Build-out", basis: "one_time", low: 108509.88, high: 495417.1, status: "estimated", source: "s" }, ...tc().parts], oneTime: { low: 108509.88, high: 495417.1 } }) }));
    expect(g.oneTimeTotal).toEqual({ low: 108510, expected: 301964, high: 495417 });
    expect(sumSubtotals(g.oneTime)).toEqual(g.oneTimeTotal);
    expect(g.oneTime.find((c) => c.id === "equipment")!.subtotal).toBeNull();
    expect(g.oneTime.find((c) => c.id === "install")!.items[0].label).toContain("generic estimate");
  });
});

describe("running categories and the climate line", () => {
  it("rent and running costs sum to the monthly headline with no climate line", () => {
    const b = buildCostBreakdown(input());
    expect(b.running.map((c) => c.id)).toEqual(["rent", "running", "climate"]);
    expect(b.runningBase).toEqual({ low: 1677, expected: 2430, high: 3182 });
    expect(sumSubtotals(b.running)).toEqual(b.runningBase);
    expect(b.runningTotal).toEqual(b.runningBase);
    expect(b.running[2].subtotal).toBeNull();
  });

  it("the climate line is a labelled demo estimate per month and is included in the running total", () => {
    const climate = climateRunningCostDelta(model(1200, 1200), "Intermediate", 2050)!; // 2400 a year
    const b = buildCostBreakdown(input({ climate: { kind: "ready", cost: climate } }));
    const c = b.running[2];
    expect(c.label).toContain("demo estimate");
    expect(c.items[0]).toMatchObject({ low: 200, expected: 200, high: 200, status: "estimated" });
    expect(c.items[0].note).toContain("demo estimate");
    expect(b.runningTotal).toEqual({ low: 1877, expected: 2630, high: 3382 });
    expect(sumSubtotals(b.running)).toEqual(b.runningTotal);
    const hi = buildCostBreakdown(input({ climate: { kind: "ready", cost: climateRunningCostDelta(model(3000, 600), "Intermediate", 2050)! } }));
    expect(hi.running[2].subtotal!.expected).toBe(300);
  });

  it("an unavailable climate model is named with its reason, never $0, and does not change the total", () => {
    const b = buildCostBreakdown(input({ climate: { kind: "unavailable", reason: "no climate model for this property" } }));
    const c = b.running[2];
    expect(c.subtotal).toBeNull();
    expect(c.items[0]).toMatchObject({ status: "unpriced", low: null });
    expect(c.items[0].note).toContain("no climate model");
    expect(b.runningTotal).toEqual(b.runningBase);
  });

  it("an excluded rent is listed as unknown with its reason", () => {
    const b = buildCostBreakdown(input({ tc: tc({ parts: [tc().parts[0]], monthly: { low: 402.45, high: 1906.96 }, excluded: [{ id: "rent", reason: "enter the square feet you would lease" }] }) }));
    const rent = b.running[0];
    expect(rent.subtotal).toBeNull();
    expect(rent.items[0].note).toContain("enter the square feet");
    expect(sumSubtotals(b.running)).toEqual(b.runningBase);
  });

  it("rounding never breaks the sum when halves meet", () => {
    const b = buildCostBreakdown(input({ tc: tc({ parts: [{ ...tc().parts[0], low: 100.5, high: 200.5 }, { ...tc().parts[1], low: 100.5, high: 200.5 }], monthly: { low: 201, high: 401 } }) }));
    expect(sumSubtotals(b.running)).toEqual(b.runningBase);
  });

  it("no cost response yet means no running total", () => {
    const b = buildCostBreakdown(input({ tc: null }));
    expect(b.runningTotal).toBeNull();
    expect(b.running.every((c) => c.subtotal === null)).toBe(true);
  });
});
