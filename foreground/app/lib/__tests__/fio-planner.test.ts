import { describe, expect, it } from "vitest";
import { rectFootprint, type Asset } from "../assets";
import { runFioCommand } from "../fio-planner";
import type { PlacedPiece } from "../planner";

const mk = (assetId: string, name: string, category: Asset["category"], w: number, d: number) =>
  ({ assetId, name, category, footprint: rectFootprint(w, d), dims: { w, d, h: 1 }, clearance: { front: 0.3, sides: 0.1, back: 0.1 } }) as unknown as Asset;
const assets = [
  mk("table_2top_30", "Two-top table", "table", 0.76, 0.76), mk("chair_dining", "Dining chair", "seating", 0.46, 0.5),
  mk("bar_counter_run_120", "Bar counter run", "counter", 3, 0.6), mk("bar_stool", "Bar stool", "seating", 0.4, 0.4),
  mk("espresso_machine_2group", "Espresso machine 2-group", "counter", 0.8, 0.6),
];
const floor = { width: 11, depth: 7.5 };
const run = (t: string, placed: PlacedPiece[] = []) => runFioCommand(t, floor, placed, assets);

describe("fio planner commands", () => {
  it("adds, describes, moves, rotates, removes, clears", () => {
    let p = run("add 3 two-tops along the windows").placed;
    expect(p.filter((x) => x.asset.assetId === "table_2top_30")).toHaveLength(3);
    p = run("add an espresso machine", p).placed;
    expect(run("what is in this room?", p).note).toMatch(/3 Two-top table/);
    const m = run("move the espresso machine to the back wall", p);
    expect(m.changed).toBe(true);
    expect(m.placed.find((x) => x.asset.assetId.startsWith("espresso"))!.y).toBeLessThan(0.5);
    const r = run("rotate the espresso machine", m.placed);
    expect(r.placed.find((x) => x.asset.assetId.startsWith("espresso"))!.rot).not.toBe(m.placed.find((x) => x.asset.assetId.startsWith("espresso"))!.rot);
    const rm = run("remove 2 chairs", p);
    expect(rm.placed.filter((x) => x.asset.assetId === "chair_dining").length).toBe(p.filter((x) => x.asset.assetId === "chair_dining").length - 2);
    expect(run("clear the room", p).placed).toEqual([]);
    expect(run("rotate the counter", run("add a bar").placed).changed).toBe(true);
    expect(run("undo", p).undo).toBe(true);
  });
  it("puts a bar by the door and says so when it cannot", () => {
    const b = run("put a bar by the door").placed[0];
    expect(b.asset.assetId).toBe("bar_counter_run_120");
    expect(run("remove the sofa", []).changed).toBe(false);
    expect(run("remove the sofa", []).note).toMatch(/do not see/);
  });
});
