import { z } from "zod";
import modelJson from "@/data/ml/survival-model.json";
import sitesJson from "@/data/ml/survival-sites.json";

/**
 * Foreground's restaurant survival model: typed, read-only access to the exported JSON.
 * Trained offline by scripts/ml/build_dataset.py + scripts/ml/train_survival.py; nothing is computed here.
 * Probabilities are 0..1; factor effects are percentage points (pts) against the baseline probability.
 */

const Scores = z.object({
  rocAuc: z.number(),
  prAuc: z.number(),
  brier: z.number(),
  rocAucCi95: z.tuple([z.number(), z.number()]).optional(),
});

export const CalibrationBin = z.object({
  lo: z.number(),
  hi: z.number(),
  n: z.number().int(),
  meanPredicted: z.number(),
  observed: z.number(),
});
export type CalibrationBin = z.infer<typeof CalibrationBin>;

const Importance = z.object({ group: z.string(), aucDrop: z.number(), std: z.number() });

export const SurvivalModel = z.object({
  name: z.string(),
  version: z.string(),
  trainedOn: z.string(),
  dataDate: z.string(),
  target: z.string(),
  algorithm: z.string(),
  dataset: z.object({
    rows: z.number().int(),
    survived: z.number().int(),
    notSurvived: z.number().int(),
    baseRate: z.number(),
    properties: z.number().int(),
    byMarket: z.record(z.string(), z.number()),
    features: z.array(z.string()),
  }),
  metrics: z.object({
    timeSplit: z.object({
      train: z.object({ period: z.string(), n: z.number().int(), baseRate: z.number() }),
      test: z.object({ period: z.string(), n: z.number().int(), baseRate: z.number() }),
      models: z.object({ baseRate: Scores, logistic: Scores, hgb: Scores }).catchall(Scores),
      calibrationBins: z.array(CalibrationBin),
    }),
    groupedCv: z.object({
      folds: z.number().int(),
      n: z.number().int(),
      models: z.object({ baseRate: Scores, logistic: Scores, hgb: Scores }),
      calibrationBins: z.array(CalibrationBin),
    }),
  }),
  calibration: z.object({ method: z.string(), bins: z.array(CalibrationBin) }),
  featureImportance: z.object({
    method: z.string(),
    groups: z.array(Importance.extend({ label: z.string() })),
    features: z.array(Importance.extend({ feature: z.string() })),
  }),
  modelCard: z.object({
    data: z.string(),
    unit: z.string(),
    label: z.string(),
    features: z.string(),
    intendedUse: z.string(),
    limits: z.array(z.string()),
    date: z.string(),
  }),
});
export type SurvivalModel = z.infer<typeof SurvivalModel>;

export const SurvivalBand = z.enum(["strong", "typical", "weak", "poor"]);
export type SurvivalBand = z.infer<typeof SurvivalBand>;

export const RelativeBand = z.enum(["above typical", "typical", "below typical"]);
export type RelativeBand = z.infer<typeof RelativeBand>;

export const SurvivalFactor = z.object({
  group: z.string(),
  label: z.string(),
  /** plain-language description built from the site's own values */
  text: z.string(),
  /** signed effect on the 3-year survival probability, in percentage points */
  effectPts: z.number(),
  /** false for groups with no measured out-of-time skill; those never appear in topFactors */
  measuredSkill: z.boolean(),
  /** text + rounded signed effect, e.g. "Space of 2,946 SF, 8% of the building: +9 pts" */
  summary: z.string(),
});
export type SurvivalFactor = z.infer<typeof SurvivalFactor>;

export const SiteSurvival = z.object({
  siteId: z.string(),
  address: z.string(),
  city: z.string(),
  suite: z.string().nullable(),
  /** probability the new tenant is still in the space after 3 years */
  probability: z.number().min(0).max(1),
  /** average prediction for comparable recent tenancies; factors add up to probability - baseline */
  baselineProbability: z.number().min(0).max(1),
  band: SurvivalBand,
  bandLabel: z.string(),
  /** probability capped at 0.75: scores above 80% survived about 74% of the time out of sample */
  displayProbability: z.number().min(0).max(0.75),
  /** what to print: "about 3 in 4" above 80%, else "about 72%" */
  displayText: z.string(),
  /** against the baseline (about 69%), using the capped probability, +/- 5 points */
  relativeBand: RelativeBand,
  /** up to 3 factors, only from groups with measured skill */
  topFactors: z.array(SurvivalFactor).max(3),
  allFactors: z.array(SurvivalFactor),
});
export type SiteSurvival = z.infer<typeof SiteSurvival>;

