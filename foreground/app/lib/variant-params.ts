// Maps the variant generator's UI state to the params assets/variants.py make_variant reads.
import type { Asset, VariantKind } from "./assets";

export type Controls = {
  w: number; d: number; h: number;
  armA: number; armB: number; depthA: number; depthB: number;
  length: number;
};

export function defaultControls(asset: Asset): Controls {
  const { w, d, h } = asset.dims;
  return { w, d, h, armA: w, armB: w, depthA: d, depthB: d, length: w };
}

/** Kind-specific params. corner_l: armA/armB/depthA/depthB; wall_run: length; scaled: w/d/h (or a chosen SKU); island and mirrored: none. */
export function variantParams(kind: Exclude<VariantKind, "base">, asset: Asset, c: Controls, skuIndex = 0): Record<string, number> {
  switch (kind) {
    case "corner_l": return { armA: c.armA, armB: c.armB, depthA: c.depthA, depthB: c.depthB };
    case "wall_run": return { length: c.length };
    case "scaled": {
      const sku = asset.allowedSizes && asset.allowedSizes.length > 0 ? asset.allowedSizes[skuIndex] : null;
      return sku ? { w: sku.w, d: sku.d, h: sku.h } : { w: c.w, d: c.d, h: c.h };
    }
    case "island":
    case "mirrored": return {};
  }
}
