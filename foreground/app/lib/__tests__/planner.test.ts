import { describe, expect, it } from "vitest";
import { checkLayout } from "../asset-layout";
import { rectFootprint, type Asset } from "../assets";
import { autoLayout, buildVisitors, findSpot, reconcile, route, rotated, sameKit, seatsOf, snapPosition, toPlacements, visitorAt } from "../planner";

const mk = (assetId: string, category: Asset["category"], w: number, d: number, front = 0.6, sides = 0.1): Asset =>
  ({ assetId, name: assetId, category, footprint: rectFootprint(w, d), dims: { w, d, h: 1 }, clearance: { front, sides, back: 0.1 } }) as unknown as Asset;
const espresso = mk("espresso_machine_2group", "other", 0.76, 0.56, 0.9);
const table = mk("table_2top_30", "table", 0.76, 0.76, 0.6, 0.3);
const table4 = mk("table_4top_30x48", "table", 1.22, 0.76, 0.6, 0.3);
const chair = mk("chair_dining", "seating", 0.46, 0.51, 0.45);
const floor = { width: 11, depth: 7.5 };

describe("planner geometry", () => {
  it("snaps to the grid and then to a wall", () => {
    expect(snapPosition(floor, table, 0, 3.04, 2.97, [])).toEqual([3, 3]);
    expect(snapPosition(floor, table, 0, 0.17, 2, [])[0]).toBe(0);
    expect(snapPosition(floor, table, 0, 10.1, 2, [])[0]).toBeCloseTo(11 - 0.76);
  });
  it("rotates about the centre", () => {
    const r = rotated({ id: "a", asset: espresso, rot: 0, x: 1, y: 1 });
    expect(r.rot).toBe(90);
    expect(r.x + 0.56 / 2).toBeCloseTo(1 + 0.76 / 2);
  });
  it("counts seats and compares kits by asset id", () => {
    expect(seatsOf(chair)).toBe(1);
    expect(seatsOf(table)).toBe(0);
    expect(sameKit([chair, table], [table, chair])).toBe(true);
    expect(sameKit([chair], [chair, chair])).toBe(false);
  });
  it("arranges a kit with no overlaps, inside the floor, and no spurious chair-at-table clearance problems", () => {
    const kit = [espresso, table, table, table4, ...Array(8).fill(chair)];
    const placed = autoLayout(floor, kit);
    expect(placed).toHaveLength(kit.length);
    expect(checkLayout(floor, toPlacements(placed))).toEqual([]);
  });
  it("finds a free spot, and none on a full floor", () => {
    const small = { width: 1, depth: 1 };
    const full = [{ id: "a", asset: table, rot: 0 as const, x: 0.1, y: 0.1 }];
    expect(findSpot(floor, [], table)).not.toBeNull();
    expect(findSpot(small, full, table)).toBeNull();
  });
  it("reconciles to the kit by adding and dropping pieces", () => {
    const placed = autoLayout(floor, [table, chair]);
    expect(sameKit(reconcile(floor, placed, [table, chair, chair]).map((p) => p.asset), [table, chair, chair])).toBe(true);
    expect(sameKit(reconcile(floor, placed, [chair]).map((p) => p.asset), [chair])).toBe(true);
  });
  it("routes around a wall of furniture", () => {
    const wall = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, asset: mk("w", "other", 1, 0.5), rot: 0 as const, x: 2 + i, y: 3 }));
    const r = route(floor, toPlacements(wall), [1, 1], [10, 6]);
    expect(r.length).toBeGreaterThan(2);
    for (let i = 1; i < r.length; i++) {
      const [a, b] = [r[i - 1], r[i]];
      for (let s = 0; s <= 20; s++) {
        const x = a[0] + ((b[0] - a[0]) * s) / 20;
        const y = a[1] + ((b[1] - a[1]) * s) / 20;
        expect(x > 2 && x < 8 && y > 3 && y < 3.5).toBe(false);
      }
    }
  });
  it("visitors enter from outside, stay on the loop and come back", () => {
    const placed = autoLayout(floor, [espresso, table, chair, chair]);
    const vs = buildVisitors(floor, placed, 2);
    expect(vs).toHaveLength(2);
    const first = visitorAt(vs[0], vs[0].offset);
    expect(first.p[1]).toBeGreaterThan(floor.depth);
    expect(visitorAt(vs[0], vs[0].offset + vs[0].total).p[1]).toBeCloseTo(first.p[1]);
  });
});
