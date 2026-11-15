import { describe, expect, it } from "vitest";
import { parseBriefRegex } from "@/lib/agent/brief";
import { BRIGHT_CHAPTERS, CHAPTERS, NEXT_PILL, chapterForKey } from "@/components/flow/chapter-model";
import { buildExamples, walkSuggestion } from "@/components/flow/examples";
import { createFlowState, flowReducer, HISTORY_LIMIT, lastOfKind, type FlowState } from "@/components/flow/flow-reducer";
import { memoHref } from "@/components/flow/outlook-data";
import { buildNoFitText } from "@/components/flow/search-map";
import { autoLayout } from "@/lib/layout";
import { loadSite } from "@/lib/sites/load";

describe("chapter model", () => {
  it("has six chapters and the next-step pill always leads to the following one", () => {
    expect(CHAPTERS).toHaveLength(6);
    CHAPTERS.forEach((c, i) => {
      const pill = NEXT_PILL[c];
      if (i === CHAPTERS.length - 1) expect(pill).toBeNull();
      else expect(pill?.to).toBe(CHAPTERS[i + 1]);
    });
    expect([...BRIGHT_CHAPTERS].sort()).toEqual(["room", "walk"]);
  });

  it("maps keys 1-6 and the bracket keys, and clamps at the ends", () => {
    expect(chapterForKey("1", "deal")).toBe("overview");
    expect(chapterForKey("6", "overview")).toBe("deal");
    expect(chapterForKey("]", "walk")).toBe("layout");
    expect(chapterForKey("[", "walk")).toBe("overview");
    expect(chapterForKey("[", "overview")).toBe("overview");
    expect(chapterForKey("]", "deal")).toBe("deal");
    expect(chapterForKey("7", "walk")).toBeNull();
    expect(chapterForKey("a", "walk")).toBeNull();
  });
});

const spaces = [{ siteId: "1018657", photo: "/a.jpg", address: "1 Main St" }];

function picked(): FlowState {
  let s = createFlowState({ spaces });
  s = flowReducer(s, { type: "send", text: "taqueria, 40 seats, $150k budget, Houston", parsed: parseBriefRegex("taqueria, 40 seats, $150k budget, Houston"), at: 1 });
  s = flowReducer(s, {
    type: "append",
    at: 2,
    message: { kind: "pickCards", intro: "x", picks: [{ siteId: "1018657", rank: 1, photo: "/a.jpg", address: "1 Main St", city: "Houston", sf: 1500, allInUsd: { low: 1, high: 2 }, reason: "r", hasScan: true }] },
  });
  return flowReducer(s, { type: "pick", siteId: "1018657" });
}

describe("chapters in the reducer", () => {
  it("opens on Overview when a space is chosen, with one divider row", () => {
    const s = picked();
    expect(s.phase).toBe("walk");
    expect(s.chapter).toBe("overview");
    expect(s.visited).toEqual(["overview"]);
    expect(lastOfKind(s, "chapterDivider")?.chapter).toBe("overview");
  });

  it("moves between chapters, marks them visited, never clears the thread, and ignores a repeat", () => {
    let s = picked();
    const before = s.messages.length;
    s = flowReducer(s, { type: "chapter", chapter: "walk", at: 10 });
    expect(s.chapter).toBe("walk");
    expect(s.visited).toEqual(["overview", "walk"]);
    expect(s.messages).toHaveLength(before);
    expect(flowReducer(s, { type: "chapter", chapter: "walk", at: 11 })).toBe(s);
    s = flowReducer(s, { type: "chapter", chapter: "overview", at: 12 });
    expect(s.visited).toEqual(["overview", "walk"]);
    // hopping through chapters with nothing said in between leaves one divider, not a stack of empty ones
    expect(s.messages.filter((m) => m.kind === "chapterDivider")).toHaveLength(1);
    expect(s.messages.at(-1)).toMatchObject({ kind: "chapterDivider", chapter: "overview" });
    s = flowReducer(s, { type: "append", message: { kind: "assistantText", text: "hello", streaming: false }, at: 13 });
    s = flowReducer(s, { type: "chapter", chapter: "walk", at: 14 });
    expect(s.messages.filter((m) => m.kind === "chapterDivider")).toHaveLength(2);
  });

  it("clears the chapter, plan and history when the owner goes back to the picks", () => {
    const site = loadSite("1018657")!;
    const layout = autoLayout(site, { concept: "fast-casual", seats: 40, city: site.city });
    let s = flowReducer(picked(), { type: "layoutReady", layout });
    s = flowReducer(s, { type: "chapter", chapter: "numbers", at: 5 });
    s = flowReducer(s, { type: "back" });
    expect(s).toMatchObject({ phase: "pick", chapter: "overview", visited: [], layout: null, past: [], future: [] });
    expect(s.messages.some((m) => m.kind === "chapterDivider")).toBe(false);
  });
});

