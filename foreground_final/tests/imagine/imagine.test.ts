import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF } from "@/lib/engine";
import { evaluate } from "@/lib/imagine/numbers";
import { offlinePlan } from "@/lib/imagine/planner";
import { ChangeSpecSchema, VersionRefSchema, type ImagineVersion } from "@/lib/imagine/types";
import { compareVersions, lineage, loadVersions, newVersionId, nextLabel, removeVersion, saveVersions, toRef } from "@/lib/imagine/versions";
import { editPrompt, loadSource } from "@/lib/imagine/visualizer";
import { autoLayout } from "@/lib/layout";
import { loadSite } from "@/lib/sites/load";

const site = loadSite("1018657")!;
const brief = { ...DEFAULT_BRIEF, city: site.city };
const layout = autoLayout(site, brief);
const views = [{ id: "v1", caption: "Main Dining Room" }];
const plan = (text: string) => offlinePlan(text, layout, views)!;

function version(id: string, label: string, parentId: string | null, text: string): ImagineVersion {
  const spec = plan(text);
  const e = evaluate({ site, brief, changes: spec.changes, layoutOps: spec.layoutOps });
  return {
    id,
    label,
    parentId,
    instruction: text,
    changeSpec: spec,
    layout: e.layout,
    assessment: e.assessment,
    checks: e.assessment.checks,
    costDelta: e.costDelta,
    numbers: e.numbers,
    images: [],
    imageError: null,
    qa: null,
    plannedBy: "offline",
    notes: [],
    createdAt: "2026-11-13T00:00:00Z",
  };
}

describe("offline planner", () => {
  it("a wall request becomes a wall change with the engineer flag", () => {
    const spec = plan("open the wall between the dining room and the back room");
    expect(spec.changes[0].kind).toBe("wall");
    expect(spec.structuralFlags[0]).toMatch(/structural engineer/i);
    expect(spec.viewPrompts[0].view).toBe("v1");
  });
  it("a bar along the window emits layout ops", () => {
    const spec = plan("add a bar along the window");
    expect(spec.changes[0].kind).toBe("layout");
    expect(spec.layoutOps[0]).toMatchObject({ op: "add", type: "bar-counter", near: "window" });
  });
  it("brick walls and concrete floors are two finish changes; a ceiling carries its height", () => {
    expect(plan("brick walls and concrete floors").changes.map((c) => c.kind)).toEqual(["finish", "finish"]);
    expect(plan("drop the ceiling to 10 ft").changes[0].quantities.heightFt).toBe(10);
  });
  it("make it a coffee shop is a use change to cafe, with nothing to draw", () => {
    const spec = plan("make it a coffee shop");
    expect(spec.changes[0]).toMatchObject({ kind: "use", concept: "cafe" });
    expect(spec.viewPrompts).toHaveLength(0);
  });
  it("returns null for what it cannot read, and the schema rejects junk", () => {
    expect(offlinePlan("what is the weather", layout, views)).toBeNull();
    expect(ChangeSpecSchema.safeParse({ changes: [{ id: "x", kind: "teleport", target: "", detail: "" }] }).success).toBe(false);
  });
});

describe("evaluate", () => {
  it("finishes add cost and weeks but leave break-even alone", () => {
    const spec = plan("brick walls and concrete floors");
    const e = evaluate({ site, brief, changes: spec.changes, layoutOps: spec.layoutOps });
    expect(e.costDelta.low).toBeCloseTo(e.assessment.cost.total.low, 5);
    expect(e.costDelta.low).toBeGreaterThan(0);
    expect(e.numbers.after.turnsPerDay).toBe(e.numbers.before.turnsPerDay);
    expect(e.numbers.after.monthsToOpen.high).toBeGreaterThan(e.numbers.before.monthsToOpen.high);
    expect(e.numbers.after.paybackYears!).toBeGreaterThan(e.numbers.before.paybackYears!);
  });
  it("a bar changes the plan, so plan costs move too", () => {
    const spec = plan("add a bar along the window");
    const e = evaluate({ site, brief, changes: spec.changes, layoutOps: spec.layoutOps });
    expect(e.layout.items.some((i) => i.type === "bar-counter")).toBe(true);
    expect(e.costDelta.mid).toBeGreaterThan(e.assessment.cost.total.mid);
    expect(e.assessment.checks.map((c) => c.id)).toEqual(expect.arrayContaining(["plumbing", "use", "egress"]));
  });
  it("switching every change off returns to the scan", () => {
    const spec = plan("add a bar along the window");
    const e = evaluate({ site, brief, changes: spec.changes.map((c) => ({ ...c, enabled: false })), layoutOps: spec.layoutOps });
    expect(e.costDelta).toEqual({ low: 0, mid: 0, high: 0 });
    expect(e.assessment.checks).toHaveLength(0);
  });
  it("a concept change re-plans and re-prices through the engine", () => {
    const spec = plan("make it a coffee shop");
    const e = evaluate({ site, brief, changes: spec.changes, layoutOps: spec.layoutOps });
    expect(e.numbers.after.concept).toBe("cafe");
    expect(e.numbers.after.salesNeededUsd).toBe(e.numbers.before.salesNeededUsd);
    expect(e.numbers.after.coversPerDay).not.toBe(e.numbers.before.coversPerDay);
  });
});

