import { describe, expect, it } from "vitest";
import { footprint, kindCounts, scanObjectsForFloor, sweepDelay, type ScanPiece } from "../scan-clear";

const piece = (id: string, x: number, y: number, room = "Main", extra: Partial<ScanPiece> = {}): ScanPiece => ({ id, kind: "table", centre: [x, y, 0], size: [1, 0.5], yaw_deg: 0, room, on_floor: true, ...extra });

describe("scanObjectsForFloor", () => {
  it("returns null with nothing usable", () => {
    expect(scanObjectsForFloor(null, { width: 10, depth: 8 })).toBeNull();
    expect(scanObjectsForFloor([piece("a", 0, 0, "Main", { on_floor: false })], { width: 10, depth: 8 })).toBeNull();
  });
  it("picks the room with most objects and keeps real size and position when it fits", () => {
    const v = scanObjectsForFloor([piece("a", 0, 0), piece("b", 3, 2), piece("c", 50, 50, "Other")], { width: 10, depth: 8 })!;
    expect(v.room).toBe("Main");
    expect(v.objects.map((o) => o.id)).toEqual(["a", "b"]);
    expect(v.objects[0].w).toBe(1);
    expect(v.objects[0].x).toBeCloseTo(0.3 + 0.5);
    expect(v.omitted).toBe(1);
  });
  it("takes the floor-sized window holding the most objects when the room is bigger than the floor", () => {
    const far = [piece("a", 0, 0), piece("b", 40, 20), piece("c", 41, 20.5), piece("d", 42, 21)];
    const v = scanObjectsForFloor(far, { width: 10, depth: 8 })!;
    expect(v.objects.map((o) => o.id).sort()).toEqual(["b", "c", "d"]);
    for (const o of v.objects) { expect(o.x).toBeGreaterThan(0); expect(o.x).toBeLessThan(10); expect(o.y).toBeLessThan(8); }
    expect(v.omitted).toBe(1);
  });
});

describe("helpers", () => {
  it("counts kinds most common first", () => {
    expect(kindCounts([{ kind: "chair" }, { kind: "table" }, { kind: "chair" }])).toEqual([["chair", 2], ["table", 1]]);
  });
  it("rotates footprints about the centre", () => {
    const pts = footprint({ x: 1, y: 1, w: 2, d: 1, yawDeg: 90 });
    expect(pts[0][0]).toBeCloseTo(1.5); expect(pts[0][1]).toBeCloseTo(0);
  });
  it("sweeps left to right", () => {
    expect(sweepDelay(0, 10)).toBe(0);
    expect(sweepDelay(10, 10)).toBeCloseTo(1.6);
    expect(sweepDelay(99, 10)).toBeCloseTo(1.6);
  });
});
