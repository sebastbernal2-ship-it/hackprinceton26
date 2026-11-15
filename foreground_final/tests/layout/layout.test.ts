import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF, type Concept, type OwnerBrief } from "@/lib/engine";
import {
  LayoutSchema,
  applyOps,
  autoLayout,
  conflicts,
  itemInBounds,
  itemRect,
  layoutCosts,
  layoutImpact,
  parseInstruction,
  rectGap,
  seatCount,
  seatPoints,
  simulateDay,
  validate,
  type Layout,
  type Op,
} from "@/lib/layout";
import { loadSites } from "@/lib/sites/load";
import { finding, makeSite } from "../engine/fixtures";

const CONCEPTS: Concept[] = ["quick-service", "fast-casual", "full-service", "cafe", "bar"];
const brief = (over: Partial<OwnerBrief> = {}): OwnerBrief => ({ ...DEFAULT_BRIEF, ...over });
const site = makeSite({ findings: [finding("hood", "present")] });
const ctx = { site, brief: brief() };
const of = (l: Layout, type: string) => l.items.filter((i) => i.type === type);
const run = (l: Layout, ...ops: Op[]) => applyOps(l, ops, ctx);

describe("autoLayout", () => {
  it("sizes a rectangle from the listing SF when there is no scan of the suite", () => {
    const l = autoLayout(site, brief());
    expect(l.footprint.source).toBe("listing");
    expect(Math.abs(l.footprint.w * l.footprint.d - 1800 / 10.7639)).toBeLessThan(3);
    expect(l.footprint.w).toBeGreaterThan(l.footprint.d);
  });

  it.each(CONCEPTS)("gives a %s plan that is valid, in bounds and collision free", (concept) => {
    const l = autoLayout(site, brief({ concept }));
    expect(LayoutSchema.safeParse(l).success).toBe(true);
    const c = conflicts(l);
    expect([...c.overlapping, ...c.outside]).toEqual([]);
    expect(validate(l)).toEqual([]);
    expect(of(l, "restroom")).toHaveLength(1);
    expect(of(l, "kitchen-line")).toHaveLength(1);
  });

  it("meets the seat target without overshooting it", () => {
    const l = autoLayout(site, brief({ seats: 40 }));
    expect(seatCount(l)).toBeLessThanOrEqual(40);
    expect(seatCount(l)).toBeGreaterThanOrEqual(36);
  });

  it("keeps a full aisle between table rows and a chair gap inside a row", () => {
    const l = autoLayout(site, brief({ seats: 60 }));
    const tables = l.items.filter((i) => ["two-top", "four-top"].includes(i.type)).map(itemRect);
    for (let i = 0; i < tables.length; i++) for (let j = i + 1; j < tables.length; j++) expect(rectGap(tables[i], tables[j])).toBeGreaterThanOrEqual(0.45 - 1e-6);
  });

  it("gives a bar concept a bar counter with stools, and a cafe a counter", () => {
    const bar = autoLayout(site, brief({ concept: "bar" }));
    expect(of(bar, "bar-counter").length).toBeGreaterThan(0);
    expect(of(bar, "bar-stool").length).toBeGreaterThan(3);
    expect(of(autoLayout(site, brief({ concept: "cafe" })), "counter")).toHaveLength(1);
  });

  it("remembers where the existing hood is only when the site has one", () => {
    expect(autoLayout(site, brief()).kitchenAnchor).not.toBeNull();
    expect(autoLayout(makeSite(), brief()).kitchenAnchor).toBeNull();
  });

  it("lays out every demo site for every concept without leaving the floor", () => {
    for (const s of loadSites()) {
      for (const concept of CONCEPTS) {
        const l = autoLayout(s, brief({ concept, city: s.city }));
        const c = conflicts(l);
        expect([s.id, concept, ...c.overlapping, ...c.outside]).toEqual([s.id, concept]);
        expect(seatCount(l), `${s.id} ${concept} seats`).toBeGreaterThan(7);
        expect(l.footprint.source).toBe(s.matterport?.scanOfExactSuite && s.matterport.rooms.some((r) => r.polygon) ? "matterport" : "listing");
      }
    }
  }, 30_000);
});

