import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkLayout, placeAsset } from "../asset-layout";
import type { Asset } from "../assets";
import { autoDesign, designPieces, ADA_AISLE, type AutoDesignInput, type Concept } from "../auto-design";
import { toPlacements } from "../planner";

const root = path.resolve(__dirname, "../../../../");
const lib = path.join(root, "assets/library");
const assets: Asset[] = readdirSync(lib).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(lib, f), "utf8")) as Asset);
const catalog = JSON.parse(readFileSync(path.join(root, "data/financial/catalog.json"), "utf8")) as { equipment: { id: string; listPrice: number }[]; reskinEquipment: { id: string; listPrice: number }[] };
const prices = new Map([...catalog.equipment, ...catalog.reskinEquipment].map((e) => [e.id, e.listPrice]));
const priceOf = (a: Asset) => (a.priceRef ? (prices.get(a.priceRef) ?? null) : null);
const floor = { width: 11, depth: 7.5 };
const base = (over: Partial<AutoDesignInput> = {}): AutoDesignInput => ({ floor, seatsTarget: 24, concept: "cafe", assets, priceOf, ...over });

describe("autoDesign", () => {
  it("lays out a cafe with zero problems, no overlaps and seats within 10%", () => {
    const d = autoDesign(base());
    expect(d.issues).toEqual([]);
    expect(d.access.unreachable).toEqual([]);
    expect(d.access.ok).toBe(true);
    expect(d.seatsWithinTolerance).toBe(true);
    expect(Math.abs(d.seats - 24)).toBeLessThanOrEqual(2.4);
    expect(d.steps.length).toBeGreaterThan(20);
    expect(d.zones.map((z) => z.zone)).toContain("queue lane");
    const ps = d.steps.map((s, i) => placeAsset(s.asset, `${i}`, s.rot, s.x, s.y));
    expect(checkLayout(floor, ps).filter((i) => i.kind === "overlap")).toEqual([]);
  });

  it.each<Concept>(["cafe", "grab-and-go", "full-service", "frozen-yogurt"])("%s passes checkLayout and the 0.91 m access check", (concept) => {
    const d = autoDesign(base({ concept, seatsTarget: concept === "grab-and-go" ? 10 : 20 }));
    expect(d.issues).toEqual([]);
    expect(d.access.ok).toBe(true);
    expect(checkLayout(floor, toPlacements(designPieces(d)))).toEqual([]);
    expect(d.seatsWithinTolerance).toBe(true);
    expect(d.steps[0].zone === "service" || d.steps[0].zone === "back-of-house").toBe(true);
  });

  it("keeps the same aisles on every window wall and still passes", () => {
    for (const windowWall of ["front", "back", "left", "right"] as const) {
      const d = autoDesign(base({ windowWall, floor: { width: 10, depth: 8 }, seatsTarget: 20, patio: { seats: 4 } }));
      expect(d.issues, windowWall).toEqual([]);
      expect(d.patioIssues, windowWall).toEqual([]);
      expect(d.access.ok, windowWall).toBe(true);
      expect(d.seatsWithinTolerance, windowWall).toBe(true);
      expect(d.patioSeats).toBe(4);
    }
  });

  it("sweep: 4 concepts x 4 window walls x 4 floors x 3 targets all pass with nothing dropped by the layout check", () => {
    let runs = 0;
    for (const windowWall of ["front", "back", "left", "right"] as const) {
      for (const concept of ["cafe", "grab-and-go", "full-service", "frozen-yogurt"] as const) {
        for (const f of [{ width: 11, depth: 7.5 }, { width: 8, depth: 6 }, { width: 14, depth: 9 }, { width: 9.3, depth: 6.7 }]) {
          for (const seatsTarget of [8, 20, 34]) {
            const d = autoDesign({ floor: f, seatsTarget, concept, assets, windowWall, patio: { seats: 4 } });
            const tag = `${windowWall} ${concept} ${f.width}x${f.depth} ${seatsTarget}`;
            expect(d.issues, tag).toEqual([]);
            expect(d.patioIssues, tag).toEqual([]);
            expect(d.access.ok, tag).toBe(true);
            expect(d.dropped.filter((x) => /layout check/.test(x.reason)), tag).toEqual([]);
            runs++;
          }
        }
      }
    }
    expect(runs).toBe(192);
  }, 60000);

  it("reports a shortfall instead of breaking aisles on a small floor", () => {
    const d = autoDesign(base({ floor: { width: 6, depth: 5 }, seatsTarget: 40 }));
    expect(d.issues).toEqual([]);
    expect(d.access.ok).toBe(true);
    expect(d.seatsWithinTolerance).toBe(false);
    expect(d.notes.join(" ")).toMatch(/will not fit more|no room/);
  });

  it("drops optional pieces by priority under a budget and says what it dropped", () => {
    const free = autoDesign(base({ patio: { seats: 6 } }));
    const budget = Math.round(free.cost.total * 0.7);
    const d = autoDesign(base({ patio: { seats: 6 }, budget }));
    expect(d.cost.total).toBeLessThanOrEqual(budget);
    expect(d.withinBudget).toBe(true);
    expect(d.dropped.length).toBeGreaterThan(0);
    expect(d.dropped.every((x) => x.reason === "over budget" || x.reason.length > 0)).toBe(true);
    // patio goes before anything inside, and the espresso machine is never dropped
    expect(d.patioSeats).toBeLessThanOrEqual(free.patioSeats);
    expect(d.steps.some((s) => s.assetId === "espresso_machine_2group")).toBe(true);
    expect(d.issues).toEqual([]);
    expect(d.narration.join(" ")).toMatch(/leave out/);
  });

  it("never drops essentials, even when the budget is impossible", () => {
    const d = autoDesign(base({ budget: 1 }));
    expect(d.withinBudget).toBe(false);
    expect(d.steps.filter((s) => s.tier === 0).length).toBeGreaterThan(0);
    expect(d.issues).toEqual([]);
  });

  it("is deterministic", () => {
    const a = autoDesign(base({ patio: { seats: 4 }, budget: 20000 }));
    const b = autoDesign(base({ patio: { seats: 4 }, budget: 20000 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps every pair of facing non-dining pieces and tables at least the ADA aisle apart", () => {
    const d = autoDesign(base());
    const groups = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
    d.steps.filter((s) => s.zone === "seating").forEach((s) => {
      const b = placeAsset(s.asset, "k", s.rot, s.x, s.y).box;
      const g = groups.get(s.group);
      groups.set(s.group, g ? { x0: Math.min(g.x0, b.x0), y0: Math.min(g.y0, b.y0), x1: Math.max(g.x1, b.x1), y1: Math.max(g.y1, b.y1) } : b);
    });
    const list = [...groups.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const gapX = Math.max(a.x0 - b.x1, b.x0 - a.x1);
      const gapY = Math.max(a.y0 - b.y1, b.y0 - a.y1);
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(ADA_AISLE);
    }
  });

  it("narrates every step that has a reason, starting with an intro", () => {
    const d = autoDesign(base());
    expect(d.narration[0]).toMatch(/design your cafe/);
    expect(d.narration.length).toBeGreaterThan(8);
    expect(d.steps.find((s) => s.assetId === "espresso_machine_2group")?.reason).toMatch(/queue/);
  });
});
