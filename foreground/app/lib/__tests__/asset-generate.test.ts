import { describe, expect, it } from "vitest";
import { assetImageUrl, GENERATED_PROFILE, groupOf, orderAssets, type Asset } from "../assets";

const a = (id: string, profileId: string | null, imageRefs: string[] = []) => ({ assetId: id, profileId, imageRefs }) as unknown as Asset;

describe("generated assets", () => {
  it("serves an illustration route only for assets that have one", () => {
    expect(assetImageUrl(a("gen-x", GENERATED_PROFILE, ["assets/profiles/generated/images/gen-x.svg"]))).toBe("/api/assets/gen-x/image");
    expect(assetImageUrl(a("lib", null))).toBeNull();
  });
  it("orders own profile, then generated, then library", () => {
    const out = orderAssets([a("lib", null), a("gen", GENERATED_PROFILE), a("mine", "p")], "p").map((x) => x.assetId);
    expect(out).toEqual(["mine", "gen", "lib"]);
    expect(groupOf(a("gen", GENERATED_PROFILE), null)).toBe(1);
  });
});
