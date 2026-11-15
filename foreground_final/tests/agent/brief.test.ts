import { describe, expect, it } from "vitest";
import { mergeBrief, parseBrief, parseBriefRegex } from "@/lib/agent/brief";

describe("parseBriefRegex", () => {
  it("parses the demo query", () => {
    expect(parseBriefRegex("fast-casual taqueria, 40 seats, $150k budget, Houston")).toEqual({
      concept: "fast-casual",
      cuisine: "Mexican",
      seats: 40,
      budgetUsd: 150_000,
      city: "Houston",
    });
  });

  it("parses an LA cafe with must-haves", () => {
    const b = parseBriefRegex("Specialty coffee cafe in LA with a patio, about 25 seats, budget $90,000");
    expect(b).toMatchObject({ concept: "cafe", cuisine: "Coffee", seats: 25, budgetUsd: 90_000, city: "Los Angeles" });
    expect(b.mustHaves).toEqual(["patio"]);
  });

  it.each([
    ["$150k", 150_000],
    ["$150,000", 150_000],
    ["150k budget", 150_000],
    ["a budget of $1.2 million", 1_200_000],
    ["200 grand to spend", 200_000],
    ["$0.25m", 250_000],
  ])("reads the budget from %s", (text, expected) => {
    expect(parseBriefRegex(`pizza place, ${text}`).budgetUsd).toBe(expected);
  });

  it("does not mistake rent per square foot or seat counts for the budget", () => {
    const b = parseBriefRegex("ramen bar, 30 seats, rent under $30/sf, Los Angeles");
    expect(b.budgetUsd).toBeUndefined();
    expect(b.seats).toBe(30);
    expect(b.cuisine).toBe("Japanese");
  });

  it("prefers the number next to the word budget", () => {
    expect(parseBriefRegex("I made $80k last year, build-out budget $120k, tacos").budgetUsd).toBe(120_000);
  });

  it.each([
    ["sit-down Italian bistro, 80 seats", "full-service"],
    ["drive-thru burgers", "quick-service"],
    ["cocktail lounge downtown", "bar"],
    ["boba tea shop", "cafe"],
    ["something tasty", "fast-casual"],
  ])("maps %s to %s", (text, concept) => {
    expect(parseBriefRegex(text).concept).toBe(concept);
  });

  it("only reads LA as a city when it stands alone in capitals", () => {
    expect(parseBriefRegex("taco stand, LA").city).toBe("Los Angeles");
    expect(parseBriefRegex("a la carte tapas place").city).toBeUndefined();
    expect(parseBriefRegex("bakery in Koreatown").city).toBe("Los Angeles");
    expect(parseBriefRegex("bbq in the Heights").city).toBe("Houston");
  });

  it("leaves out what the text does not say", () => {
    expect(parseBriefRegex("")).toEqual({ concept: "fast-casual" });
  });
});

describe("mergeBrief", () => {
  const draft = { concept: "full-service" as const, cuisine: "Oaxacan", seats: 45, budgetUsd: 999, city: null, mustHaves: ["Patio", "hood"] };

  it("keeps explicit numbers from the text over the model's reading", () => {
    const merged = mergeBrief(draft, parseBriefRegex("taqueria, 40 seats, $150k, Houston, needs a hood"));
    expect(merged).toEqual({
      concept: "full-service",
      cuisine: "Oaxacan",
      seats: 40,
      budgetUsd: 150_000,
      city: "Houston",
      mustHaves: ["hood", "patio"],
    });
  });

  it("drops implausible model numbers", () => {
    expect(mergeBrief(draft, { concept: "fast-casual" }).budgetUsd).toBeUndefined();
  });
});

describe("parseBrief", () => {
  const text = "taqueria, 40 seats, $150k budget, Houston";

  it("uses the extractor when it answers", async () => {
    const out = await parseBrief(text, {
      extractor: async () => ({ concept: "fast-casual", cuisine: "Mexican", seats: 40, budgetUsd: 150_000, city: "Houston", mustHaves: [] }),
    });
    expect(out.source).toBe("llm");
    expect(out.brief).toMatchObject({ concept: "fast-casual", seats: 40, budgetUsd: 150_000, city: "Houston" });
  });

  it("falls back to the regex parse when the extractor throws", async () => {
    const out = await parseBrief(text, { extractor: async () => { throw new Error("no network"); } });
    expect(out).toEqual({ source: "regex", brief: parseBriefRegex(text) });
  });

  it("falls back when the extractor returns the wrong shape", async () => {
    const out = await parseBrief(text, { extractor: async () => ({ concept: "spaceship" }) as never });
    expect(out.source).toBe("regex");
  });

  it("falls back when the extractor is too slow", async () => {
    const out = await parseBrief(text, { timeoutMs: 20, extractor: () => new Promise(() => {}) });
    expect(out.source).toBe("regex");
  });
});