describe("validate", () => {
  it("flags overlapping pieces", () => {
    const l = autoLayout(site, brief());
    const [a, b] = of(l, "four-top");
    b.x = a.x + 0.25;
    b.y = a.y;
    const w = validate(l).find((x) => x.kind === "collision");
    expect(w?.itemIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("flags a piece dragged outside the walls", () => {
    const l = autoLayout(site, brief());
    const t = of(l, "four-top")[0];
    t.x = -3;
    expect(validate(l).find((x) => x.kind === "out-of-bounds")?.itemIds).toEqual([t.id]);
  });

  it("flags a restroom walled in by tables", () => {
    const l = autoLayout(site, brief({ seats: 8 }));
    const wc = of(l, "restroom")[0];
    const box = itemRect(wc);
    l.items = l.items.filter((i) => i.type === "restroom" || i.type === "kitchen-line");
    let n = 0;
    // a solid wall of six-tops across the whole room in front of the restroom
    for (let y = 0.8; y < l.footprint.d; y += 1.6) l.items.push({ id: `w${n++}`, type: "six-top", x: box.x - 1.4, y, rotation: 0, w: 2.3, d: 1.6 });
    expect(validate(l).some((x) => x.kind === "blocked-egress" && x.itemIds.includes(wc.id))).toBe(true);
  });

  it("says when the plan has no restroom", () => {
    const l = autoLayout(site, brief());
    l.items = l.items.filter((i) => i.type !== "restroom");
    expect(validate(l).some((x) => x.kind === "missing" && /restroom/i.test(x.message))).toBe(true);
  });
});

describe("applyOps", () => {
  const base = autoLayout(site, brief({ seats: 30 }));

  it("does not mutate the layout it is given", () => {
    const before = JSON.stringify(base);
    run(base, { op: "add", type: "four-top", count: 2 });
    expect(JSON.stringify(base)).toBe(before);
  });

  it("adds tables in free spots", () => {
    const { layout } = run(base, { op: "add", type: "four-top", count: 3 });
    expect(seatCount(layout)).toBe(seatCount(base) + 12);
    expect(validate(layout).filter((w) => w.kind !== "blocked-egress")).toEqual([]);
  });

  it("reports what does not fit instead of stacking it", () => {
    const { layout, notes } = run(base, { op: "add", type: "six-top", count: 60 });
    expect(conflicts(layout).overlapping.size).toBe(0);
    expect(notes.join(" ")).toMatch(/Only \d+ of 60/);
  });

  it("removes the asked number of a type", () => {
    const { layout } = run(base, { op: "remove", type: "four-top", count: 2 });
    expect(of(layout, "four-top")).toHaveLength(of(base, "four-top").length - 2);
  });

  it("sets a seat target up and down", () => {
    expect(seatCount(run(base, { op: "setSeats", seats: 44 }).layout)).toBeGreaterThanOrEqual(42);
    expect(seatCount(run(base, { op: "setSeats", seats: 16 }).layout)).toBeLessThanOrEqual(17);
  });

  it("puts a bar along the window wall with stools at it", () => {
    const { layout } = run(base, { op: "add", type: "bar-counter", count: 1, near: "window" }, { op: "add", type: "bar-stool", count: 5, near: "bar-counter" });
    const bar = of(layout, "bar-counter")[0];
    expect(itemRect(bar).x).toBeLessThan(0.3); // front wall is the left wall
    expect(of(layout, "bar-stool")).toHaveLength(5);
    expect(conflicts(layout).overlapping.size).toBe(0);
  });

  it("moves the cook line to another wall and keeps it on the floor", () => {
    const { layout } = run(base, { op: "move", type: "kitchen-line", to: { wall: "top" } });
    const line = of(layout, "kitchen-line")[0];
    expect(itemRect(line).y).toBeLessThan(0.3);
    expect(itemInBounds(layout, line)).toBe(true);
  });

  it("clamps coordinates from outside the floor to a real free spot", () => {
    const id = of(base, "four-top")[0].id;
    const { layout } = run(base, { op: "move", itemId: id, to: { x: 9999, y: -50 } });
    const moved = layout.items.find((i) => i.id === id)!;
    expect(itemInBounds(layout, moved)).toBe(true);
    expect(conflicts(layout).overlapping.has(id)).toBe(false);
  });

  it("re-plans for a new concept", () => {
    const { layout } = run(base, { op: "setConcept", concept: "cafe" });
    expect(layout.concept).toBe("cafe");
    expect(of(layout, "counter")).toHaveLength(1);
    expect(layout.items.every((i) => !base.items.some((b) => b.id === i.id))).toBe(true);
  });

  it("grows the kitchen, moving stranded tables back into the dining room", () => {
    const full = autoLayout(site, brief({ seats: 60 }));
    const { layout } = run(full, { op: "resizeZone", zone: "kitchen", deltaM2: 20 });
    const k = (l: Layout) => l.zones.find((z) => z.kind === "kitchen")!;
    expect(k(layout).w * k(layout).d).toBeGreaterThan(k(full).w * k(full).d);
    expect(conflicts(layout).overlapping.size).toBe(0);
  });

  it("arranges tables along the walls keeping their ids", () => {
    const { layout } = run(base, { op: "arrange", zone: "dining", pattern: "wall" });
    expect(layout.items.map((i) => i.id).sort()).toEqual(base.items.map((i) => i.id).sort());
    expect(conflicts(layout).overlapping.size).toBe(0);
  });

  it("allows patio tables only in the strip outside the storefront", () => {
    const { layout } = run(base, { op: "add", type: "patio-table", count: 2 });
    const patio = of(layout, "patio-table");
    expect(patio).toHaveLength(2);
    expect(patio.every((p) => p.x < 0 && itemInBounds(layout, p))).toBe(true);
  });
});

describe("layout costs and impact", () => {
  const base = autoLayout(site, brief({ seats: 30 }));

  it("prices a bar counter by the metre", () => {
    const withBar = run(base, { op: "add", type: "bar-counter", count: 1, near: "back" }).layout;
    const line = layoutCosts(withBar).lines.find((l) => l.id === "bar-counter")!;
    expect(line.range.low).toBe(3 * 1300);
    expect(line.source).toMatch(/estimate/i);
  });

  it("charges a hood relocation only when the cook line leaves the existing hood", () => {
    expect(layoutCosts(base).lines.some((l) => l.id === "hood-relocation")).toBe(false);
    const moved = run(base, { op: "move", type: "kitchen-line", to: { wall: "front" } }).layout;
    expect(layoutCosts(moved).lines.map((l) => l.id)).toEqual(expect.arrayContaining(["hood-relocation", "kitchen-plumbing"]));
    expect(layoutCosts(moved).total.mid).toBeGreaterThan(layoutCosts(base).total.mid);
  });

  it("charges for a second restroom", () => {
    const two = run(base, { op: "add", type: "restroom", count: 1 }).layout;
    expect(layoutCosts(two).lines.find((l) => l.id === "extra-restroom")?.range.low).toBe(15000);
  });

  it("more seats lower the break-even turns and raise the build-out", () => {
    const small = layoutImpact(site, brief(), base);
    const big = layoutImpact(site, brief(), run(base, { op: "setSeats", seats: 50 }).layout);
    expect(big.seats).toBeGreaterThan(small.seats);
    expect(big.breakeven.turnsPerDay).toBeLessThan(small.breakeven.turnsPerDay);
    expect(big.total.mid).toBeGreaterThan(small.total.mid);
    expect(big.total.mid).toBeCloseTo(big.analysis.xray.total.mid + big.extras.total.mid, 6);
  });

  it("flags an over-budget plan against the owner's budget", () => {
    expect(layoutImpact(site, brief({ budgetUsd: 10_000 }), base).overBudget).toBe(true);
  });
});

describe("simulateDay", () => {
  const l = autoLayout(site, brief({ seats: 40 }));

  it("has one seat point per seat, all near their table", () => {
    expect(seatPoints(l)).toHaveLength(seatCount(l));
  });

  it("serves everyone when the room has slack", () => {
    const day = simulateDay(l, { covers: 60, concept: "fast-casual" });
    expect(day.served).toBe(60);
    expect(day.walked).toBe(0);
  });

  it("backs up and loses guests when break-even needs more than the room can turn", () => {
    const day = simulateDay(l, { covers: 900, concept: "full-service" });
    expect(day.walked).toBeGreaterThan(0);
    expect(day.peakQueue).toBeGreaterThan(5);
    expect(day.served + day.walked).toBe(900);
  });

  it("never seats two guests in one seat at the same time", () => {
    const day = simulateDay(l, { covers: 500, concept: "fast-casual" });
    const bySeat = new Map<number, [number, number][]>();
    for (const g of day.guests) if (g.seat >= 0) bySeat.set(g.seat, [...(bySeat.get(g.seat) ?? []), [g.seatAt, g.leaveAt]]);
    for (const spans of bySeat.values()) {
      spans.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
    }
  });
});

describe("parseInstruction (offline fallback)", () => {
  const l = autoLayout(site, brief({ seats: 30 }));
  it.each([
    ["add 10 more seats", [{ op: "setSeats", seats: seatCount(l) + 10 }]],
    ["make it a coffee bar", [{ op: "setConcept", concept: "cafe" }]],
    ["move the kitchen to the back", [{ op: "move", type: "kitchen-line", to: { wall: "back" } }]],
    ["add 2 booths", [{ op: "add", type: "booth", count: 2, near: undefined }]],
  ])("reads %j", (text, ops) => {
    expect(parseInstruction(text, l)).toEqual(ops);
  });

  it("reads a bar along the window as a counter plus stools", () => {
    const ops = parseInstruction("put a bar along the window", l)!;
    expect(ops[0]).toMatchObject({ op: "add", type: "bar-counter", near: "window" });
    expect(ops[1]).toMatchObject({ op: "add", type: "bar-stool" });
  });

  it("trades four-tops for two-tops", () => {
    const ops = parseInstruction("more two-tops, fewer four-tops", l)!;
    expect(ops.map((o) => o.op)).toEqual(["remove", "add"]);
  });

  it("returns null for what it cannot read", () => {
    expect(parseInstruction("make it feel like Lisbon at dusk", l)).toBeNull();
  });
});
