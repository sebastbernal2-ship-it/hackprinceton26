import { describe, expect, it } from "vitest";
import { alignmentView, compatibility, topAlignment } from "../alignment";
import { isSarahPrompt, SARAH_BRIEF, SARAH_LIMIT, SARAH_NOTICE } from "../sarah-scene";

const al = (pass: number, unknown: number, fail = 0) => ({ alignment: { pass, unknown, fail, total: pass + unknown + fail, confirmed: ["city"], unknownItems: ["seats"] } });

describe("Sarah scene", () => {
  it("fires on the whole word Sarah in any case only", () => {
    for (const t of ["Sarah", "i'm sarah, hi", "SARAH.", "Hello, Sarah!"]) expect(isSarahPrompt(t)).toBe(true);
    for (const t of ["Sarahs", "Sarahan cafe", "xsarah", "cafes", ""]) expect(isSarahPrompt(t)).toBe(false);
  });
  it("has the canonical two-answer brief and a labelled banner", () => {
    expect(SARAH_BRIEF).toHaveLength(2);
    expect(SARAH_BRIEF[0].question).toBe("What are you looking for?");
    expect(SARAH_BRIEF[0].answer.startsWith("I'm Sarah. I run Fruity Yogurt")).toBe(true);
    expect(SARAH_BRIEF[1].question).toBe("Anything the space must have?");
    expect(SARAH_LIMIT).toBe(5);
    expect(SARAH_NOTICE).toBe("Demo scene: Sarah (scripted answers)");
  });
});

describe("alignment", () => {
  it("words the line as requirements confirmed, never a score", () => {
    expect(alignmentView(al(3, 2))?.line).toBe("Requirements met: 3 of 5, 2 unknown");
    expect(alignmentView(al(2, 1, 1))?.line).toBe("Requirements met: 2 of 4, 1 unknown, 1 contradicted");
  });
  it("says how many met requirements rest on estimates", () => {
    const a = { alignment: { pass: 5, unknown: 0, fail: 0, total: 5, confirmed: [], unknownItems: [], estimatedItems: ["Seat capacity", "Build-out budget"] } };
    expect(alignmentView(a)?.line).toBe("Requirements met: 5 of 5 (2 on estimates)");
  });
  it("is null when absent or malformed, so nothing is invented", () => {
    expect(alignmentView({})).toBeNull();
    expect(alignmentView({ alignment: null })).toBeNull();
    expect(alignmentView(al(0, 0))).toBeNull();
    expect(alignmentView({ alignment: { pass: "3", unknown: 1, fail: 0, total: 4 } as never })).toBeNull();
  });
  it("marks only a strict leader, and nothing on ties or zero confirmed", () => {
    expect(topAlignment([al(1, 4), al(3, 2), al(3, 2)])).toEqual([1, 2]);
    expect(topAlignment([al(2, 3), al(2, 3)])).toEqual([]);
    expect(topAlignment([al(0, 5), al(0, 5), {}])).toEqual([]);
    expect(topAlignment([{}, {}])).toEqual([]);
    expect(topAlignment([])).toEqual([]);
  });
});

describe("compatibility", () => {
  it("blends 70% requirements met with 30% evidence readiness", () => {
    expect(compatibility({ ...al(5, 0), evidenceReadiness: 20 })).toBe(76);
    expect(compatibility({ ...al(0, 5), evidenceReadiness: 100 })).toBe(30);
  });
  it("is null without alignment", () => {
    expect(compatibility({ evidenceReadiness: 50 })).toBeNull();
  });
});
