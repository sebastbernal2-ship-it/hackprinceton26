import { describe, expect, it } from "vitest";
import type { Asset } from "../assets";
import { briefBudget, budgetStatus, outlook, seatTotal, xrayLines, xrayTotal, zeroCrossing } from "../cost-side";

const a = (assetId: string, category = "equipment") => ({ assetId, category, name: assetId }) as unknown as Asset;

describe("briefBudget", () => {
  it("reads the stated budget", () => {
    expect(briefBudget([{ question: "q", answer: "my build-out budget is under $250,000. I want a cafe" }])).toBe(250000);
    expect(briefBudget([{ question: "q", answer: "budget around $200k" }])).toBe(200000);
  });
  it("is null when none is stated", () => expect(briefBudget([{ question: "q", answer: "a cafe, 1000 sq ft, $5 coffee" }])).toBeNull());
});

describe("xray", () => {
  it("follows the placed pieces", () => {
    const ids = (kit: Asset[]) => xrayLines(kit).map((l) => l.id);
    expect(ids([])).toEqual(["ada", "permits"]);
    expect(ids([a("convection_oven_full"), a("sink_hand_17")])).toEqual(["hood", "grease", "electrical", "ada", "permits"]);
  });
  it("counts unknown systems at half and permits in full", () => {
    expect(xrayTotal(xrayLines([]))).toEqual({ low: 5500, high: 32500 });
  });
});

describe("outlook", () => {
  it("scales with seats and pays back when profit is positive", () => {
    const o = outlook(30, 100000, 20000);
    expect(o.cases.base.sales).toBe(30 * 3.5 * 9 * 360);
    expect(o.cases.strong.profit[1]).toBeGreaterThan(o.cases.base.profit[1]);
    expect(o.cases.base.cash[0]).toBe(-100000);
    expect(o.cases.base.paybackMonths).toBeGreaterThan(0);
    expect(outlook(60, 100000, 20000).cases.base.paybackMonths!).toBeLessThan(o.cases.base.paybackMonths!);
  });
  it("never pays back without profit and has no turns without seats", () => {
    expect(outlook(2, 100000, 50000).cases.base.paybackMonths).toBeNull();
    const none = outlook(0, 1000, 1000);
    expect(none.breakEvenTurns).toBeNull();
    expect(none.verdict).toBe("unknown");
  });
  it("seatTotal counts seating only", () => expect(seatTotal([a("chair_dining", "seating"), a("booth_60", "seating"), a("table_2top_30", "table")])).toBe(5));
});

describe("helpers", () => {
  it("zeroCrossing", () => {
    expect(zeroCrossing([-10, -5, 5])).toBeCloseTo(1.5);
    expect(zeroCrossing([-1, -2])).toBeNull();
  });
  it("budgetStatus", () => {
    expect(budgetStatus({ low: 1, high: 2 }, null).tone).toBe("unknown");
    expect(budgetStatus({ low: 300, high: 400 }, 250).tone).toBe("over");
    expect(budgetStatus({ low: 100, high: 200 }, 250).tone).toBe("under");
    expect(budgetStatus({ low: 100, high: 300 }, 250).tone).toBe("tight");
  });
});
