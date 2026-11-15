import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/lib/agent/events";

vi.mock("@/lib/engine", async () => {
  const { fakeAnalysis } = await import("./helpers");
  return { analyzeSite: vi.fn(fakeAnalysis) };
});

import { analyzeSite } from "@/lib/engine";
import { createToolkit } from "@/lib/agent/tools";

const brief = { concept: "fast-casual" as const, cuisine: "Mexican", seats: 40, budgetUsd: 150_000, city: "Houston" as const };

/** Invoke a tool the way the graph does, capturing what it writes to the custom stream. */
async function call(t: unknown, input: unknown) {
  const written: AgentEvent[] = [];
  const config = { writer: (c: { foreground: AgentEvent }) => written.push(c.foreground) };
  const out = await (t as { invoke: (i: unknown, c: unknown) => Promise<unknown> }).invoke(input, config);
  return { out: JSON.parse(String(out)), written };
}

describe("agent tools over the real site cache", () => {
  const kit = createToolkit(brief);

  it("loads all 12 sites", () => {
    expect(kit.sites).toHaveLength(12);
  });

  it("search_sites defaults to the brief's city and ranks on listing facts", async () => {
    const { out } = await call(kit.tools.searchSites, {});
    expect(out.candidates).toHaveLength(6);
    expect(out.candidates.every((c: { city: string }) => c.city === "Houston")).toBe(true);
    expect(out.candidates.map((c: { paperRank: number }) => c.paperRank)).toEqual([1, 2, 3, 4, 5, 6]);
    const hero = out.candidates.find((c: { siteId: string }) => c.siteId === "1018657");
    const site = kit.sites.find((s) => s.id === "1018657")!;
    expect(hero).toMatchObject({ sf: site.space.sf, rentPerSfYr: site.space.rentPerSfYr, secondGen: true });
    expect(hero.annualBaseRentUsd).toBe(Math.round(site.space.sf * site.space.rentPerSfYr!));
    expect(["fits", "tight", "oversized"]).toContain(hero.sizeFit);
    expect(out.summary).toContain("6 available spaces in Houston");
    expect(JSON.stringify(out).length).toBeLessThan(4_000);
  });

  it("search_sites filters by city, size and rent", async () => {
    const la = (await call(kit.tools.searchSites, { city: "Los Angeles" })).out.candidates;
    expect(la).toHaveLength(6);
    const small = (await call(kit.tools.searchSites, { maxSf: 2000, maxRentPerSfYr: 20 })).out.candidates;
    expect(small.length).toBeGreaterThan(0);
    expect(small.every((c: { sf: number; rentPerSfYr: number }) => c.sf <= 2000 && c.rentPerSfYr <= 20)).toBe(true);
  });

  it("searches both cities when the brief names none", () => {
    expect(createToolkit({ concept: "cafe" }).searchCandidates()).toHaveLength(12);
  });

  it("inspect_site returns listing facts, findings and tenant history", async () => {
    const { out } = await call(kit.tools.inspectSite, { siteId: "1018657" });
    const site = kit.sites.find((s) => s.id === "1018657")!;
    expect(out.costar).toMatchObject({ address: "2600 Travis St, Houston, TX", sf: site.space.sf, rentPerSfYr: site.space.rentPerSfYr, serviceType: "NNN" });
    expect(out.findings.some((f: { kind: string; status: string }) => f.kind === "hood" && f.status === "present")).toBe(true);
    expect(out.tenantHistory.foodTenants).toBeGreaterThanOrEqual(5);
    // CoStar record for suite 104: Gage Lounge moved out, Mezcal Houston closed. Only one of them "closed".
    expect(out.tenantHistory.thisSuite).toMatchObject({ left: 2, closed: 1 });
    expect(out.tenantHistory.thisSuite.wording).toBe("2 food tenants left this suite within 2 years; Mezcal Houston closed in Oct 2026.");
    expect(out.tenantHistory.thisSuite.tenants).toEqual([
      { name: "Gage Lounge", outcome: "moved out", left: "Aug 2021", years: 1 },
      { name: "Mezcal Houston", outcome: "closed", left: "Oct 2026", years: 1.7 },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/fail(ed|ure)/i);
    expect(out.summary).toContain("2600 Travis St");
    expect(JSON.stringify(out).length).toBeLessThan(6_000);
  });

  it("returns a clear error for an unknown site", async () => {
    const { out } = await call(kit.tools.inspectSite, { siteId: "999" });
    expect(out.error).toContain("Unknown siteId 999");
    expect(out.error).toContain("1018657");
  });

  it("analyze_site digests the engine output and emits a progress event", async () => {
    const { out, written } = await call(kit.tools.analyzeSite, { siteId: "1018657" });
    expect(out.buildout).toMatchObject({ budgetUsd: 150_000, overBudget: true });
    expect(out.buildout.lowUsd).toBeLessThan(out.buildout.highUsd);
    expect(out.costLines.length).toBeGreaterThanOrEqual(2);
    expect(out.breakeven.verdict).toBe("unlikely");
    expect(out.threeYear).toHaveProperty("baseProfitUsd");
    expect(out.graveyard).toMatchObject({ leftThisSuite: 2, closedInThisSuite: 1 });
    expect(out.graveyard.sameSuiteWording).toContain("Mezcal Houston closed in Oct 2026");
    expect(JSON.stringify(out.graveyard)).not.toMatch(/sameSuiteFailures|fail(ed|ure)/i);
    expect(out.score.score).toBeGreaterThanOrEqual(0);
    expect(out.summary).toMatch(/2600 Travis St: build-out \$\d+k–\$\d+k \(over budget\)/);
    expect(written).toEqual([expect.objectContaining({ type: "tool", name: "analyze_site", status: "progress", siteId: "1018657" })]);
  });

  it("analyze_site supports a what-if and caches per brief", async () => {
    vi.mocked(analyzeSite).mockClear();
    await call(kit.tools.analyzeSite, { siteId: "800827" });
    await call(kit.tools.analyzeSite, { siteId: "800827" });
    expect(analyzeSite).toHaveBeenCalledTimes(1);
    const { out } = await call(kit.tools.analyzeSite, { siteId: "800827", whatIf: { seats: 24 } });
    expect(out.whatIf).toEqual({ seats: 24 });
    expect(vi.mocked(analyzeSite).mock.calls.at(-1)?.[1]).toMatchObject({ seats: 24, budgetUsd: 150_000 });
  });

  it("analyze_site reports an engine failure instead of throwing", async () => {
    vi.mocked(analyzeSite).mockImplementationOnce(() => {
      throw new Error("analyzeSite not implemented yet (T3)");
    });
    const { out } = await call(createToolkit(brief).tools.analyzeSite, { siteId: "838391" });
    expect(out.error).toContain("not implemented");
  });

  it("compare_sites sorts by score and calls out the problem sites", async () => {
    const ids = kit.searchCandidates().map((c) => c.siteId);
    const { out } = await call(kit.tools.compareSites, { siteIds: ids });
    const scores = out.byEngineScore.map((r: { score: number }) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(out.overBudget).toContain("1018657");
    expect(out.breakevenUnlikely).toContain("1018657");
    expect(out.summary).toMatch(/6 sites compared/);
  });

  it("record_decision emits a decision event with engine numbers", async () => {
    const { out, written } = await call(kit.tools.recordDecision, {
      siteId: "1018657", action: "drop", reason: "$198k–$401k build-out against a $150k budget.", finding: "over budget",
    });
    expect(out.summary).toBe("Recorded: drop 2600 Travis St");
    expect(written).toEqual([
      expect.objectContaining({
        type: "decision", siteId: "1018657", action: "drop", finding: "over budget",
        numbers: expect.objectContaining({ overBudget: true, address: "2600 Travis St" }),
      }),
    ]);
    const bad = await call(kit.tools.recordDecision, { siteId: "nope", action: "drop", reason: "x" });
    expect(bad.out.error).toContain("Unknown siteId");
    expect(bad.written).toEqual([]);
  });

  it("submit_ranking emits the result in rank order and rejects unknown sites", async () => {
    const { written } = await call(kit.tools.submitRanking, {
      summary: "Start with 15015 Westheimer.",
      ranking: [
        { siteId: "862130", rank: 2, oneLineReason: "2.0 turns a day.", topRisk: "Four closures at the address." },
        { siteId: "800827", rank: 1, oneLineReason: "1.5 turns a day.", topRisk: "No hood." },
      ],
    });
    expect(written).toHaveLength(1);
    const result = written[0] as Extract<AgentEvent, { type: "result" }>;
    expect(result.ranking.map((r) => [r.siteId, r.rank])).toEqual([["800827", 1], ["862130", 2]]);
    expect(result.ranking[0].numbers).toMatchObject({ address: "15015 Westheimer Rd", city: "Houston" });
    const bad = await call(kit.tools.submitRanking, { summary: "x", ranking: [{ siteId: "123", rank: 1, oneLineReason: "x", topRisk: "y" }] });
    expect(bad.out.error).toContain("Unknown siteId");
    expect(bad.written).toEqual([]);
  });

  it("never calls a tenant that moved out a failure", async () => {
    const { sameSuiteStory } = await import("@/lib/agent/tools");
    const base = kit.sites.find((s) => s.id === "1018657")!;
    const tenant = (name: string, outcome: "moved" | "closed" | "unknown", years: number | null, moveOut: string | null) =>
      ({ name, industry: null, isFood: true, moveIn: null, moveOut, years, sameSuite: true, current: false, outcome });
    expect(sameSuiteStory({ ...base, tenantHistory: [] }).wording).toBe("No food tenant has left this suite on record.");
    expect(sameSuiteStory({ ...base, tenantHistory: [tenant("Cafe A", "moved", 6, "2020-03-01")] }).wording)
      .toBe("1 food tenant left this suite; none is recorded as closed.");
    expect(sameSuiteStory({ ...base, tenantHistory: [tenant("Cafe A", "unknown", null, null), tenant("Grill B", "closed", 2.5, null)] }).wording)
      .toBe("2 food tenants left this suite; Grill B closed.");
    const { out } = await call(kit.tools.compareSites, { siteIds: ["1018657", "800827"] });
    expect(out.tenantsLeftThisSuite).toEqual([{ siteId: "1018657", wording: "2 food tenants left this suite within 2 years; Mezcal Houston closed in Oct 2026." }]);
    expect(kit.numbers("1018657")).toMatchObject({ sameSuiteFailures: 2, sameSuiteClosed: 1 });
  });

  it("fallbackRanking ranks by engine score", () => {
    const ranking = kit.fallbackRanking();
    expect(ranking).toHaveLength(5);
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    const scores = ranking.map((r) => r.numbers!.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