describe("versions", () => {
  const A = version("vaaaaaa1", "A", null, "brick walls and concrete floors");
  const A1 = version("vaaaaaa2", "A1", "vaaaaaa1", "open the wall to the back room");
  const A2 = version("vaaaaaa3", "A2", "vaaaaaa2", "drop the ceiling to 10 ft");
  const all = [A, A1, A2];

  it("labels continue a line and branch to a new letter", () => {
    expect(nextLabel([], null)).toBe("A");
    expect(nextLabel([A], A.id)).toBe("A1");
    expect(nextLabel([A, A1], A1.id)).toBe("A2");
    expect(nextLabel(all, A1.id)).toBe("B");
    expect(nextLabel(all, null)).toBe("B");
  });
  it("lineage runs root first, and undo removes a version with its descendants", () => {
    expect(lineage(all, A2.id).map((v) => v.label)).toEqual(["A", "A1", "A2"]);
    const r = removeVersion(all, A1.id);
    expect(r.versions.map((v) => v.label)).toEqual(["A"]);
    expect(r.current).toBe(A.id);
  });
  it("compares two versions, or one against the scan", () => {
    expect(compareVersions(null, A).cost).toEqual(A.costDelta);
    const d = compareVersions(A, A1);
    expect(d.checksAdded).toContain("wall");
    expect(d.cost.mid).toBeCloseTo(A1.costDelta.mid - A.costDelta.mid, 5);
  });
  it("round-trips through storage and ignores junk", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveVersions(store, site.id, all);
    expect(loadVersions(store, site.id).map((v) => v.label)).toEqual(["A", "A1", "A2"]);
    mem.set("foreground.imagine.v1.x", "{not json");
    expect(loadVersions(store, "x")).toEqual([]);
    mem.set("foreground.imagine.v1.y", JSON.stringify([{ id: 1 }, null]));
    expect(loadVersions(store, "y")).toEqual([]);
  });
  it("ids and refs pass the server schema; foreign image paths do not", () => {
    const id = newVersionId();
    expect(id).toMatch(/^v[a-z0-9]{6,16}$/);
    const ref = toRef({ ...A, id, images: [{ view: "v1", caption: "", scanned: null, empty: null, imagined: `/imagine/${site.id}/${id}-1.png`, prompt: "" }] });
    expect(VersionRefSchema.safeParse(ref).success).toBe(true);
    expect(VersionRefSchema.safeParse({ ...ref, images: [{ view: "v1", imagined: "/imagine/../../.env.local" }] }).success).toBe(false);
  });
});

describe("visualizer guards", () => {
  it("only reads images from the site's own folders", async () => {
    expect(await loadSource(site.id, "/sites/1018657/../../../.env.local")).toBeNull();
    expect(await loadSource(site.id, "/sites/20219730/aerial.jpg")).toBeNull();
    expect(await loadSource(site.id, "/sites/1018657/package.json")).toBeNull();
    const ok = await loadSource(site.id, site.matterport!.beforeAfter[0].after!);
    expect(ok?.mime).toBe("image/jpeg");
  });
  it("accepts a small data URL and refuses an oversized one", async () => {
    expect(await loadSource(site.id, "data:image/png;base64,AAAA")).toEqual({ mime: "image/png", data: "AAAA" });
    expect(await loadSource(site.id, `data:image/png;base64,${"A".repeat(5_700_000)}`)).toBeNull();
  });
  it("the edit prompt pins camera, perspective, lighting and unchanged regions", () => {
    const p = editPrompt("exposed brick on the back wall", "the back wall");
    for (const word of ["camera", "perspective", "lighting", "outside the changed region", "the back wall"]) expect(p).toContain(word);
  });
});
