import { z } from "zod";
import modelJson from "@/data/ml/rent-model.json";
import sitesJson from "@/data/ml/rent-sites.json";

/**
 * Foreground's fair-rent model: typed, read-only access to the exported JSON.
 * Trained offline by scripts/ml/build_rent_dataset.py + scripts/ml/train_rent.py; nothing is computed here.
 * All rents are asking rents in $/SF/yr on an NNN-equivalent basis. The interval is an 80% prediction interval.
 */

export const RentBand = z.enum(["above market", "in line", "below market"]);
export type RentBand = z.infer<typeof RentBand>;

export const RentComp = z.object({
  propertyId: z.number().int(),
  address: z.string(),
  suite: z.string().nullable(),
  sf: z.number().positive(),
  /** rent as quoted, $/SF/yr */
  rentPerSfYr: z.number(),
  /** NNN or GROSS (gross rents are converted with the model's gross-to-NNN factor) */
  serviceType: z.string(),
  rentNnnEquivPerSfYr: z.number(),
  distanceKm: z.number().nonnegative(),
  date: z.string(),
  source: z.string(),
});
export type RentComp = z.infer<typeof RentComp>;

export const SiteRent = z.object({
  siteId: z.string(),
  address: z.string(),
  city: z.string(),
  suite: z.string().nullable(),
  spaceId: z.number(),
  sf: z.number().positive(),
  fairRentPerSfYr: z.number(),
  intervalLowPerSfYr: z.number(),
  intervalHighPerSfYr: z.number(),
  intervalLevel: z.number(),
  fairRentPerYr: z.number(),
  intervalLowPerYr: z.number(),
  intervalHighPerYr: z.number(),
  /** the listing's asking rent as quoted */
  askingRentPerSfYr: z.number().nullable(),
  askingServiceType: z.string().nullable(),
  /** asking rent on the same basis as the prediction (NNN-equivalent) */
  askingNnnEquivPerSfYr: z.number(),
  /** asking minus fair, positive means the ask is above the model's estimate */
  gapPerSfYr: z.number(),
  gapPerYr: z.number(),
  gapPct: z.number(),
  /** "above market" / "below market" only when the interval excludes the asking rent */
  band: RentBand,
  baselines: z.object({ submarketMedianPerSfYr: z.number(), knnCompsMedianPerSfYr: z.number() }),
  comps: z.array(RentComp).min(0).max(5),
  /** true when the ask was quoted gross: the NNN conversion is shaky for retail, so the band should not be trusted */
  basisUncertain: z.boolean().default(false),
  notes: z.string(),
});
export type SiteRent = z.infer<typeof SiteRent>;

export const RentSites = z.object({
  model: z.string(),
  dataDate: z.string(),
  intervalLevel: z.number(),
  sites: z.record(z.string(), SiteRent),
});
export type RentSites = z.infer<typeof RentSites>;

const Metrics = z.object({
  n: z.number().int(),
  mae: z.number(),
  mape: z.number(),
  medianApe: z.number(),
  r2: z.number(),
  rmseLog: z.number(),
  bias: z.number(),
});
const Coverage = z.object({ coverage: z.number(), medianWidthPct: z.number() }).passthrough();

