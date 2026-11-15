// Types mirror contracts/projection-card.schema.json and scenario-assessment.schema.json.
// The schemas cannot express the ordering/kind rules, so isDisplayable() re-checks them: a card that fails is hidden, never repaired.

import type { Exchange } from "./next-question";

export type ProjectionKind = "published" | "fitted" | "scenario";
export type ProjectionStatus = "estimated" | "unknown";

export type Citation = { source: string; recordId: string; asOf: string; geography: string; limitations: string };
export type TrainingWindow = { start: string; end: string; geography: string };
export type ValidationMetric = { name: string; value: number; threshold: number; passed: boolean };

export type ProjectionCard = {
  kind: ProjectionKind;
  status: ProjectionStatus;
  metric: string;
  horizon: string;
  scenario: string;
  method: string;
  unit?: string;
  point?: number | null;
  lower?: number | null;
  upper?: number | null;
  citation?: Citation | null;
  trainingWindow?: TrainingWindow | null;
  validation?: ValidationMetric[];
  hidden?: boolean;
  hiddenReason?: string;
};

export type AssumptionInput = { key: string; value: number; unit?: string; note?: string };

export type ScenarioAssessment = {
  modelsAvailable: boolean;
  status?: ProjectionStatus;
  label?: string;
  listingId?: number | null;
  note?: string;
  assumptions?: AssumptionInput[];
  projections?: ProjectionCard[];
};

export type ProjectionsResponse = { listingId: number; modelsAvailable: boolean; projections: ProjectionCard[]; note: string };
export type ReplanReason = { constraint: string; from: string; to: string; reason: string; missing_fields: string[] };
export type ReplanChange = { site_id: string; from: string; to: string; because: ReplanReason[] };
export type ReplanResponse = {
  dataAvailable: boolean;
  change: { maxAreaSqft?: number };
  changed: ReplanChange[];
  countsBefore: Record<string, number>;
  countsAfter: Record<string, number>;
  pOverBudget: Record<string, unknown>;
  note: string;
};

export const BANNER = "Scenario analysis, not a forecast";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const filled = (s: unknown) => typeof s === "string" && s.trim() !== "";

/** Why a card must not be shown, or null when it may be. */
export function rejectReason(card: ProjectionCard): string | null {
  if (!card || typeof card !== "object") return "not an object";
  if (card.hidden) return card.hiddenReason || "marked hidden";
  if (!["published", "fitted", "scenario"].includes(card.kind)) return "unknown kind";
  if (card.status !== "estimated" && card.status !== "unknown") return "unknown status";
  if (!filled(card.metric) || !filled(card.horizon) || !filled(card.scenario)) return "missing metric, horizon or scenario";
  if (!filled(card.method)) return "missing method statement";
  if (card.status === "estimated") {
    const { point, lower, upper } = card;
    if (!isNum(point) || !isNum(lower) || !isNum(upper)) return "estimate without point and interval";
    if (!(lower <= point && point <= upper)) return "interval does not bracket the point";
  } else if (card.point != null || card.lower != null || card.upper != null) {
    return "unknown card carries numbers";
  }
  if (card.kind === "published") {
    const c = card.citation;
    if (!c || ![c.source, c.recordId, c.asOf, c.geography, c.limitations].every(filled)) return "published without full citation";
  }
  if (card.kind === "fitted") {
    if (!card.trainingWindow) return "fitted without training window";
    if (!card.validation || card.validation.length === 0) return "fitted without backtest";
    if (card.validation.some((m) => !m.passed)) return "backtest failed";
  }
  return null;
}

export const isDisplayable = (card: ProjectionCard) => rejectReason(card) === null;

export function splitCards(cards: ProjectionCard[]): { shown: ProjectionCard[]; hiddenCount: number } {
  const shown = cards.filter(isDisplayable);
  return { shown, hiddenCount: cards.length - shown.length };
}

const isOverBudget = (c: ProjectionCard) => /over[ _-]?budget/i.test(c.metric);

/** The P(over budget) card of an assessment, if one is displayable. */
export const overBudgetCard = (cards: ProjectionCard[]) => cards.filter(isDisplayable).find(isOverBudget);

export function formatValue(value: number, unit?: string): string {
  if (unit === "probability") return `${(value * 100).toFixed(0)}%`;
  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  return unit ? `${text} ${unit}` : text;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json" } });
  if (!response.ok) throw new Error(`The API answered ${response.status} for ${path}.`);
  return (await response.json()) as T;
}

export const fetchProjections = (listingId: number) => call<ProjectionsResponse>(`/property/${listingId}/projections`);

export const postAssess = (listingId: number | null, assumptions: AssumptionInput[], brief: Exchange[] = []) =>
  call<ScenarioAssessment>("/assess", { method: "POST", body: JSON.stringify({ listingId, assumptions, brief }) });

export const postReplan = (listingId: number, maxAreaSqft: number, brief: Exchange[]) =>
  call<ReplanResponse>("/replan", {
    method: "POST",
    body: JSON.stringify({
      listingId,
      brief,
      assess: {},
      profileChange: { maxAreaSqft },
    }),
  });
