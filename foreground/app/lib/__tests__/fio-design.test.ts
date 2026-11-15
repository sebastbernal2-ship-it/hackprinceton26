import { describe, expect, it } from "vitest";
import { designPlan, pickKit } from "../../../../modeling/fio_design.js";
import { parseCommand } from "../../../../modeling/fio_commands.js";

const catalog = [
  { id: "round_wooden_table_02", name: "Round Table", category: "Tables", size_m: [0.9, 0.9, 0.7] },
  { id: "dining_chair_02", name: "Dining Chair", category: "Chairs", size_m: [0.45, 0.5, 0.9] },
];
describe("fio_design", () => {
  it("picks a table and chair and lays out two-tops inside the floor", () => {
    expect(pickKit(catalog).table?.id).toBe("round_wooden_table_02");
    const r = designPlan({ bounds: { x0: 0, y0: 0, x1: 8, y1: 6 }, catalog, seats: 8 });
    expect(r.seats).toBe(8);
    expect(r.pieces.every((p: { x: number; y: number }) => p.x > 0 && p.x < 8 && p.y > 0 && p.y < 6)).toBe(true);
  });
  it("reads design my place", () => { expect(parseCommand("design my place")).toEqual({ op: "design" }); });
});
