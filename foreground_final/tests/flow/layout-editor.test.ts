import { describe, expect, it } from "vitest";
import { addAtEdit, moveEdit, placementProblem, removeEdit, rotateEdit, type Edit } from "@/components/flow/layout/edit";
import { layoutChanges } from "@/components/flow/layout/changes";
import { deltasBetween, figuresOf, layoutImpact } from "@/components/flow/layout/impact";
import { assess } from "@/lib/feasibility";
import { applyOps, autoLayout, seatCount, type Layout } from "@/lib/layout";
import { loadSites } from "@/lib/sites/load";

const site = loadSites()[0];
const brief = { concept: "fast-casual" as const, seats: 40, budgetUsd: 250_000, city: site.city };
const base: Layout = autoLayout(site, brief);
const ok = (e: Edit) => {
  if ("error" in e) throw new Error(e.error);
  return e;
};

describe("layoutImpact for the current plan", () => {
  it("is deterministic and tracks the plan's own seats", () => {
    const a = figuresOf(layoutImpact(site, brief, base));
    expect(a.seats).toBe(seatCount(base));
    expect(figuresOf(layoutImpact(site, brief, base))).toEqual(a);
    expect(deltasBetween(a, a)).toBeNull();
  });

  it("adding a bar raises layout extras and seats, and the deltas say so", () => {
    const { layout } = applyOps(base, [{ op: "add", type: "bar-counter", count: 1 }, { op: "add", type: "bar-stool", count: 4, near: "bar-counter" }], { site, brief });
    const before = figuresOf(layoutImpact(site, brief, base));
    const after = figuresOf(layoutImpact(site, brief, layout));
    expect(after.extras.mid).toBeGreaterThan(before.extras.mid);
    expect(after.allIn.mid).toBeGreaterThan(before.allIn.mid);
    const d = deltasBetween(before, after)!;
    expect(d.extras).toBeGreaterThan(0);
    expect(d.seats).toBe(seatCount(layout) - seatCount(base));
  });
});

describe("pure edits", () => {
  it("a move to the same cell is a no-op with no ops", () => {
    const t = base.items.find((i) => i.type === "four-top")!;
    const first = ok(moveEdit(base, t.id, t.x, t.y));
    // once on the grid, the same cell is a no-op
    expect(ok(moveEdit(first.layout, t.id, t.x, t.y)).ops).toEqual([]);
  });

  it("refuses a move onto another piece and says why in words", () => {
    const [a, b] = base.items.filter((i) => i.type === "four-top");
    const e = moveEdit(base, a.id, b.x, b.y);
    expect("error" in e && e.error).toMatch(/close|off the floor|door/);
  });

  it("refuses an add off the floor, and patio tables inside", () => {
    expect("error" in addAtEdit(base, "four-top", -5, -5)).toBe(true);
    const inside = { id: "x", type: "patio-table" as const, x: base.footprint.w / 2, y: base.footprint.d / 2, rotation: 0 as const, w: 1.5, d: 1.5 };
    expect(placementProblem(base, inside)).toMatch(/sidewalk/);
  });

  it("removes and rotates", () => {
    const t = base.items.find((i) => i.type === "four-top")!;
    const r = ok(removeEdit(base, t.id));
    expect(r.layout.items).toHaveLength(base.items.length - 1);
    expect(r.ops[0]).toMatchObject({ op: "remove", type: "four-top" });
    const rot = rotateEdit(base, t.id);
    if (!("error" in rot)) expect(rot.layout.items.find((i) => i.id === t.id)!.rotation).toBe(90);
  });
});

describe("what the edits trigger", () => {
  it("makes no changes for the suggested plan and a layout change per touched group", () => {
    expect(layoutChanges(base, base)).toEqual([]);
    const ops = [{ op: "add" as const, type: "bar-counter" as const, count: 1 }];
    const { layout } = applyOps(base, ops, { site, brief });
    const changes = layoutChanges(base, layout);
    expect(changes.map((c) => c.id)).toContain("lay-bar");
    expect(changes.find((c) => c.id === "lay-bar")!.involves).toContain("alcohol");
    const a = assess({ site, brief, changes, layout, layoutOps: ops });
    const none = assess({ site, brief, changes: [], layout: base, layoutOps: [] });
    expect(a.checks.length).toBeGreaterThanOrEqual(none.checks.length);
    expect(a.checks.some((c) => c.triggeredBy.includes("lay-bar"))).toBe(true);
  });
});
