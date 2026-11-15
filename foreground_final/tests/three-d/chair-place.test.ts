import { describe, expect, it } from "vitest";
import { ITEM_SPECS } from "@/lib/layout";
import { CHAIR, chairCount, chairSlots, tableSize } from "@/lib/three-d/chair-place";

describe("chair placement", () => {
  it("seats each table as the layout counts its seats; stools, booths and non-seating pieces get none", () => {
    for (const t of ["two-top", "four-top", "six-top", "patio-table"] as const) expect(chairSlots(t, ITEM_SPECS[t].w, ITEM_SPECS[t].d)).toHaveLength(ITEM_SPECS[t].seats);
    for (const t of ["booth", "bar-stool", "bar-counter", "prep", "host"] as const) expect(chairCount(t)).toBe(0);
  });

  it("puts a two-top's chairs at the two ends of its long axis, facing each other", () => {
    const s = chairSlots("two-top", 0.8, 1.6);
    expect(s.map((c) => Math.round(c.x * 100))).toEqual([0, 0]);
    expect(Math.sign(s[0].z)).toBe(-Math.sign(s[1].z));
    // facing the centre: a chair at +z looks toward -z (yaw pi)
    const plus = s.find((c) => c.z > 0)!;
    expect(Math.abs(Math.abs(plus.yaw) - Math.PI)).toBeLessThan(1e-9);
  });

  it("puts a four-top's chairs one to a side and a six-top's two along each long side", () => {
    const four = chairSlots("four-top", 1.5, 1.5);
    expect(new Set(four.map((c) => `${Math.round(c.x * 10)},${Math.round(c.z * 10)}`)).size).toBe(4);
    const six = chairSlots("six-top", 2.3, 1.6);
    expect(six.filter((c) => Math.abs(c.z) > Math.abs(c.x) && Math.abs(c.z) > 0.3)).toHaveLength(4);
    expect(six.filter((c) => Math.abs(c.x) > 0.7 && Math.abs(c.z) < 1e-9)).toHaveLength(2);
  });

  it("keeps every chair inside the item's plan footprint, clear of the table's middle, and facing it", () => {
    for (const t of ["two-top", "four-top", "six-top", "patio-table"] as const) {
      const { w, d } = ITEM_SPECS[t];
      const tab = tableSize(t, w, d);
      for (const c of chairSlots(t, w, d)) {
        expect(Math.abs(c.x) + CHAIR.seat / 2).toBeLessThanOrEqual(w / 2 + 0.2);
        expect(Math.abs(c.z) + CHAIR.seat / 2).toBeLessThanOrEqual(d / 2 + 0.2);
        // outside the table top or on its edge, so a chair never sits in the middle of the table
        expect(Math.abs(c.x) >= tab.w / 2 - CHAIR.tuck - 1e-9 || Math.abs(c.z) >= tab.d / 2 - CHAIR.tuck - 1e-9).toBe(true);
        // front of the chair (local +z rotated by yaw) points at the centre
        const f = [Math.sin(c.yaw), Math.cos(c.yaw)];
        expect(f[0] * -c.x + f[1] * -c.z).toBeGreaterThan(0);
      }
    }
  });

  it("scales with a resized table and honors an explicit seat count", () => {
    expect(chairSlots("six-top", 3, 1.6, 8)).toHaveLength(8);
    const a = chairSlots("four-top", 1.5, 1.5)[0];
    const b = chairSlots("four-top", 2.5, 2.5)[0];
    expect(Math.abs(b.x) + Math.abs(b.z)).toBeGreaterThan(Math.abs(a.x) + Math.abs(a.z));
  });
});
