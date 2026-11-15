import { describe, expect, it } from "vitest";
import type { RunLike } from "@/components/flow/search-map";
import { buildPicks, buildSearchView, oneLine } from "@/components/flow/search-map";
import type { RankedSite, SiteNumbers } from "@/lib/agent/events";

const spaces = ["a", "b", "c", "d", "e"].map((id) => ({ siteId: id, photo: `/${id}.jpg`, address: `${id} Main St`, city: "Houston", sf: 1000, hasScan: id === "a" }));

const numbers = (over: Partial<SiteNumbers> = {}): SiteNumbers => ({
  address: "1 Real St", city: "Houston", sf: 2000, rentPerSfYr: 20, buildoutUsd: { low: 100_000, mid: 150_000, high: 200_000 },
  overBudget: false, seats: 40, turnsPerDay: 2, breakevenVerdict: "comfortable", baseProfitUsd: 1, sameSuiteFailures: 0,
  sameSuiteClosed: 0, sameSuiteWording: "", trend: "neutral", score: 1, ...over,
});
const ranked = (siteId: string, rank: number, n?: SiteNumbers): RankedSite => ({ siteId, rank, oneLineReason: `Reason ${siteId}. More text.`, topRisk: "", numbers: n });

const run = (over: Partial<RunLike> = {}): RunLike => ({ status: "streaming", inspectors: {}, decisions: [], ranking: null, plan: [], summary: null, error: null, ...over });
const ins = (siteId: string, status: "running" | "done", verdict?: "strong" | "reject") => ({
  id: `t${siteId}`, siteId, status, order: 0, tools: [],
  verdict: verdict ? { siteId, verdict, headline: `Headline ${siteId}.`, topRisk: `Risk ${siteId}. Extra.`, positives: [], risks: [] } : undefined,
});
const state = (v: ReturnType<typeof buildSearchView>, id: string) => v.candidates.find((c) => c.siteId === id)?.state;

describe("oneLine", () => {
  it("keeps the first sentence and trims long ones", () => {
    expect(oneLine("It is $3.8 a turn. Then more.")).toBe("It is $3.8 a turn.");
    expect(oneLine("x ".repeat(100), 20).endsWith("…")).toBe(true);
    expect(oneLine(undefined)).toBe("");
  });
});

describe("buildSearchView", () => {
  it("starts with everything queued", () => {
    const v = buildSearchView(run({ status: "connecting" }), spaces);
    expect(v).toMatchObject({ status: "running", checked: 0, total: 5, headline: "Looking through every space" });
    expect(v.candidates.every((c) => c.state === "queued")).toBe(true);
  });

  it("walks a space from queued to inspecting to kept or rejected with the agent's reason", () => {
    const mid = buildSearchView(run({ inspectors: { t1: ins("a", "running") } }), spaces);
    expect(state(mid, "a")).toBe("inspecting");
    expect(mid.headline).toBe("Looking inside a Main St");
    const done = buildSearchView(
      run({ inspectors: { t1: ins("a", "done", "strong"), t2: ins("b", "done", "reject") } }),
      spaces,
    );
    expect(state(done, "a")).toBe("kept");
    expect(done.candidates[1]).toMatchObject({ state: "rejected", reason: "Risk b." });
    expect(done.checked).toBe(2);
  });

  it("a drop decision wins and carries its one-line reason", () => {
    const v = buildSearchView(
      run({
        inspectors: { t1: ins("a", "done", "strong") },
        decisions: [{ type: "decision", siteId: "a", action: "drop", reason: "Build-out is 4x budget. Also a stretch.", seq: 0 }],
      }),
      spaces,
    );
    expect(v.candidates[0]).toMatchObject({ state: "rejected", reason: "Build-out is 4x budget." });
  });

  it("the final ranking decides kept; other inspected spaces are rejected; never-opened stay queued", () => {
    const v = buildSearchView(
      run({
        status: "done",
        inspectors: { t1: ins("a", "done", "strong"), t2: ins("b", "done", "strong") },
        ranking: [ranked("a", 1, numbers())],
      }),
      spaces,
    );
    expect(state(v, "a")).toBe("kept");
    expect(state(v, "b")).toBe("rejected");
    expect(state(v, "c")).toBe("queued");
    expect(v).toMatchObject({ status: "done", checked: 2, headline: "Checked 2 spaces, 1 worth a walk" });
  });

  it("maps abort and error (a failed run is an error, never a fallback)", () => {
    expect(buildSearchView(run({ status: "aborted" }), spaces)).toMatchObject({ status: "done", headline: "Stopped after checking 0" });
    expect(buildSearchView(run({ status: "error" }), spaces).status).toBe("error");
    expect(buildSearchView(run({ status: "error", error: "HTTP 503" }), spaces).error).toBe("HTTP 503");
  });
});

describe("buildPicks", () => {
  it("takes the top three by rank with engine numbers and the site's photo", () => {
    const picks = buildPicks(
      [ranked("c", 3, numbers()), ranked("a", 1, numbers({ overBudget: true })), ranked("b", 2, numbers()), ranked("d", 4, numbers())],
      spaces,
    );
    expect(picks.map((p) => [p.siteId, p.rank])).toEqual([["a", 1], ["b", 2], ["c", 3]]);
    expect(picks[0]).toMatchObject({
      photo: "/a.jpg", address: "1 Real St", city: "Houston", sf: 2000, hasScan: true,
      allInUsd: { low: 100_000, high: 200_000 }, reason: "Reason a.", highlight: { tone: "needed", text: "Over budget" },
    });
    expect(picks[1].highlight).toEqual({ tone: "saved", text: "Within budget" });
    expect(picks[1].hasScan).toBe(false);
  });

  it("skips a ranked site that has no engine numbers, and handles no ranking", () => {
    expect(buildPicks([ranked("a", 1), ranked("b", 2, numbers())], spaces).map((p) => [p.siteId, p.rank])).toEqual([["b", 1]]);
    expect(buildPicks(null, spaces)).toEqual([]);
  });

  it("flags a suite that lost food tenants when nothing else stands out", () => {
    const [p] = buildPicks([ranked("a", 1, numbers({ overBudget: null, sameSuiteFailures: 2 }))], spaces);
    expect(p.highlight).toEqual({ tone: "maybe", text: "2 food tenants left" });
  });
});
