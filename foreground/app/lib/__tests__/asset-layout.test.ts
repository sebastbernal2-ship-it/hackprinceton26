import { describe, expect, it } from "vitest";
import { bbox, type Asset } from "../assets";
import { frontZone, placeAsset } from "../asset-layout";

const asset = {
  assetId: "a", name: "a", footprint: [[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]],
  clearance: { front: 0.5, sides: 0, back: 0 },
} as unknown as Asset;

// Local +y is the front. Each rotation turns the piece (and its front) counter-clockwise by rot degrees in the
// transform's frame: 0 -> front on +y, 90 -> -x, 180 -> -y, 270 -> +x.
describe("frontZone follows the footprint rotation", () => {
  const cases = [
    { rot: 0 as const, side: (b: ReturnType<typeof bbox>, z: ReturnType<typeof bbox>) => z.y0 === b.y1 && z.y1 === b.y1 + 0.5 && z.x0 === b.x0 && z.x1 === b.x1 },
    { rot: 90 as const, side: (b: ReturnType<typeof bbox>, z: ReturnType<typeof bbox>) => z.x1 === b.x0 && z.x0 === b.x0 - 0.5 && z.y0 === b.y0 && z.y1 === b.y1 },
    { rot: 180 as const, side: (b: ReturnType<typeof bbox>, z: ReturnType<typeof bbox>) => z.y1 === b.y0 && z.y0 === b.y0 - 0.5 && z.x0 === b.x0 && z.x1 === b.x1 },
    { rot: 270 as const, side: (b: ReturnType<typeof bbox>, z: ReturnType<typeof bbox>) => z.x0 === b.x1 && z.x1 === b.x1 + 0.5 && z.y0 === b.y0 && z.y1 === b.y1 },
  ];
  for (const { rot, side } of cases) {
    it(`rot ${rot}`, () => {
      const p = placeAsset(asset, "k", rot, 5, 5);
      expect(side(p.box, bbox(frontZone(p)))).toBe(true);
    });
  }
  it("the zone sits on the side local +y maps to", () => {
    // 90: local +y -> world -x. A point just past the local front edge must land inside the zone.
    const p = placeAsset(asset, "k", 90, 5, 5);
    const z = bbox(frontZone(p));
    expect(z.x1).toBeLessThanOrEqual(p.box.x0 + 1e-9);
  });
});
