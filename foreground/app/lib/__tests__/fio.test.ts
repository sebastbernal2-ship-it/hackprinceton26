import { describe, expect, it } from "vitest";
import { answerFio, seatRange } from "../fio";
import type { Match } from "../matches";
import type { FioContext } from "../fio";

const match = {
  listingId: 1, address: "1 Main St", detail: "", city: "Houston, TX", blurb: "", photo: "", squareFeet: 5000, spaceSquareFeet: 1200, spaceSource: "scan",
  rentPerSquareFootYear: null, tourId: "x", evidenceReadiness: 80, facts: { photos: [], property: [], location: [] }, factors: [],
  alignment: { total: 5, pass: 4, unknown: 1, fail: 0, confirmed: ["City"], unknownItems: ["Utilities"], estimatedItems: ["Seat capacity"] },
  buildout: { status: "estimated", low: 100000, high: 300000, squareFeet: 1200, basis: "scan", reason: "per sq ft" },
} as unknown as Match;
const none: FioContext = { triage: null, lineage: null, structure: null, total: null, horizons: null, projections: null, presence: null };

describe("answerFio without any key", () => {
  it("estimates seats from area", () => {
    expect(seatRange(1200)).toEqual([40, 56]);
    expect(answerFio(match, none, "How many seats?")).toContain("40 to 56");
  });
  it("answers every topic and never invents data", () => {
    for (const q of ["rent", "cost to open", "hazards", "restaurant history", "forecast", "next steps", "fit for Sarah", "hello"]) {
      expect(answerFio(match, none, q).length).toBeGreaterThan(40);
    }
    expect(answerFio(match, none, "forecast")).toContain("Unknown");
    expect(answerFio(match, none, "any flood hazards?")).toContain("Unknown");
  });
  it("labels build-out as estimated and flags a budget overrun", () => {
    const a = answerFio(match, none, "build-out budget");
    expect(a).toContain("estimated");
    expect(a).toContain("$100K to $300K");
  });
  it("reports requirements met for the brief", () => {
    expect(answerFio(match, none, "Does this fit Sarah's brief?")).toContain("4 of 5");
  });
});
