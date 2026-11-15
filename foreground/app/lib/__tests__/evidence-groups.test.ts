import { describe, expect, it } from "vitest";
import { groupEvidence } from "../evidence-groups";
import type { FactorCard } from "../matches";

const card = (p: Partial<FactorCard>): FactorCard => ({
  factorId: "x", status: "observed", value: "", unit: null, source: null, recordId: null, asOf: null, geography: null, limitations: null, ...p,
});
const bls = (stat: string) => `BLS Public Data API v1 (api.bls.gov), no key: restaurant cooks ${stat} (SOC 352014)`;

describe("evidence groups", () => {
  it("puts one factor's statistics on one card, labor as a job table", () => {
    const g = groupEvidence([
      card({ factorId: "labor_supply", value: "21.52", unit: "USD/hour", source: bls("mean hourly wage") }),
      card({ factorId: "labor_supply", value: "21.38", unit: "USD/hour", source: bls("median hourly wage") }),
      card({ factorId: "labor_supply", value: "54320", unit: "jobs", source: bls("employment") }),
      card({ factorId: "schools_education", status: "derived", value: "7", unit: "open public schools within 1 mile" }),
    ]);
    expect(g.map((x) => x.factorId)).toEqual(["labor_supply", "schools_education"]);
    expect(g[0].table?.rows).toEqual([{ label: "Restaurant cooks", cells: ["$21.52/hr", "$21.38/hr", "54,320 jobs"] }]);
    expect(g[0].source).toBe("BLS Public Data API v1 (api.bls.gov)");
  });

  it("leaves out factors with no value at this site", () => {
    const g = groupEvidence([
      card({ factorId: "income_demographics", status: "unknown", value: "" }),
      card({ factorId: "traffic_access", value: "40826", unit: "vehicles/day (AADT)" }),
    ]);
    expect(g.map((x) => x.factorId)).toEqual(["traffic_access"]);
    expect(g[0].rows[0]).toMatchObject({ label: "Daily traffic", value: "40,826 vehicles/day (AADT)" });
  });
});
