import { describe, expect, it } from "vitest";
import { editDims, rectFootprint, type Asset } from "../assets";

const closed = (fp: [number, number][]) => fp.length >= 4 && fp[0][0] === fp[fp.length - 1][0] && fp[0][1] === fp[fp.length - 1][1];

describe("editing dims keeps the footprint a closed ring", () => {
  it("rectFootprint closes the ring", () => {
    expect(rectFootprint(2, 0.8)).toEqual([[0, 0], [2, 0], [2, 0.8], [0, 0.8], [0, 0]]);
  });
  it("regenerates a closed rectangle for a rectangular proposal", () => {
    const a = { dims: { w: 1, d: 1, h: 1 }, footprint: rectFootprint(1, 1) } as Asset;
    const out = editDims(a, "w", 2.5);
    expect(out.dims.w).toBe(2.5);
    expect(closed(out.footprint)).toBe(true);
    expect(out.footprint[2]).toEqual([2.5, 1]);
  });
  it("also regenerates from the legacy open four-point ring", () => {
    const a = { dims: { w: 1, d: 1, h: 1 }, footprint: [[0, 0], [1, 0], [1, 1], [0, 1]] } as Asset;
    expect(closed(editDims(a, "d", 2).footprint)).toBe(true);
  });
  it("leaves non-rectangular footprints alone", () => {
    const l = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]] as [number, number][];
    expect(editDims({ dims: { w: 2, d: 2, h: 1 }, footprint: l } as Asset, "h", 2).footprint).toEqual(l);
  });
});
