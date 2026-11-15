import { describe, expect, it } from "vitest";
import {
  ADJACENT_MILES, REGION_MILES, RING_MILES, chipFor, distanceText, dotLabel, indexBand, intervalText, outcomeCounts, placeDots, polar, ringRadius, topNeighbours,
  type NearbyFood, type Neighbour,
} from "../business-peers";

const food = (o: Partial<NearbyFood>): NearbyFood => ({ id: "P-1", distanceMi: 0.5, bearingDeg: 90, kind: "cafe_coffee", relation: "direct", outcome: "open", years: 3, demo: false, ...o });
const nb = (o: Partial<Neighbour>): Neighbour => ({ id: "P-1", distanceMi: 1, kind: "cafe_coffee", relation: "direct", sameKind: true, weight: 0.1, outcome: "open", years: 3, startYear: 2020, market: "Houston", demo: false, ...o });

describe("ring geometry", () => {
  it("grows monotonically and puts the rings in order", () => {
    const r = RING_MILES.map(ringRadius);
    expect(r[0]).toBeLessThan(r[1]);
    expect(r[1]).toBeLessThan(r[2]);
    expect(ringRadius(REGION_MILES)).toBeGreaterThan(ringRadius(1));
    expect(ringRadius(10)).toBe(ringRadius(REGION_MILES)); // clamped to the region ring
    expect(ringRadius(0)).toBe(0);
    expect(ringRadius(-1)).toBe(0);
  });
  it("the adjacent zone sits inside the first ring", () => {
    expect(ringRadius(ADJACENT_MILES)).toBeLessThan(ringRadius(0.25));
    expect(ADJACENT_MILES * 1609.344).toBeCloseTo(150, 5);
  });
  it("places north up and east right", () => {
    const n = polar(0, 50);
    const e = polar(90, 50);
    expect(n.x).toBeCloseTo(160);
    expect(n.y).toBeLessThan(160);
    expect(e.x).toBeGreaterThan(160);
    expect(e.y).toBeCloseTo(160);
  });
  it("spreads same-building businesses so no dot hides another", () => {
    const dots = placeDots([food({ id: "a", distanceMi: 0 }), food({ id: "b", distanceMi: 0 }), food({ id: "c", distanceMi: 0 })]);
    const keys = new Set(dots.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`));
    expect(keys.size).toBe(3);
  });
});

describe("labels and formatting", () => {
  it("never turns an unknown into a zero", () => {
    expect(intervalText(null)).toBe("cannot say");
    expect(intervalText({ value: null, low: null, high: null, evaluable: false })).toBe("cannot say");
    expect(intervalText({ value: 0, low: 0, high: 0.05, evaluable: true })).toBe("0% (0-5%)");
    expect(intervalText({ value: 0.742, low: 0.68, high: 0.81, evaluable: true })).toBe("74% (68-81%)");
    expect(intervalText({ value: 2.14, low: 1.8, high: 2.5, evaluable: true }, false)).toBe("2.1 y (1.8-2.5 y)");
    expect(intervalText({ value: 0.5, low: null, high: null, evaluable: true })).toBe("50%");
  });
  it("labels demo above everything else", () => {
    expect(chipFor("neighbour", true)).toBe("demo");
    expect(chipFor("neighbour", false)).toBe("observed");
    expect(chipFor("aggregate", false)).toBe("estimated");
    expect(chipFor("index", false)).toBe("derived");
  });
  it("describes a dot for screen readers, tagging demo", () => {
    expect(dotLabel({ kind: "bakery", relation: "direct", outcome: "closed", years: 1.6, distanceMi: 0.71, demo: true })).toBe("DEMO direct competitor, bakery, 0.71 mi, closed after 1.6 y");
    expect(distanceText(0.05)).toBe("80 m");
  });
  it("bands the index in words, not a verdict", () => {
    expect(indexBand(null)).toBe("cannot say");
    expect(indexBand(30)).toBe("low context");
    expect(indexBand(50)).toBe("mixed context");
    expect(indexBand(88)).toBe("supportive context");
  });
});

describe("neighbour lists", () => {
  it("orders by distance, same kind first on ties, without mutating", () => {
    const input = [nb({ id: "c", distanceMi: 2 }), nb({ id: "a", distanceMi: 1, sameKind: false }), nb({ id: "b", distanceMi: 1 })];
    const out = topNeighbours(input, 2);
    expect(out.map((n) => n.id)).toEqual(["b", "a"]);
    expect(input[0].id).toBe("c");
  });
  it("counts outcomes and direct competitors", () => {
    const c = outcomeCounts([food({}), food({ outcome: "closed", relation: "partial" }), food({ outcome: "moved", relation: "complement" })]);
    expect(c).toEqual({ open: 1, closed: 1, moved: 1, direct: 1 });
  });
});
