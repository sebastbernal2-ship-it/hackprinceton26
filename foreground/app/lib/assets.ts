// Typed client and helpers for the asset catalog contract (GET/POST /api/assets...).
// Nothing here invents dimensions or prices: every dimension carries a status, every price is a priceRef into the
// financial catalog, resolved against the property's cost lines.
import type { CostLineItem } from "./costs";

export type AssetCategory =
  | "counter" | "prep_table" | "range" | "oven" | "fridge" | "freezer_display" | "sink" | "hood" | "dish"
  | "seating" | "table" | "storage" | "other";
export type AssetSource = "library" | "uploaded" | "extracted" | "generated";
export type VariantKind = "base" | "corner_l" | "island" | "wall_run" | "scaled" | "mirrored";
export type DimsStatus = "measured" | "catalog" | "estimated";
export type Dims = { w: number; d: number; h: number };
export type Range2 = [number, number];

export type Asset = {
  assetId: string;
  name: string;
  category: AssetCategory;
  source: AssetSource;
  parentAssetId: string | null;
  variantKind: VariantKind | null;
  dims: Dims;
  dimsStatus: DimsStatus;
  dimRanges: { w: Range2; d: Range2; h: Range2 } | null;
  allowedSizes: { w: number; d: number; h: number; label: string }[] | null;
  /** Polygon in the asset-local frame, metres. Local +y is the front. */
  footprint: [number, number][];
  clearance: { front: number; sides: number; back: number };
  clearanceBasis: string;
  model: { uri: string; format: "glb" | "obj" | "box" } | null;
  imageRefs: string[];
  profileId: string | null;
  tags: string[];
  priceRef: string | null;
  provenance: { origin: string; retrievedAt: string; notes: string };
  status: "draft" | "confirmed";
};

export const CATEGORIES: AssetCategory[] = [
  "counter", "prep_table", "range", "oven", "fridge", "freezer_display", "sink", "hood", "dish",
  "seating", "table", "storage", "other",
];
export const VARIANT_KINDS: Exclude<VariantKind, "base">[] = ["corner_l", "island", "wall_run", "scaled", "mirrored"];
export const VARIANT_LABEL: Record<VariantKind, string> = {
  base: "Base", corner_l: "Corner L", island: "Island", wall_run: "Wall run", scaled: "Scaled", mirrored: "Mirrored",
};
export const DIMS_LABEL: Record<DimsStatus, string> = { measured: "measured", catalog: "catalog", estimated: "estimated" };

export type IngestResponse = { proposals: Asset[]; mode: "live" | "fixture"; notice: string };
export const MAX_ASSET_UPLOAD_IMAGES = 6;
export const MAX_ASSET_UPLOAD_BYTES = 5 * 1024 * 1024;

export class AssetApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/assets${path}`, init);
  } catch {
    throw new AssetApiError("The asset API is unreachable.", null);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: unknown };
    const detail = typeof body.detail === "string" ? ` ${body.detail}` : "";
    throw new AssetApiError(`The asset API answered ${response.status}.${detail}`, response.status);
  }
  return (await response.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

export async function listAssets(opts: { profileId?: string | null; category?: AssetCategory | "" } = {}): Promise<Asset[]> {
  const q = new URLSearchParams();
  if (opts.profileId) q.set("profileId", opts.profileId);
  if (opts.category) q.set("category", opts.category);
  const body = await call<Asset[] | { assets: Asset[] }>(q.size ? `?${q}` : "");
  return Array.isArray(body) ? body : body.assets;
}
export const patchAsset = (id: string, patch: Partial<Asset>) => call<Asset>(`/${encodeURIComponent(id)}`, json("PATCH", patch));
export const createAsset = (asset: Partial<Asset>) => call<Asset>("", json("POST", asset));
/** The service already saves the variant (as a draft) in `profileId`'s profile; confirm it with patchAsset, never createAsset. */
export const makeVariant = (id: string, kind: Exclude<VariantKind, "base">, params: Record<string, number>, profileId?: string | null) =>
  call<Asset>(`/${encodeURIComponent(id)}/variants`, json("POST", { kind, params, ...(profileId ? { profileId } : {}) }));

/** Closed rectangle ring in the asset-local frame (last point equals the first, as the service requires). */
export const rectFootprint = (w: number, d: number): [number, number][] => [[0, 0], [w, 0], [w, d], [0, d], [0, 0]];

/** Change one dimension; rectangular footprints (open or closed four-corner rings) are regenerated closed from w and d. */
export function editDims(asset: Asset, axis: keyof Dims, value: number): Asset {
  const dims = { ...asset.dims, [axis]: value };
  const n = asset.footprint.length;
  const rectangular = n === 4 || n === 5;
  return { ...asset, dims, footprint: rectangular ? rectFootprint(dims.w, dims.d) : asset.footprint };
}

export function ingestImages(files: File[], opts: { profileId?: string | null; referenceScale?: string }): Promise<IngestResponse> {
  if (files.length === 0) throw new AssetApiError("Choose at least one image.", 422);
  if (files.length > MAX_ASSET_UPLOAD_IMAGES) {
    throw new AssetApiError(`Choose no more than ${MAX_ASSET_UPLOAD_IMAGES} images.`, 422);
  }
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  for (const file of files) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.has(ext)) throw new AssetApiError("Use JPEG, PNG, or WebP images.", 415);
    if (file.size > MAX_ASSET_UPLOAD_BYTES) {
      throw new AssetApiError(`${file.name} exceeds the 5 MiB per-image limit.`, 413);
    }
  }
  const form = new FormData();
  for (const file of files) form.append("image", file);
  if (opts.referenceScale) form.append("referenceScale", opts.referenceScale);
  if (opts.profileId) form.append("profileId", opts.profileId);
  return call<IngestResponse>("/ingest", { method: "POST", body: form });
}

/** Profile assets first, then library; stable within each group. */
export function orderAssets(assets: Asset[], profileId: string | null): Asset[] {
  const mine = (a: Asset) => (profileId && a.profileId === profileId ? 0 : 1);
  return assets.map((a, i) => ({ a, i })).sort((x, y) => mine(x.a) - mine(y.a) || x.i - y.i).map((x) => x.a);
}

export function bbox(points: [number, number][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export const fmtM = (v: number) => `${Math.round(v * 100) / 100} m`;
export const fmtDims = (d: Dims) => `${fmtM(d.w)} x ${fmtM(d.d)} x ${fmtM(d.h)}`;

/** Allowed range for one axis, or null when the asset has no scaling room (fixed or discrete SKUs). */
export function axisRange(asset: Asset, axis: keyof Dims): Range2 | null {
  if (asset.allowedSizes && asset.allowedSizes.length > 0) return null;
  return asset.dimRanges ? asset.dimRanges[axis] : null;
}

export type PriceInfo =
  | { kind: "none"; text: string }
  | { kind: "line"; text: string; status: CostLineItem["status"]; line: CostLineItem };

/** Link priceRef to a /costs line. Never 0: no ref, no line or a null expected value all read "No price". */
export function priceFor(asset: Asset, lines: CostLineItem[]): PriceInfo {
  if (!asset.priceRef) return { kind: "none", text: "No price" };
  const line = lines.find((l) => l.itemId === asset.priceRef || l.itemId === `equip:${asset.priceRef}`);
  if (!line) return { kind: "none", text: `No price (catalog item ${asset.priceRef} is not in this property's costs)` };
  if (line.expected === null || line.status === "unknown") return { kind: "none", text: "No price" };
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return { kind: "line", status: line.status, line, text: `${usd.format(line.expected)} (${line.status})` };
}
