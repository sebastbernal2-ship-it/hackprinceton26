import { describe, expect, it } from "vitest";
import { parseChange, parseSse, VERIFY_TOPICS } from "../imagine";
import { boundsOf, costSummary, layoutBoxes, type ReskinResult } from "../reskin";
import { rowsFor, scenarioNames, type ScenarioRow } from "../structure";

const concepts = ["italian", "indian", "japanese"].map((id) => ({ id, name: id, equipmentCount: 1, status: "assumption" }));

describe("parseChange", () => {
  it("takes the LAST concept mentioned as the target", () => {
    expect(parseChange("Turn this Italian restaurant into Indian", concepts)).toMatchObject({ kind: "reskin", toConcept: "indian" });
  });
  it("routes wall requests to the expansion path", () => {
    expect(parseChange("open the wall to the next suite", concepts).kind).toBe("wall");
  });
  it("leaves unmatched text as other, never guesses", () => {
    expect(parseChange("add a rooftop bar", concepts).kind).toBe("other");
    expect(parseChange("turn it into a rocket", concepts).kind).toBe("other");
  });
  it("ignores concepts the API did not list", () => {
    expect(parseChange("make it a mexican place", concepts).kind).toBe("other");
  });
});

describe("parseSse", () => {
  it("returns complete events and keeps the partial tail", () => {
    const { events, rest } = parseSse('event: plan\ndata: {"type":"plan","items":["a"]}\n\nevent: x\ndata: {"ty');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("plan");
    expect(rest).toContain('{"ty');
  });
  it("drops malformed events", () => {
    expect(parseSse("data: {nope\n\n").events).toEqual([]);
  });
});

describe("verify checklist", () => {
  it("has no code citations or findings language", () => {
    for (const v of VERIFY_TOPICS) expect(`${v.topic} ${v.ask}`).not.toMatch(/\b(NFPA|IBC|IFC|ADA \d|§|section \d)/i);
  });
});

describe("reskin helpers", () => {
  const r = {
    added: [{ assetId: "t" }], placements: [{ assetId: "t", x: 1, y: 1, rot: 90 }, { assetId: "k", x: 0, y: 0, rot: 0 }],
    costDelta: { lines: [{ expected: null }, { expected: 5 }], totals: { low: null, expected: null, high: null } },
  } as unknown as ReskinResult;
  it("counts unknown prices and never treats them as zero", () => {
    expect(costSummary(r.costDelta)).toEqual({ known: 1, unknown: 1, totalKnown: false });
  });
  it("flags unknown dims and swaps extents for rotated items", () => {
    const boxes = layoutBoxes(r, { t: { w: 2, d: 1 } });
    expect(boxes.find((b) => b.id === "k")?.dimsKnown).toBe(false);
    expect(boundsOf(boxes)).toEqual({ x0: 0, y0: 0, x1: 2, y1: 3 });
  });
});

describe("scenario rows", () => {
  const rows = [{ horizon: 2050, scenario: "A" }, { horizon: 2030, scenario: "B" }] as ScenarioRow[];
  it("filters exactly and does not interpolate", () => {
    expect(scenarioNames(rows)).toEqual(["A", "B"]);
    expect(rowsFor(rows, 2070, "A")).toEqual([]);
  });
});
