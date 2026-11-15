import { describe, expect, it } from "vitest";
import { defaultControls, variantParams } from "../variant-params";
import type { Asset } from "../assets";

const parent = { dims: { w: 1.8288, d: 0.762, h: 0.9144 }, allowedSizes: null } as unknown as Asset;

describe("variantParams matches the backend make_variant contract", () => {
  it("corner_l sends armA/armB/depthA/depthB", () => {
    const c = { ...defaultControls(parent), armA: 2, armB: 1.8 };
    expect(variantParams("corner_l", parent, c)).toEqual({ armA: 2, armB: 1.8, depthA: 0.762, depthB: 0.762 });
  });
  it("wall_run sends length", () => {
    expect(variantParams("wall_run", parent, { ...defaultControls(parent), length: 2.4 })).toEqual({ length: 2.4 });
  });
  it("scaled sends w/d/h", () => {
    expect(variantParams("scaled", parent, { ...defaultControls(parent), w: 2 })).toEqual({ w: 2, d: 0.762, h: 0.9144 });
  });
  it("island and mirrored send no params", () => {
    expect(variantParams("island", parent, defaultControls(parent))).toEqual({});
    expect(variantParams("mirrored", parent, defaultControls(parent))).toEqual({});
  });
  it("scaled uses the chosen discrete SKU", () => {
    const p = { ...parent, allowedSizes: [{ w: 1, d: 1, h: 1, label: "a" }, { w: 2, d: 1, h: 1, label: "b" }] } as Asset;
    expect(variantParams("scaled", p, defaultControls(p), 1)).toEqual({ w: 2, d: 1, h: 1 });
  });
});
