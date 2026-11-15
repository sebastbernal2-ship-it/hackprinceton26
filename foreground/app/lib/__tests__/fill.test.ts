import { describe, expect, it } from "vitest";
import { rectFootprint, type Asset } from "../assets";
import { simulateRush } from "../fill-sim";
import { applyInstruction, parseInstruction } from "../place-text";

const mk = (assetId: string, category: Asset["category"], w: number, d: number) =>
  ({ assetId, name: assetId, category, footprint: rectFootprint(w, d), dims: { w, d, h: 1 }, clearance: { front: 0.3, sides: 0.1, back: 0.1 } }) as unknown as Asset;
const assets = [mk("table_2top_30", "table", 0.76, 0.76), mk("chair_dining", "seating", 0.46, 0.5), mk("bar_counter_run_120", "counter", 3, 0.6), mk("bar_stool", "seating", 0.4, 0.4)];
const floor = { width: 11, depth: 7.5 };

describe("will it fill", () => {
  it("is deterministic and walks guests when seats are short", () => {
    expect(simulateRush({ seats: 4, peakPerHour: 60 })).toEqual(simulateRush({ seats: 4, peakPerHour: 60 }));
    expect(simulateRush({ seats: 4, peakPerHour: 60 }).walked).toBeGreaterThan(0);
    expect(simulateRush({ seats: 80, peakPerHour: 30 }).walked).toBe(0);
    expect(simulateRush({ seats: 0, peakPerHour: 30 }).served).toBe(0);
  });
  it("parses instructions", () => {
    expect(parseInstruction("6 two-tops")?.add[0].count).toBe(6);
    expect(parseInstruction("add a bar along the windows")?.add[0].wall).toBe("front");
    expect(parseInstruction("remove 2 stools")?.remove[0].count).toBe(2);
    expect(parseInstruction("make it blue")).toBeNull();
  });
  it("places tables with chairs and a bar on the front wall", () => {
    const r = applyInstruction("3 two-tops", floor, [], assets);
    expect(r.placed.filter((p) => p.asset.assetId === "table_2top_30")).toHaveLength(3);
    expect(r.placed.filter((p) => p.asset.assetId === "chair_dining")).toHaveLength(6);
    const b = applyInstruction("add a bar along the windows", floor, [], assets).placed.find((p) => p.asset.assetId === "bar_counter_run_120")!;
    expect(b.y).toBeGreaterThan(floor.depth - 1);
  });
});
