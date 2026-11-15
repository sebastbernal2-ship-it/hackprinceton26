import { describe, expect, it } from "vitest";
import { buildActChecklist, checklistText, GROUPS, overall, progress, type ActChecklistInput } from "../act-checklist";
import { buildDiligence } from "../act";
import { legalItems } from "../discipline";
import type { Asset } from "../assets";
import type { CostBreakdown, CostCategory } from "../cost-categories";

const piece = (name: string, category = "other") => ({ assetId: name, name, category }) as Asset;
const cat = (id: CostCategory["id"], label: string, expected: number | null): CostCategory => ({
  id, label, basis: "one_time", items: [], subtotal: expected === null ? null : { low: expected * 0.8, expected, high: expected * 1.2 },
  count: 1, observed: 0, estimated: 1, unpriced: 0, share: null,
});
const breakdown = { oneTime: [cat("permits", "Permits and fees", 9000), cat("equipment", "Equipment", 60000), cat("install", "Install and fit-out", 90000), cat("repairs", "Repairs", 20000), cat("contingency", "Contingency", 30000), cat("climate" as never, "x", null)], running: [], oneTimeTotal: null, runningTotal: null, runningBase: null } as CostBreakdown;
const base = (over: Partial<ActChecklistInput> = {}): ActChecklistInput => ({
  concept: "cafe", budget: 200000, allIn: { low: 150000, high: 300000 }, monthly: { low: 8000, high: 12000 }, breakdown,
  legal: legalItems({ concept: "cafe", city: "Houston", sqft: 1200, seats: 20, yearBuilt: 1970, hasSprinklers: null, permittedUse: null }),
  findings: [], structure: null, kit: [piece("Espresso machine"), piece("Gas range", "range")], seats: 20, issues: null,
  reused: buildDiligence({ unpricedPieces: ["Bake rack"], assumedArea: true, linkedBuilding: false }), unknownFactors: [], ...over,
});
const all = (g: ReturnType<typeof buildActChecklist>) => g.flatMap((x) => x.items);

describe("act checklist", () => {
  it("has the five groups in order, each with items", () => {
    const g = buildActChecklist(base());
    expect(g.map((x) => x.id)).toEqual(GROUPS.map((x) => x.id));
    for (const x of g) expect(x.items.length).toBeGreaterThan(0);
  });
  it("puts blockers first inside every group", () => {
    const rank = { blocker: 0, should: 1, nice: 2 };
    for (const g of buildActChecklist(base())) {
      const r = g.items.map((x) => rank[x.priority]);
      expect(r).toEqual([...r].sort((a, b) => a - b));
    }
  });
  it("has unique ids and a why and owner on every item", () => {
    const items = all(buildActChecklist(base()));
    expect(new Set(items.map((x) => x.id)).size).toBe(items.length);
    for (const x of items) { expect(x.why.length).toBeGreaterThan(10); expect(x.owner.length).toBeGreaterThan(2); }
  });
  it("includes every legal item and the lease clauses", () => {
    const input = base();
    const ids = all(buildActChecklist(input)).map((x) => x.id);
    for (const l of input.legal) expect(ids).toContain(`legal:${l.id}`);
    for (const c of ["use", "exclusive", "assignment", "delivery", "landlord-work"]) expect(ids).toContain(`legal:lease-${c}`);
  });
  it("inlines live budget and the top 3 cost categories, leaving out contingency and permits", () => {
    const fin = buildActChecklist(base())[0].items;
    expect(fin.find((x) => x.id === "fin:budget")!.live).toContain("$200k");
    expect(fin.find((x) => x.id === "fin:budget")!.live).toContain("$150k to $300k");
    expect(fin.filter((x) => x.id.startsWith("fin:bids:")).map((x) => x.id)).toEqual(["fin:bids:install", "fin:bids:equipment", "fin:bids:repairs"]);
  });
  it("makes an over-budget range a blocker and says unknown when nothing is priced", () => {
    expect(buildActChecklist(base({ budget: 100000 }))[0].items.find((x) => x.id === "fin:budget")!.priority).toBe("blocker");
    const none = buildActChecklist(base({ allIn: null, monthly: null, breakdown: null }))[0].items;
    expect(none.find((x) => x.id === "fin:budget")!.live).toMatch(/not priced/);
    expect(none.find((x) => x.id === "fin:rent")!.live).toMatch(/unknown/);
    expect(none.some((x) => x.id === "fin:bids")).toBe(true);
  });
  it("turns inspection findings and screening flags into inspection items", () => {
    const f = { id: "f1", category: "hvac", title: "Old rooftop unit", severity: "high", verificationStep: "Ask for the service record.", canConfirmFromImagery: false } as never;
    const g = buildActChecklist(base({ findings: [f, { ...(f as object), id: "f2", severity: "low", canConfirmFromImagery: true } as never], structure: { tier: "elevated", yearBuilt: 1970, flags: [{ id: "flood", lens: "Flood", severity: "elevated", text: "Zone AE", status: "derived" }] } }));
    const insp = g.find((x) => x.id === "inspection")!.items;
    expect(insp.some((x) => x.id === "insp:finding:f1")).toBe(true);
    expect(insp.some((x) => x.id === "insp:finding:f2")).toBe(false);
    expect(insp.find((x) => x.id === "insp:flag:flood")!.priority).toBe("blocker");
  });
  it("derives layout live values from placed pieces and Planner issues", () => {
    const lay = buildActChecklist(base({ issues: [{ kind: "narrow_aisle", message: "Aisle is 0.6 m", keys: ["a"] }] }))[3].items;
    expect(lay.find((x) => x.id === "lay:utilities")!.live).toMatch(/gas/);
    expect(lay.find((x) => x.id === "lay:utilities")!.live).toMatch(/water/);
    expect(lay.find((x) => x.id === "lay:clear")!.priority).toBe("blocker");
    expect(lay.find((x) => x.id === "lay:occupancy")!.live).toMatch(/limit unknown/);
    expect(buildActChecklist(base({ issues: null }))[3].items.find((x) => x.id === "lay:clear")!.live).toMatch(/not checked/);
  });
  it("never claims anything is verified", () => {
    const g = buildActChecklist(base({ unknownFactors: ["zoning_fit"] }));
    for (const x of all(g)) expect(`${x.title} ${x.why} ${x.live ?? ""}`).not.toMatch(/\b(is|are|was|were|has been|have been) (verified|confirmed|approved|compliant|certified)\b|\bverified by\b/i);
  });
  it("counts progress and writes checked boxes to the text", () => {
    const g = buildActChecklist(base());
    const first = g[0].items[0].id;
    const done = new Set([first]);
    expect(progress(g[0].items, done).done).toBe(1);
    expect(overall(g, done).total).toBe(all(g).length);
    expect(checklistText(g, done, "1 Main St")).toContain(`[x] ${g[0].items[0].title}`);
    expect(progress([], new Set()).pct).toBe(0);
  });
});
