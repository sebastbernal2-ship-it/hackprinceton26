import { describe, expect, it } from "vitest";
import { conceptFromBrief, DISCIPLINES, legalItems, PANELS, panelsFor, parseMode, verdicts, type SiteFacts } from "../discipline";

const site: SiteFacts = { concept: "cafe", city: "Houston, TX", sqft: 1300, seats: 30, yearBuilt: null, hasSprinklers: null, permittedUse: null };
const base = { legal: legalItems(site), factors: [] as { factorId: string; status: "unknown" | "observed" }[] };

describe("grouping", () => {
  it("has five disciplines and every panel belongs to one", () => {
    expect(DISCIPLINES.map((d) => d.id)).toEqual(["financial", "legal", "structural", "layout", "market"]);
    expect(PANELS.every((p) => DISCIPLINES.some((d) => d.id === p.discipline))).toBe(true);
    expect(new Set(PANELS.map((p) => p.id)).size).toBe(PANELS.length);
  });
  it("returns only available panels of the page, in order", () => {
    expect(panelsFor("quantify", "financial", ["q-running", "q-inputs", "cost-side"])).toEqual(["q-inputs", "q-running"]);
    expect(panelsFor("property", "legal", ["inspection", "legal-permits", "q-structure"])).toEqual(["legal-permits", "inspection"]);
    expect(panelsFor("property", "market", [])).toEqual([]);
  });
  it("parses the stored mode with a safe default", () => {
    expect(parseMode("discipline")).toBe("discipline");
    expect(parseMode("x")).toBe("current");
    expect(parseMode(null)).toBe("current");
  });
});

describe("legal items", () => {
  it("never claims zoning is known when no record exists", () => {
    expect(legalItems(site).find((i) => i.id === "zoning")?.status).toBe("unknown");
    expect(legalItems({ ...site, permittedUse: "Retail" }).find((i) => i.id === "zoning")?.status).toBe("to-confirm");
  });
  it("labels every estimate and adds food items only for food concepts", () => {
    const items = legalItems(site);
    for (const i of items.filter((x) => x.status === "estimated")) expect(i.text.startsWith("DEMO ESTIMATE")).toBe(true);
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(["health", "grease", "ada", "fire", "signage", "lease"]));
    expect(items.find((i) => i.id === "health")?.ask).toMatch(/Houston/);
    expect(legalItems({ ...site, concept: "gym" }).some((i) => i.id === "health")).toBe(false);
  });
  it("flags pre-ADA buildings", () => {
    expect(legalItems({ ...site, yearBuilt: 1975 }).some((i) => i.id === "pre-ada")).toBe(true);
  });
  it("reads the concept from the brief", () => {
    expect(conceptFromBrief([{ answer: "I want an independent Cafe" }])).toBe("cafe");
    expect(conceptFromBrief([{ answer: "a gym" }])).toBe("");
  });
});

describe("verdicts", () => {
  it("is unknown everywhere when nothing is loaded, and legal always needs attention", () => {
    const v = verdicts(base);
    expect(v.financial.dot).toBe("unknown");
    expect(v.structural.dot).toBe("unknown");
    expect(v.layout.dot).toBe("unknown");
    expect(v.market.dot).toBe("unknown");
    expect(v.legal.dot).toBe("attention");
    expect(v.legal.text).toMatch(/Permitted use unknown/);
  });
  it("flags over budget and long break-even, passes within budget", () => {
    expect(verdicts({ ...base, hasAllIn: true, budgetTone: "over" }).financial.dot).toBe("attention");
    expect(verdicts({ ...base, hasAllIn: true, budgetTone: "under", paybackMonths: 48 }).financial.dot).toBe("attention");
    const ok = verdicts({ ...base, hasAllIn: true, budgetTone: "under", paybackMonths: 20 }).financial;
    expect(ok.dot).toBe("ok");
    expect(ok.text).toMatch(/Estimated/);
  });
  it("structural uses tier and age", () => {
    expect(verdicts({ ...base, structureTier: "elevated" }).structural.dot).toBe("attention");
    expect(verdicts({ ...base, yearBuilt: 1950 }).structural.dot).toBe("attention");
    expect(verdicts({ ...base, structureTier: "low", yearBuilt: 2015 }).structural.dot).toBe("ok");
  });
  it("layout and market turn ok with content", () => {
    expect(verdicts({ ...base, equipmentCount: 5, seats: 24 }).layout.dot).toBe("ok");
    expect(verdicts({ ...base, factors: [{ factorId: "a", status: "observed" }, { factorId: "b", status: "unknown" }] }).market.text).toMatch(/^1 evidence/);
  });
});
