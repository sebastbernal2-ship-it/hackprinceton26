import type { ClimateModel } from "./structure";

/** One metric's value for a scenario + horizon; null when that point is not in the model (never interpolated). */
export function climateValue(c: ClimateModel | undefined, id: string, scenario: string, horizon: number): number | null {
  const v = c?.metrics.find((m) => m.id === id)?.series[scenario]?.[String(horizon)];
  return typeof v === "number" ? v : null;
}

export type ClimateRunningCost = { usdPerYear: number; cooling: number; insurance: number; scenario: string; horizon: number; label: string };

/**
 * The single number the Quantify summary can show: climate-adjusted running cost delta per year (extra cooling energy + extra flood
 * insurance) for one scenario and horizon. A labelled demo estimate. Returns null when the model has no such point.
 * Hook-in: in quantify.tsx, load `fetchScenarios(listingId)`, call `climateRunningCostDelta(res.climate, "Intermediate", 2050)` and add
 * `usdPerYear` as a labelled "climate-adjusted running cost (demo estimate)" line; show `label` as its caption.
 */
export function climateRunningCostDelta(c: ClimateModel | undefined, scenario = "Intermediate", horizon = 2050): ClimateRunningCost | null {
  const cooling = climateValue(c, "cool", scenario, horizon);
  const insurance = climateValue(c, "ins", scenario, horizon);
  if (cooling === null || insurance === null) return null;
  const usdPerYear = cooling + insurance;
  return { usdPerYear, cooling, insurance, scenario, horizon, label: `NOAA ${scenario}, ${horizon}: about $${usdPerYear.toLocaleString("en-US")} more a year to cool and insure (demo estimate, not a forecast)` };
}

/** Signed change text, e.g. "+12" or "-3.5" or "no change". */
export function deltaText(from: number, to: number, money = false): string {
  const d = Math.round((to - from) * 100) / 100;
  if (d === 0) return "no change";
  const n = money ? `$${Math.abs(d).toLocaleString("en-US")}` : String(Math.abs(d));
  return `${d > 0 ? "+" : "-"}${n}`;
}

export function formatValue(id: string, v: number): string {
  return id === "cool" || id === "ins" ? `$${v.toLocaleString("en-US")}` : String(v);
}