describe("the owner's plan and its history", () => {
  const site = loadSite("1018657")!;
  const base = autoLayout(site, { concept: "fast-casual", seats: 40, city: site.city });
  const edited = (n: number) => ({ ...base, items: base.items.slice(0, Math.max(1, base.items.length - n)) });

  it("starts from the suggested plan with no history", () => {
    const s = flowReducer(picked(), { type: "layoutReady", layout: base });
    expect(s.layout).toBe(base);
    expect(s.past).toEqual([]);
  });

  it("commits, undoes and redoes, and a new edit drops the redo branch", () => {
    let s = flowReducer(picked(), { type: "layoutReady", layout: base });
    s = flowReducer(s, { type: "layoutCommit", layout: edited(1), ops: [{ op: "remove", type: "two-top", count: 1 }] });
    expect(s.opLog).toHaveLength(1);
    s = flowReducer(s, { type: "undo" });
    expect(s.layout).toBe(base);
    expect(s.future).toHaveLength(1);
    s = flowReducer(s, { type: "redo" });
    expect(s.layout?.items).toHaveLength(edited(1).items.length);
    s = flowReducer(s, { type: "undo" });
    s = flowReducer(s, { type: "layoutCommit", layout: edited(2), ops: [] });
    expect(s.future).toEqual([]);
    expect(flowReducer(flowReducer(picked(), { type: "layoutReady", layout: base }), { type: "undo" }).layout).toBe(base);
  });

  it("keeps at most 50 undo steps", () => {
    let s = flowReducer(picked(), { type: "layoutReady", layout: base });
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = flowReducer(s, { type: "layoutCommit", layout: { ...base, items: [...base.items] }, ops: [] });
    expect(s.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe("examples, suggestions, memo link, no-fit line", () => {
  it("builds one example per city present, none when there are no cities", () => {
    expect(buildExamples(["Houston", "Los Angeles", "Houston", undefined])).toEqual(["Taqueria, 40 seats, $150k budget, Houston", "Coffee shop in Los Angeles"]);
    expect(buildExamples([])).toEqual([]);
  });

  it("suggests a change only for a cost the owner would pay", () => {
    expect(walkSuggestion({ tone: "needed", label: "x: you pay" }, "Kitchen hood")).toEqual(["Imagine the kitchen hood in place"]);
    expect(walkSuggestion({ tone: "saved", label: "x" }, "Kitchen hood")).toEqual([]);
    expect(walkSuggestion(undefined, "Kitchen hood")).toEqual([]);
  });

  it("carries the owner's concept, seats and budget to the memo", () => {
    expect(memoHref("123", { concept: "cafe", seats: 25, budgetUsd: 90_000 })).toBe("/site/123/offer?concept=cafe&seats=25&budget=90000");
    expect(memoHref("123", { concept: "bar" })).toBe("/site/123/offer?concept=bar");
  });

  it("builds the no-fit line from the engine numbers it priced", () => {
    const ins = (low: number) => ({ id: "t", siteId: "s", status: "done" as const, order: 0, tools: [], numbers: { buildoutUsd: { low, mid: low, high: low } } as never });
    const inspectors = { a: ins(310_000), b: ins(280_000) };
    expect(buildNoFitText(inspectors, 200_000)).toMatch(/\$280k, \$80k over your \$200k budget/);
    expect(buildNoFitText(inspectors, 400_000)).toMatch(/inside your \$400k budget/);
    expect(buildNoFitText({}, 200_000)).toMatch(/did not get far enough/);
  });
});
