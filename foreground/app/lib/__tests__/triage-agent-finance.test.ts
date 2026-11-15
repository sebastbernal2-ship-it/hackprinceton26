import { describe, expect, it } from "vitest";
import { presenceSplit, scopeMismatch, showValue, statusCounts, tenureBars, type PresenceRadius, type TriageField, type LineageTenant } from "../triage";
import { createSseParser, linkNumbers, modeBadge, reduceTrace, emptyTrace, type AgentEvent } from "../agent";
import { bandPath, pct, scale, usd } from "../finance";

const field = (o: Partial<TriageField>): TriageField => ({ field: "area_sqft", status: "filled", valueStatus: "unknown", scope: "suite", confidence: "low", evidenceRefs: [], rule: "", reviewScore: 1, ...o });

describe("triage helpers", () => {
  it("unknown is never rendered as zero", () => {
    expect(showValue(null)).toBe("Pending");
    expect(showValue(undefined)).toBe("Pending");
    expect(showValue(0, "ft")).toBe("0 ft");
    expect(showValue(true)).toBe("yes");
  });
  it("flags suite-vs-building area comparisons as scope mismatches", () => {
    expect(scopeMismatch(field({ status: "conflicting", scope: "suite", costarValue: 12000, scanValue: 2900 }))).toBe(true);
    expect(scopeMismatch(field({ field: "floors", status: "conflicting", scope: "building", costarValue: 2, scanValue: 3 }))).toBe(false);
  });
  it("counts statuses", () => {
    const c = statusCounts([field({ status: "confirmed" }), field({ status: "confirmed" }), field({ status: "blank-unfillable" })]);
    expect(c.confirmed).toBe(2);
    expect(c["blank-unfillable"]).toBe(1);
  });
  it("lays out tenure bars on one axis and leaves unknown dates unpositioned", () => {
    const t = (o: Partial<LineageTenant>): LineageTenant => ({ tenant: "T", start: null, end: null, tenureYears: null, ending: "open", successorWasFood: null, ...o });
    const { bars } = tenureBars([t({ start: "2010-01-01", end: "2014-01-01", ending: "failure" }), t({ start: null }), t({ start: "2014-02-01" })], new Date("2020-01-01"));
    expect(bars[0].leftPct).toBe(0);
    expect(bars[0].widthPct).toBeGreaterThan(30);
    expect(bars[1].unknownDates).toBe(true);
    expect(bars[2].leftPct).toBeGreaterThan(bars[0].widthPct);
  });
  it("gives no presence bar when a side is unobserved", () => {
    const r = { dayShare: null } as unknown as PresenceRadius;
    expect(presenceSplit(r)).toBeNull();
    expect(presenceSplit({ dayShare: 0.72 } as PresenceRadius)).toEqual({ dayPct: 72, nightPct: 28 });
  });
});

describe("agent helpers", () => {
  it("parses SSE across chunk boundaries", () => {
    const got: AgentEvent[] = [];
    const feed = createSseParser((e) => got.push(e));
    feed('event: plan\ndata: {"type":"plan","ite');
    feed('ms":["a"]}\n\nevent: final\ndata: {"type":"final"}\n\n');
    expect(got.map((e) => e.type)).toEqual(["plan", "final"]);
  });
  it("badges anything that is not live", () => {
    expect(modeBadge("LIVE").live).toBe(true);
    expect(modeBadge("REPLAY").live).toBe(false);
    expect(modeBadge("SCRIPTED").text).toBe("SCRIPTED");
  });
  it("links numbers only to a cited result that contains them", () => {
    const results = { r2: { type: "tool_result", resultId: "r2", summary: '{"p": 0.18, "n": 1,200}' } } as Record<string, AgentEvent>;
    const pieces = linkNumbers("P is 0.18 and 99 sites, 1,200 seats", ["r2"], results);
    expect(pieces.find((p) => p.text === "0.18")?.cite).toBe("r2");
    expect(pieces.find((p) => p.text === "99")?.unlinked).toBe(true);
    expect(pieces.find((p) => p.text === "1,200")?.cite).toBe("r2");
  });
  it("reduces replay_info into a REPLAY mode and indexes results", () => {
    let t = reduceTrace(emptyTrace(), { type: "replay_info", mode: "REPLAY", source: "SYNTHETIC-fixture" });
    t = reduceTrace(t, { type: "tool_result", resultId: "r1", mode: "REPLAY" });
    expect(t.mode).toBe("REPLAY");
    expect(t.results.r1).toBeDefined();
    expect(t.events).toHaveLength(1);
  });
});

describe("finance helpers", () => {
  it("formats unknown as Pending, not $0", () => {
    expect(usd(null)).toBe("Pending");
    expect(usd(-1234.4)).toBe("-$1,234");
    expect(pct(undefined)).toBe("Pending");
    expect(pct(0.336)).toBe("34%");
  });
  it("scales and builds a closed band path", () => {
    expect(scale([0, 5, 10], 0, 10, 100)).toEqual([0, 50, 100]);
    expect(scale([0, 10], 0, 10, 100, true)).toEqual([100, 0]);
    expect(bandPath([0, 1], [1, 1], [2, 2])).toBe("M0.0 1.0L1.0 1.0L1.0 2.0L0.0 2.0Z");
    expect(bandPath([], [], [])).toBe("");
  });
});