export const SurvivalSites = z.object({
  generatedOn: z.string(),
  asOf: z.string(),
  horizonYears: z.number(),
  scenario: z.string(),
  datasetBaseRate: z.number(),
  /** one line to show wherever a prediction is shown */
  disclosure: z.string(),
  noSkillGroups: z.array(z.string()),
  factorNote: z.string(),
  sites: z.array(SiteSurvival),
});
export type SurvivalSites = z.infer<typeof SurvivalSites>;

export function parseSurvivalModel(raw: unknown): SurvivalModel {
  return SurvivalModel.parse(raw);
}

export function parseSurvivalSites(raw: unknown): SurvivalSites {
  return SurvivalSites.parse(raw);
}

let model: SurvivalModel | undefined;
let sites: SurvivalSites | undefined;

export function getSurvivalModel(): SurvivalModel {
  return (model ??= parseSurvivalModel(modelJson));
}

export function getSurvivalSites(): SurvivalSites {
  return (sites ??= parseSurvivalSites(sitesJson));
}

/** Prediction for one demo site, or null when the site has none. */
export function getSiteSurvival(siteId: string, data: SurvivalSites = getSurvivalSites()): SiteSurvival | null {
  return data.sites.find((s) => s.siteId === siteId) ?? null;
}

/** Same thresholds as scripts/ml/train_survival.py `band()`. */
export function survivalBand(probability: number): SurvivalBand {
  if (probability >= 0.75) return "strong";
  if (probability >= 0.62) return "typical";
  if (probability >= 0.5) return "weak";
  return "poor";
}

/** Same rule as scripts/ml/train_survival.py `relative()`. */
export function relativeBand(probability: number, baseline: number): RelativeBand {
  const shown = Math.min(probability, 0.75);
  return shown >= baseline + 0.05 ? "above typical" : shown <= baseline - 0.05 ? "below typical" : "typical";
}

/** Calibration-aware text: never claims more than "about 3 in 4". */
export function displayProbabilityText(probability: number): string {
  return probability > 0.8 ? "about 3 in 4" : `about ${Math.round(Math.min(probability, 0.75) * 100)}%`;
}

/** "+9 pts" / "−12 pts" (true minus sign), rounded to whole points. */
export function formatEffect(effectPts: number): string {
  const n = Math.round(Math.abs(effectPts));
  return `${effectPts >= 0 || n === 0 ? "+" : "−"}${n} pts`;
}

/** 0.899 -> "90%" */
export function formatProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

/** Headline honesty numbers for a model badge: out-of-time skill against the baselines. */
export function modelSkill(m: SurvivalModel = getSurvivalModel()) {
  const t = m.metrics.timeSplit.models;
  return {
    rocAuc: t.hgb.rocAuc,
    rocAucCi95: t.hgb.rocAucCi95 ?? null,
    brier: t.hgb.brier,
    baselineBrier: t.baseRate.brier,
    logisticRocAuc: t.logistic.rocAuc,
    /** share of the base-rate Brier score removed by the model; near 0 means little better than the base rate */
    brierSkill: 1 - t.hgb.brier / t.baseRate.brier,
    testRows: m.metrics.timeSplit.test.n,
  };
}

/**
 * Flat, UI-friendly view of one site's prediction (the shape components/workspace/survival-adapter.ts probes for).
 * No interval is given: the model card explains why the estimate is rough.
 */
export function survivalFor(siteId: string) {
  const s = getSiteSurvival(siteId);
  if (!s) return null;
  return {
    siteId: s.siteId,
    probability: s.probability,
    baselineProbability: s.baselineProbability,
    band: s.band,
    bandLabel: s.bandLabel,
    displayProbability: s.displayProbability,
    displayText: s.displayText,
    relativeBand: s.relativeBand,
    disclosure: getSurvivalSites().disclosure,
    topFactors: s.topFactors.map((f) => ({
      label: f.text,
      effect: f.effectPts,
      direction: f.effectPts >= 0 ? ("up" as const) : ("down" as const),
      detail: formatEffect(f.effectPts),
    })),
    source: "Foreground survival model (weak signal: out-of-time ROC-AUC 0.64)",
  };
}
