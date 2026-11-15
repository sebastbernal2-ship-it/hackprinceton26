import { expect, it } from "vitest";
import { climateRunningCostDelta, climateValue, deltaText, formatValue } from "../climate";
import type { ClimateModel } from "../structure";

const mk = (id: string, a: number, b: number) => ({ id, label: id, unit: "", kind: "demo", today: 0, note: "", series: { Low: { "2050": a }, High: { "2050": b } } }) as unknown as ClimateModel["metrics"][number];
const model: ClimateModel = { scenarios: ["Low", "High"], horizons: [2050], assumptions: {}, notice: "", metrics: [mk("cool", 300, 1200), mk("ins", 100, 900)] };

it("reads exact points and never invents missing ones", () => {
  expect(climateValue(model, "cool", "High", 2050)).toBe(1200);
  expect(climateValue(model, "cool", "High", 2070)).toBeNull();
  expect(climateValue(undefined, "cool", "Low", 2050)).toBeNull();
});

it("running cost delta sums cooling and insurance and changes with the scenario", () => {
  expect(climateRunningCostDelta(model, "Low", 2050)?.usdPerYear).toBe(400);
  const hi = climateRunningCostDelta(model, "High", 2050);
  expect(hi?.usdPerYear).toBe(2100);
  expect(hi?.label).toContain("$2,100");
  expect(climateRunningCostDelta(model, "Low", 2030)).toBeNull();
});

it("formats deltas and money", () => {
  expect(deltaText(10, 22)).toBe("+12");
  expect(deltaText(2, 1.5)).toBe("-0.5");
  expect(deltaText(3, 3)).toBe("no change");
  expect(deltaText(100, 1500, true)).toBe("+$1,400");
  expect(deltaText(900, 100, true)).toBe("-$800");
  expect(formatValue("cool", 1200)).toBe("$1,200");
});
