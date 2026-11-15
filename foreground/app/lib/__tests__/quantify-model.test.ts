import { describe, expect, it } from "vitest";
import { allInRange, budgetGap, defaultArea, defaultSeats, delta, describeChange, fmtDelta, lineDeltas, parsePositive, parseSeats, paybackText, rentRequest, resolveBudget, totalCostKey, type Inputs, type TotalCostInputs } from "../quantify-model";

const base: TotalCostInputs = { pid: 800827, sqft: 900, source: null, ownRate: "", months: 12, fromLayout: true };

describe("input parsing", () => {
  it("treats empty, zero, negative and junk as not entered", () => {
    for (const t of ["", " ", "0", "-5", "abc", null, undefined]) expect(parsePositive(t as string)).toBeNull();
    expect(parsePositive("1200")).toBe(1200);
  });
  it("accepts whole seat counts 1..500 only", () => {
    expect(parseSeats("16")).toBe(16);
    for (const t of ["", "0", "2.5", "501", "x"]) expect(parseSeats(t)).toBeNull();
  });
  it("prefills seats from the layout, then the planner", () => {
    expect(defaultSeats(12, 16)).toBe("12");
    expect(defaultSeats(0, 16)).toBe("16");
    expect(defaultSeats(null, 0)).toBe("");
  });
  it("prefills area from the planner, else the listing", () => {
    expect(defaultArea("900", 1497)).toBe("900");
    expect(defaultArea("", 1497.4)).toBe("1497");
    expect(defaultArea("", undefined)).toBe("");
  });
  it("uses a typed budget (even cleared) over the brief", () => {
    expect(resolveBudget(null, 250000)).toBe(250000);
    expect(resolveBudget("100000", 250000)).toBe(100000);
    expect(resolveBudget("", 250000)).toBeNull();
  });
});

describe("every input that changes the answer changes the request key", () => {
  const k = (o: Partial<TotalCostInputs>) => totalCostKey({ ...base, ...o });
  it("changes for area, rent option, own rate, period and layout mode", () => {
    const keys = [k({}), k({ sqft: 1800 }), k({ source: "metro" }), k({ source: "own", ownRate: "60" }), k({ source: "own", ownRate: "70" }), k({ months: 36 }), k({ fromLayout: false })];
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("is null with no property to ask about", () => expect(k({ pid: null })).toBeNull());
  it("ignores an own-rate draft until the own option is chosen, and an empty one equals the default", () => {
    expect(k({ ownRate: "55" })).toBe(k({}));
    expect(k({ source: "own", ownRate: "" })).toBe(k({}));
  });
});

describe("rent request", () => {
  it("sends an own rate as the rent, an option by id", () => {
    expect(rentRequest("own", "60")).toEqual({ rent: 60, rentSource: null });
    expect(rentRequest("metro", "60")).toEqual({ rent: null, rentSource: "metro" });
    expect(rentRequest(null, "")).toEqual({ rent: null, rentSource: null });
  });
});

describe("totals and budget", () => {
  it("adds hidden systems to the build-out percentiles", () => {
    expect(allInRange({ p5: 100, p95: 300 }, { low: 10, high: 20 })).toEqual({ low: 110, high: 320 });
    expect(allInRange(null, { low: 10, high: 20 })).toBeNull();
  });
  it("gap is budget minus the midpoint", () => {
    expect(budgetGap({ low: 100, high: 300 }, 250)).toBe(50);
    expect(budgetGap({ low: 100, high: 300 }, 100)).toBe(-100);
    expect(budgetGap({ low: 100, high: 300 }, null)).toBeNull();
  });
  it("words the break-even", () => {
    expect(paybackText(null)).toMatch(/No payback/);
    expect(paybackText(200)).toBe("Over 10 years");
    expect(paybackText(30)).toBe("30 months");
  });
});

describe("deltas", () => {
  it("is null without an earlier value or when rounded values match", () => {
    expect(delta(null, 5)).toBeNull();
    expect(delta(5, null)).toBeNull();
    expect(delta(100.2, 100.4)).toBeNull();
    expect(delta(100, 160)).toBe(60);
  });
  it("formats signed dollars", () => {
    expect(fmtDelta(12400)).toBe("+$12,400");
    expect(fmtDelta(-3000)).toBe("-$3,000");
  });
  it("reports changed, new and unchanged lines", () => {
    expect(lineDeltas(null, { a: 1 })).toEqual({});
    expect(lineDeltas({ a: 10, b: 5 }, { a: 25, b: 5, c: 7 })).toEqual({ a: 15, c: "new" });
  });
});

describe("describeChange", () => {
  const i: Inputs = { seats: "16", area: "900", budget: "250000", rent: "default", period: 12, kit: 31 };
  it("names what moved", () => {
    expect(describeChange(i, i)).toBeNull();
    expect(describeChange(i, { ...i, seats: "30", period: 36 })).toBe("Seats 16 to 30, Period (months) 12 to 36");
  });
});