export const RentModel = z.object({
  name: z.string(),
  version: z.string(),
  trainedOn: z.string(),
  dataDate: z.string(),
  target: z.string(),
  algorithm: z.string(),
  dataset: z
    .object({
      rows: z.number().int(),
      retailRows: z.number().int(),
      properties: z.number().int(),
      retailProperties: z.number().int(),
      features: z.array(z.string()),
      outlierRule: z.string(),
    })
    .passthrough(),
  nnnAdjustment: z
    .object({
      grossToNnnFactor: z.number(),
      grossOverNnnRatio: z.number(),
      applied: z.string(),
      method: z.string(),
      note: z.string(),
    })
    .passthrough(),
  metrics: z.object({
    groupedCv: z
      .object({
        model: Metrics,
        marketMedian: Metrics,
        submarketMedian: Metrics,
        knnCompsMedian: Metrics,
        intervals: z.object({ conformalGlobal: Coverage, conformalByMarket: Coverage, quantileGbm: Coverage }),
      })
      .passthrough(),
    timeSplit: z
      .object({
        split: z.string(),
        model: Metrics,
        marketMedian: Metrics,
        submarketMedian: Metrics,
        knnCompsMedian: Metrics,
        interval: Coverage.passthrough(),
      })
      .passthrough(),
  }),
  intervals: z.object({ level: z.number(), kind: z.string() }).passthrough(),
  featureImportance: z.object({
    method: z.string(),
    groups: z.array(z.object({ group: z.string(), rmseLogIncrease: z.number(), std: z.number() }).passthrough()),
    features: z.array(z.object({ feature: z.string(), rmseLogIncrease: z.number(), std: z.number() })),
  }),
  modelCard: z.object({
    data: z.string(),
    unit: z.string(),
    features: z.string(),
    intendedUse: z.string(),
    limits: z.array(z.string()),
    date: z.string(),
  }),
});
export type RentModel = z.infer<typeof RentModel>;

export function parseRentModel(raw: unknown): RentModel {
  return RentModel.parse(raw);
}

export function parseRentSites(raw: unknown): RentSites {
  return RentSites.parse(raw);
}

let model: RentModel | undefined;
let sites: RentSites | undefined;

export function getRentModel(): RentModel {
  return (model ??= parseRentModel(modelJson));
}

export function getRentSites(): RentSites {
  return (sites ??= parseRentSites(sitesJson));
}

/** Fair-rent estimate for one demo site's featured space, or null when the site has none. */
export function rentFor(siteId: string, data: RentSites = getRentSites()): SiteRent | null {
  return data.sites[siteId] ?? null;
}

/** Band rule shared with scripts/ml/train_rent.py: only outside the interval is a verdict given. */
export function rentBand(askingNnn: number, low: number, high: number): RentBand {
  return askingNnn > high ? "above market" : askingNnn < low ? "below market" : "in line";
}

/** 36.4 -> "$36", 1234567 -> "$1.2M", 98500 -> "$99k" */
export function formatRent(perSfYr: number): string {
  return `$${Math.round(perSfYr)}`;
}

/** "$36–40/SF/yr" (rounded outward so the shown range always contains the interval). */
export function formatRentRange(low: number, high: number): string {
  return `$${Math.floor(low)}–${Math.ceil(high)}/SF/yr`;
}

/** Signed gap, e.g. "+$9/SF/yr" or "−$3/SF/yr" (true minus). */
export function formatGap(gapPerSfYr: number): string {
  const n = Math.round(Math.abs(gapPerSfYr));
  return `${gapPerSfYr >= 0 || n === 0 ? "+" : "−"}$${n}/SF/yr`;
}

/** Headline honesty numbers for a model badge: error against the simple baselines, on buildings never seen in training. */
export function rentModelSkill(m: RentModel = getRentModel()) {
  const cv = m.metrics.groupedCv;
  const t = m.metrics.timeSplit;
  return {
    mae: cv.model.mae,
    medianApe: cv.model.medianApe,
    r2: cv.model.r2,
    baselineMae: Math.min(cv.submarketMedian.mae, cv.knnCompsMedian.mae),
    /** share of the best baseline's absolute error removed by the model; near 0 means little better than a median */
    maeSkill: 1 - cv.model.mae / Math.min(cv.submarketMedian.mae, cv.knnCompsMedian.mae),
    intervalCoverage: cv.intervals.conformalByMarket.coverage,
    timeSplitMae: t.model.mae,
    timeSplitBaselineMae: Math.min(t.submarketMedian.mae, t.knnCompsMedian.mae),
    testRows: cv.model.n,
  };
}
