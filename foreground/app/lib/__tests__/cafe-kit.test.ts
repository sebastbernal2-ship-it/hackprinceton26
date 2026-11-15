import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packAssets } from "../asset-layout";
import type { Asset } from "../assets";
import { buildCafeKit, cafeKitArea, dedupeAssets } from "../cafe-demo";
import { conceptFootprint } from "../concept-layout";
import { layoutCostItems } from "../layout-cost";

const LIB = join(__dirname, "../../../../assets/library");
const library: Asset[] = readdirSync(LIB).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(LIB, f), "utf8")) as Asset);
const SCANS = ["w2JcUVybv9c", "xVKH13z5MJ8", "JAnuRsaVo9M"];

describe("cafe reference kit", () => {
  it.each(SCANS)("scan %s gets a complete, priced kit that fits its estimated area", (scan) => {
    const { kit, missing } = buildCafeKit(scan, library);
    expect(missing).toEqual([]);
    for (const a of kit) {
      expect(a.dims.w).toBeGreaterThan(0);
      expect(a.clearance.front).toBeGreaterThanOrEqual(0);
      expect(a.priceRef, a.assetId).toBeTruthy();
    }
    expect(kit.filter((a) => a.category === "seating").length).toBeGreaterThanOrEqual(12);
    expect(kit.some((a) => a.assetId === "espresso_machine_2group")).toBe(true);
    const floor = conceptFootprint(Number(cafeKitArea(scan)))!;
    const packed = packAssets(floor, kit, true);
    expect(packed.unplaced).toEqual([]);
    expect(packed.issues.filter((i) => i.kind === "overlap" || i.kind === "outside_floor")).toEqual([]);
  });

  it("groups placed pieces into quantities for cost lines", () => {
    const { kit } = buildCafeKit(SCANS[0], library);
    const items = layoutCostItems(kit);
    expect(items.find((i) => i.assetId === "chair_dining")?.quantity).toBe(16);
    expect(items.every((i) => i.quantity >= 1)).toBe(true);
  });

  it("scans differ and an unknown scan has no area", () => {
    expect(new Set(SCANS.map(cafeKitArea)).size).toBe(3);
    expect(cafeKitArea("nope")).toBe("");
  });

  it("dedupes a draft and a confirmed copy of one id, preferring confirmed", () => {
    const a = library.find((x) => x.assetId === "chair_dining")!;
    const out = dedupeAssets([{ ...a, status: "draft" }, { ...a, status: "confirmed" }, { ...a, status: "draft" }]);
    expect(out.size).toBe(1);
    expect(out.get("chair_dining")!.status).toBe("confirmed");
  });
});
