import { describe, expect, it } from "vitest";
import { matchPieces, parseCommand, resolveAdd } from "../../../../modeling/fio_commands.js";

const catalog = [
  { id: "round_wooden_table_02", name: "Round Wooden Table 02", category: "Tables", size_m: [0.8, 0.8, 0.75] },
  { id: "dining_table", name: "Dining Table", category: "Tables", size_m: [2.26, 1.39, 0.88] },
  { id: "dining_chair_02", name: "Dining Chair 02", category: "Chairs", size_m: [0.43, 0.58, 0.97] },
  { id: "metal_stool_01", name: "Metal Stool 01", category: "Chairs", size_m: [0.35, 0.35, 0.88] },
  { id: "modern_wooden_cabinet", name: "Modern Wooden Cabinet", category: "Storage", size_m: [2.44, 0.52, 0.68] },
  { id: "sofa_02", name: "Sofa 02", category: "Sofas", size_m: [1.8, 0.8, 0.7] },
];

describe("walk Fio command parser", () => {
  it("reads the scene commands", () => {
    expect(parseCommand("clear the room")).toEqual({ op: "clear" });
    expect(parseCommand("Remove everything")).toEqual({ op: "clear" });
    expect(parseCommand("remove the sofa")).toMatchObject({ op: "remove", what: "the sofa" });
    expect(parseCommand("remove 2 chairs")).toMatchObject({ op: "remove", count: 2 });
    expect(parseCommand("move the espresso machine to the back wall")).toMatchObject({ op: "move", what: "the espresso machine", wall: "ahead" });
    expect(parseCommand("add 6 two-tops along the windows")).toMatchObject({ op: "add", count: 6, what: "two-tops", wall: "windows" });
    expect(parseCommand("rotate the counter")).toMatchObject({ op: "rotate", what: "the counter", degrees: 90 });
    expect(parseCommand("put a bar by the door")).toMatchObject({ op: "add", what: "bar", wall: "door" });
    expect(parseCommand("what is in this room?")).toMatchObject({ op: "describe" });
    expect(parseCommand("undo")).toEqual({ op: "undo" });
    expect(parseCommand("move the table left 2 m")).toMatchObject({ op: "nudge", dir: "left", metres: 2 });
  });
  it("leaves property questions to the answerer", () => {
    for (const q of ["What will it cost to open?", "How many seats could it hold?", "Any structure or flood hazards?", "What should I do next?", "Does this fit Sarah's brief?"]) expect(parseCommand(q)).toBeNull();
  });
  it("resolves what to add and which piece is meant", () => {
    expect(resolveAdd("two-tops", catalog)!.group.map((g: { id: string }) => g.id)).toEqual(["round_wooden_table_02", "dining_chair_02", "dining_chair_02"]);
    expect(resolveAdd("bar", catalog)!.group[0].id).toBe("modern_wooden_cabinet");
    expect(resolveAdd("espresso machine", catalog)).toBeNull();
    const items = [{ id: "1", label: "Chair", kind: "chair" }, { id: "2", label: "Dresser 1", kind: "dresser" }];
    expect(matchPieces("the chairs", items)).toEqual({ ids: ["1"], approx: false });
    expect(matchPieces("the counter", items)).toEqual({ ids: ["2"], approx: true });
    expect(matchPieces("the sofa", items).ids).toEqual([]);
  });
});
