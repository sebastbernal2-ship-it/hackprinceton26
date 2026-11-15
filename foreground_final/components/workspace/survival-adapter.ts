import type { SurvivalOdds } from "./imagine-types";
import { survivalModule } from "./survival-slot.generated";

type Any = Record<string, unknown>;
const isObj = (v: unknown): v is Any => typeof v === "object" && v !== null;
const numOf = (...vs: unknown[]) => vs.find((v): v is number => typeof v === "number" && Number.isFinite(v));
const strOf = (...vs: unknown[]) => vs.find((v): v is string => typeof v === "string" && v.length > 0);

/**
 * Reads lib/ml/survival.ts (owned by another agent) without knowing its exact API: tries the likely entry points and
 * result shapes, and returns null (the sheet then shows its placeholder) when nothing matches. Never throws.
 */
export function survivalFor(siteId: string): SurvivalOdds | null {
  const mod = survivalModule;
  if (!isObj(mod)) return null;
  try {
    const fnName = ["survivalFor", "getSurvival", "survivalForSite", "predictSurvival", "survival", "default"].find((k) => typeof mod[k] === "function");
    let raw: unknown = fnName ? (mod[fnName] as (id: string) => unknown)(siteId) : undefined;
    if (raw === undefined) {
      const table = [mod.SURVIVAL, mod.survivalSites, mod.sites, mod.data].find(isObj);
      if (table) raw = Array.isArray(table) ? table.find((r) => isObj(r) && String(r.siteId ?? r.id) === siteId) : table[siteId];
    }
    if (!isObj(raw)) return null;
    let p = numOf(raw.probability, raw.survival3y, raw.p3y, raw.survivalProbability, raw.odds, raw.prob);
    if (p === undefined) return null;
    if (p > 1) p = p / 100;
    const band = isObj(raw.interval) ? raw.interval : isObj(raw.ci) ? raw.ci : raw;
    const norm = (v: number | undefined) => (v === undefined ? undefined : v > 1 ? v / 100 : v);
    const factorsRaw = [raw.factors, raw.topFactors, raw.drivers].find(Array.isArray) as unknown[] | undefined;
    const factors = (factorsRaw ?? []).flatMap((f): SurvivalOdds["factors"] => {
      if (typeof f === "string") return [{ label: f, direction: "down" }];
      if (!isObj(f)) return [];
      const label = strOf(f.label, f.name, f.feature, f.factor);
      if (!label) return [];
      const effect = numOf(f.effect, f.impact, f.weight, f.shap, f.contribution);
      const dirStr = strOf(f.direction, f.sign);
      const up = dirStr ? /up|pos|help|\+/i.test(dirStr) : effect !== undefined ? effect > 0 : false;
      return [{ label, direction: up ? "up" : "down", detail: strOf(f.detail, f.description, f.value?.toString()) }];
    });
    return {
      probability: p,
      low: norm(numOf(band.low, band.lower, band.p10)),
      high: norm(numOf(band.high, band.upper, band.p90)),
      factors: factors.slice(0, 4),
      source: strOf(raw.source, raw.model) ?? "Foreground survival model",
      displayText: strOf(raw.displayText),
      relativeBand: (["above typical", "typical", "below typical"] as const).find((b) => b === raw.relativeBand),
      baseline: norm(numOf(raw.baselineProbability, raw.baseline)),
      disclosure: strOf(raw.disclosure),
    };
  } catch {
    return null;
  }
}
