import { expect, it } from "vitest";
import { groupEquipment, type PlacedEquipment } from "../reskin";

const e = (assetId: string): PlacedEquipment => ({ assetId, name: assetId, dimsStatus: "estimated", x: 0, y: 0 });
it("collapses repeated placements into counted rows, keeping first-seen order", () => {
  const g = groupEquipment([e("oven"), e("sink"), e("oven"), e("oven")]);
  expect(g.map((x) => [x.assetId, x.count])).toEqual([["oven", 3], ["sink", 1]]);
});
