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

export type AssetStyle = { materials: string[]; colors: string[]; finish: string | null; styleTags: string[]; inferred: boolean };
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const splitList = (text: string) => text.split(",").map((t) => t.trim()).filter(Boolean);

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
  /** Aesthetics inferred from photos by a vision model. A guess from imagery, never a spec. */
  style?: AssetStyle | null;
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

/** live: a provider answered; fixture: canned samples, never saveable; failed: the provider call failed, no proposals. */
export type IngestResponse = { proposals: Asset[]; mode: "live" | "fixture" | "failed"; notice: string; source?: "video"; frames?: { t: number }[] };
export const MAX_ASSET_UPLOAD_VIDEO_BYTES = 60 * 1024 * 1024;
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

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);
const extOf = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();
export const isVideoFile = (f: { name: string }) => VIDEO_EXT.has(extOf(f.name));

/** Client-side pre-check mirroring the server rules (the server stays authoritative). Returns an error message or null. */
export function checkUploadFiles(files: { name: string; size: number }[]): { message: string; status: number } | null {
  if (files.length === 0) return { message: "Choose at least one photo or one video.", status: 422 };
  const video = files.some(isVideoFile);
  if (video && files.length !== 1) return { message: "Choose either one video or up to 6 photos, not a mix.", status: 422 };
  if (files.length > MAX_ASSET_UPLOAD_IMAGES) return { message: `Choose no more than ${MAX_ASSET_UPLOAD_IMAGES} images.`, status: 422 };
  for (const file of files) {
    const ext = extOf(file.name);
    if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) return { message: "Use JPEG, PNG, or WebP photos, or an MP4, WebM, or MOV video.", status: 415 };
    if (VIDEO_EXT.has(ext) ? file.size > MAX_ASSET_UPLOAD_VIDEO_BYTES : file.size > MAX_ASSET_UPLOAD_BYTES) {
      return { message: VIDEO_EXT.has(ext) ? `${file.name} exceeds the 60 MB video limit.` : `${file.name} exceeds the 5 MiB per-image limit.`, status: 413 };
    }
  }
  return null;
}

export function ingestImages(files: File[], opts: { profileId?: string | null; referenceScale?: string }): Promise<IngestResponse> {
  const bad = checkUploadFiles(files);
  if (bad) throw new AssetApiError(bad.message, bad.status);
  const form = new FormData();
  for (const file of files) form.append("image", file);
  if (opts.referenceScale) form.append("referenceScale", opts.referenceScale);
  if (opts.profileId) form.append("profileId", opts.profileId);
  return call<IngestResponse>("/ingest", { method: "POST", body: form });
}

/** Profile every generated asset is saved in (the planner tray and the catalog grid both list it). */
export const GENERATED_PROFILE = "generated";
export type GenerateResult = { asset: Asset; imageMode: "openai" | "svg"; notice: string; priceNote: string };
export const generateAsset = (prompt: string, useImageModel: boolean) =>
  call<GenerateResult>("/generate", json("POST", { prompt, useImageModel }));
/** The illustration route for an asset that has one (generated assets), else null. */
export const assetImageUrl = (a: Asset) => (a.imageRefs.length ? `/api/assets/${encodeURIComponent(a.assetId)}/image` : null);

/** 0 this profile's assets, 1 generated assets, 2 library. */
export const groupOf = (a: Asset, profileId: string | null) => (profileId && a.profileId === profileId ? 0 : a.profileId === GENERATED_PROFILE ? 1 : 2);
export const GROUP_LABEL = ["This profile's assets", "Generated assets", "Library"];

/** Profile assets first, then generated, then library; stable within each group. */
export function orderAssets(assets: Asset[], profileId: string | null): Asset[] {
  return assets.map((a, i) => ({ a, i })).sort((x, y) => groupOf(x.a, profileId) - groupOf(y.a, profileId) || x.i - y.i).map((x) => x.a);
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
