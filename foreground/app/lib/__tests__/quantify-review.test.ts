import { describe, expect, it } from "vitest";
import type { Asset } from "../assets";
import { fitSummary, freshResponse, scenarioKey } from "../layout-cost";
import { effectiveSqft } from "../total-cost";

const piece = (id: string, w: number, d: number) =>
  ({ assetId: id, name: id, footprint: [[0, 0], [w, 0], [w, d], [0, d], [0, 0]], clearance: { front: 0.5, sides: 0.05, back: 0.05 }, dims: { w, d, h: 1 } }) as unknown as Asset;

describe("a cost response is shown only for the scenario it was computed for", () => {
  it("matches the current key", () => {
    const key = scenarioKey([{ assetId: "a", quantity: 1 }], 1200, 200000);
    expect(freshResponse({ key, data: { x: 1 } }, key)).toEqual({ x: 1 });
  });
  it("is hidden while a changed scenario is recalculating", () => {
    const old = scenarioKey([{ assetId: "a", quantity: 1 }], 1200, 200000);
    const now = scenarioKey([{ assetId: "a", quantity: 1 }], 800, 200000);
    expect(now).not.toBe(old);
    expect(freshResponse({ key: old, data: { x: 1 } }, now)).toBeNull();
  });
  it("is null before any response", () => expect(freshResponse(null, "k")).toBeNull());
});

describe("fit of the selected pieces on the assumed floor", () => {
  it("says there is no floor when no area is entered", () => {
    const f = fitSummary([piece("a", 1, 1)], null);
    expect(f.noFloor).toBe(true);
    expect(f.unplaced).toEqual([]);
  });
  it("reports the pieces that do not fit a small floor", () => {
    const f = fitSummary([piece("big", 20, 20), piece("small", 0.5, 0.5)], 100);
    expect(f.noFloor).toBe(false);
    expect(f.total).toBe(2);
    expect(f.unplaced.map((u) => u.assetId)).toEqual(["big"]);
  });
  it("reports nothing unplaced when everything fits", () => {
    expect(fitSummary([piece("small", 0.5, 0.5)], 1500).unplaced).toEqual([]);
  });
});

describe("rent area follows the shared area until the person edits the panel's own field", () => {
  it("tracks the shared area", () => {
    expect(effectiveSqft(null, 1200)).toBe("1200");
    expect(effectiveSqft(null, 800)).toBe("800");
  });
  it("a typed value wins over the shared area", () => {
    expect(effectiveSqft("950", 1200)).toBe("950");
  });
  it("is empty without any area", () => {
    expect(effectiveSqft(null, undefined)).toBe("");
    expect(effectiveSqft(null, 0)).toBe("");
  });
});
