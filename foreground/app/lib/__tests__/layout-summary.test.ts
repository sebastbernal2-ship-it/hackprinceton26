import { describe, expect, it } from "vitest";
import { isWalkLayout, summarizeLayout, type WalkLayout } from "../layout-summary";

const layout: WalkLayout = {
  type: "walk-layout",
  model: "w2JcUVybv9c",
  scanned: [
    { kind: "chair", label: "Chair 1", deleted: false, moved: false },
    { kind: "chair", label: "Chair 2", deleted: true, moved: false },
    { kind: "stool", label: "Stool 1", deleted: false, moved: true },
    { kind: "table", label: "Table 1", deleted: false, moved: false },
    { kind: "sofa", label: "Sofa 1", deleted: false, moved: false },
  ],
  added: [
    { catalogId: "Chair_A", name: "Chair A", category: "Chairs" },
    { catalogId: "Arm_A", name: "Armchair A", category: "Armchairs" },
    { catalogId: "Table_A", name: "Table A", category: "Tables" },
  ],
  pendingAdded: 0,
};

describe("layout summary", () => {
  it("accepts only walk-layout messages", () => {
    expect(isWalkLayout(layout)).toBe(true);
    expect(isWalkLayout({ type: "other" })).toBe(false);
    expect(isWalkLayout(null)).toBe(false);
  });

  it("counts kept, removed, moved and added pieces per kind", () => {
    const s = summarizeLayout(layout);
    const chair = s.rows.find((r) => r.kind === "chair")!;
    expect(chair).toMatchObject({ kept: 1, removed: 1, added: 1 });
    expect(s.removedTotal).toBe(1);
    expect(s.movedTotal).toBe(1);
  });

  it("seats are chairs + stools + armchairs left in the layout; sofas are reported, not guessed", () => {
    const s = summarizeLayout(layout);
    expect(s.seats).toBe(4); // chair kept + chair added + stool + armchair added
    expect(s.sofasNotCounted).toBe(1);
  });
});
