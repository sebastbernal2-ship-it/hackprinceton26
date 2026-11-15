import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { placeAsset, type Placement } from "../asset-layout";
import type { Asset } from "../assets";
import { autoDesign, designPieces } from "../auto-design";
import { answerQuestion, inspectFloor, lookAroundPlan, planDesign } from "../fio-plan";
import { FioTimeline, pathLength, stepDuration, type FioEvent, type FioStep } from "../fio-steps";

const lib = path.resolve(__dirname, "../../../../assets/library");
const assets: Asset[] = readdirSync(lib).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(lib, f), "utf8")) as Asset);
const floor = { width: 11, depth: 7.5 };
const design = autoDesign({ floor, seatsTarget: 20, concept: "cafe", assets, patio: { seats: 4 } });

describe("planDesign", () => {
  const plan = planDesign(design, floor);
  const places = plan.steps.filter((s): s is Extract<FioStep, { kind: "place" }> => s.kind === "place");

  it("places every piece of the design once, in design order", () => {
    expect(places.map((p) => p.item.id)).toEqual(design.steps.map((s) => s.id));
    expect(plan.items).toHaveLength(design.steps.length);
  });
  it("picks before each place, says each reason while walking, and ends by celebrating", () => {
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds[0]).toBe("say");
    expect(kinds[kinds.length - 1]).toMatch(/celebrate|say/);
    for (let i = 0; i < plan.steps.length; i++) if (plan.steps[i].kind === "place") expect(plan.steps[i - 2].kind).toBe("pick");
    const said = plan.steps.flatMap((s) => (s.kind === "walk" && s.say ? [s.say] : []));
    expect(said).toEqual(design.steps.map((s) => s.reason).filter(Boolean));
  });
  it("stands on free floor beside each piece, never inside what is already placed", () => {
    const placed: Placement["box"][] = [];
    design.steps.forEach((s, i) => {
      const [x, y] = plan.stands[i];
      if (!s.patio) {
        expect(x).toBeGreaterThan(0);
        expect(y).toBeGreaterThan(0);
        expect(x).toBeLessThan(floor.width);
        expect(y).toBeLessThan(floor.depth);
      }
      for (const b of placed) expect(x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1).toBe(false);
      placed.push(placeAsset(s.asset, "k", s.rot, s.x, s.y).box);
    });
  });
  it("takes a crate trip per group, not per chair", () => {
    const supplyWalks = plan.steps.filter((s, i) => s.kind === "walk" && plan.steps[i + 1]?.kind === "pick").length;
    expect(supplyWalks).toBeLessThan(design.steps.length);
    expect(supplyWalks).toBeGreaterThan(5);
    expect(planDesign(design, floor, { fast: true }).steps.filter((s) => s.kind === "walk")).toHaveLength(design.steps.length);
  });
  it("speaks each reason once even though the bubble stays up through the set-down", () => {
    const tl = new FioTimeline(design.door);
    tl.push(plan.steps, 0);
    const said = tl.events(plan.duration + 1).filter((e) => e.type === "say").map((e) => e.text);
    expect(said).toEqual([design.narration[0], ...design.steps.map((s) => s.reason).filter(Boolean), design.narration[design.narration.length - 1]]);
  });
  it("has a sane duration and is deterministic", () => {
    expect(plan.duration).toBeGreaterThan(30);
    expect(plan.duration).toBeLessThan(900);
    expect(JSON.stringify(planDesign(design, floor))).toBe(JSON.stringify(plan));
  });
});

describe("FioTimeline", () => {
  const item = { id: "a", label: "Table", cx: 3, cy: 2, w: 1, d: 1 };
  const steps: FioStep[] = [
    { kind: "walk", path: [[0, 0], [3, 0]] },
    { kind: "pick", item },
    { kind: "walk", path: [[3, 3]], say: "hello" },
    { kind: "place", item, dur: 1 },
  ];
  it("walks along the path at the configured speed with the right facing", () => {
    const t = new FioTimeline([0, 0], { speed: 1 });
    const { end } = t.push(steps, 0);
    expect(stepDuration(steps[0], 1, false, [0, 0])).toBeCloseTo(3);
    expect(end).toBeCloseTo(3 + 0.4 + 3 + 1);
    const mid = t.sample(1.5);
    expect(mid.x).toBeCloseTo(1.5);
    expect(mid.facing).toBe("r");
    expect(mid.action).toBe("walk");
    const carry = t.sample(3.4 + 1.5);
    expect(carry.action).toBe("carry");
    expect(carry.carry?.id).toBe("a");
    expect(carry.facing).toBe("d");
    expect(carry.say).toBe("hello");
  });
  it("fires pick and place events once, in order, and clears the carried piece when it lands", () => {
    const t = new FioTimeline([0, 0], { speed: 1 });
    t.push(steps, 0);
    const seen: FioEvent[] = [];
    for (let s = 0; s <= 10; s += 0.1) seen.push(...t.events(s));
    expect(seen.map((e) => e.type)).toEqual(["pick", "say", "place"]);
    const after = t.sample(7.0);
    expect(after.carry).toBeNull();
    expect(after.pop?.x).toBe(3);
    expect(t.sample(7.6).pop).toBeNull();
  });
  it("queues new steps after the running ones and collapses walks when reduced motion is on", () => {
    const t = new FioTimeline([0, 0], { speed: 1, reduced: true });
    t.push([{ kind: "walk", path: [[10, 0]] }], 0);
    expect(t.end).toBeLessThan(0.5);
    const u = new FioTimeline([0, 0], { speed: 1 });
    u.push([{ kind: "walk", path: [[4, 0]] }], 0);
    u.push([{ kind: "walk", path: [[4, 4]] }], 1);
    expect(u.end).toBeCloseTo(8);
    expect(pathLength([[0, 0], [3, 4]])).toBe(5);
  });
});

describe("looking around and answering", () => {
  const placed = designPieces(design);
  const info = inspectFloor(floor, placed);
  it("counts seats and problems the same way the design does", () => {
    expect(info.seats).toBe(design.seats);
    expect(info.problems).toEqual([]);
    expect(answerQuestion("how many seats?", info)).toBe(`I count ${design.seats} seats.`);
    expect(answerQuestion("any problems?", info)).toMatch(/Nothing flagged/);
    expect(answerQuestion("anything wrong", inspectFloor(floor, [placed[0], { ...placed[0], id: "dup" }]))).toMatch(/1 problem/);
    expect(answerQuestion("seats?", inspectFloor(floor, []))).toMatch(/empty/);
  });
  it("walks the room and then speaks the answer", () => {
    const steps = lookAroundPlan(floor, placed, design.door, "All good.");
    expect(steps.filter((s) => s.kind === "look").length).toBe(4);
    expect(steps[steps.length - 1]).toMatchObject({ kind: "say", text: "All good." });
  });
});
