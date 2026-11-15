import { describe, expect, it } from "vitest";
import { buildDiligence } from "../act";
import { layoutCostItems, pct } from "../layout-cost";
import type { Asset } from "../assets";

const asset = (assetId: string, priceRef: string | null) => ({ assetId, priceRef, name: assetId }) as Asset;

describe("layout cost items", () => {
  it("groups placed pieces by catalogue id so quantity drives cost", () => {
    const items = layoutCostItems([asset("a", "a"), asset("a", "a"), asset("b", null)]);
    expect(items).toEqual([{ assetId: "a", quantity: 2 }, { assetId: "b", quantity: 1 }]);
  });
  it("never renders a missing probability as zero", () => {
    expect(pct(null)).toBe("Unknown");
    expect(pct(0)).toBe("0%");
    expect(pct(0.874)).toBe("87%");
  });
});

describe("diligence checklist", () => {
  it("covers landlord questions, records, inspections and itemized quotes", () => {
    const groups = new Set(buildDiligence({ unpricedPieces: ["Bake rack"], assumedArea: true, linkedBuilding: false }).map((i) => i.group));
    expect(groups).toEqual(new Set(["Ask the landlord or broker", "Records to request", "Inspections", "Get itemized quotes"]));
  });
  it("asks for a quote for each unpriced piece and flags an assumed area", () => {
    const items = buildDiligence({ unpricedPieces: ["Bake rack", "Work table"], assumedArea: true, linkedBuilding: true });
    expect(items.filter((i) => i.id.startsWith("quote:") && i.id !== "quote:buildout").map((i) => i.text)).toHaveLength(2);
    expect(items.some((i) => i.id === "q:area")).toBe(true);
    expect(items.some((i) => i.id === "q:link")).toBe(false);
  });
});
