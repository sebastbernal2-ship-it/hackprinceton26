import { describe, expect, it } from "vitest";
import { autoLayout, footprintFor, type Pt } from "@/lib/layout";
import { DEFAULT_BRIEF } from "@/lib/engine";
import { loadSites } from "@/lib/sites/load";
import { ITEM_SPECS } from "@/lib/layout";
import { MAX_SCENE_OBJECTS, MODEL_FOR, fitModel, planFrameFor, planToScene, rotationFromYaw, sceneItems, sceneToPlan, yawFromRotation } from "@/lib/three-d/layout-map";

const scanned = loadSites().find((s) => s.matterport?.scanOfExactSuite && s.matterport.rooms.some((r) => r.polygon && r.polygon.length >= 3));

describe("layout <-> scene mapping", () => {
  it("round-trips a plan point and agrees with footprintFor", () => {
    const rings: Pt[][] = [[[10, 4], [16, 4], [16, 9], [10, 9]], [[16, 4], [20, 4], [20, 7], [16, 7]]];
    const f = planFrameFor(rings);
    const plan = f.toPlan({ x: 12, y: 5 });
    expect(plan).toEqual([2, 4]);
    const v = planToScene(f, [2, 4], 0.1);
    expect(v).toEqual({ x: 12, y: 0.1, z: -5 });
    const back = sceneToPlan(f, v);
    expect(back[0]).toBeCloseTo(2);
    expect(back[1]).toBeCloseTo(4);
  });

  it("uses the same inverse as the real footprint", () => {
    expect(scanned).toBeTruthy();
    const frame = footprintFor(scanned!);
    const p: Pt = [3.25, 1.5];
    const m = frame.fromPlan!(p);
    expect(frame.toPlan!(m)[0]).toBeCloseTo(p[0]);
    expect(frame.toPlan!(m)[1]).toBeCloseTo(p[1]);
    const f2 = planFrameFor(scanned!.matterport!.rooms.filter((r) => r.polygon && r.polygon.length >= 3).map((r) => r.polygon as Pt[]));
    expect(sceneToPlan(f2, planToScene(f2, p, 0))[0]).toBeCloseTo(p[0]);
  });

  it("converts rotation both ways", () => {
    for (const r of [0, 90, 180, 270] as const) expect(rotationFromYaw(yawFromRotation(r))).toBe(r);
    expect(rotationFromYaw(0.1)).toBe(0);
    expect(rotationFromYaw(-Math.PI / 2 + 0.2)).toBe(90);
  });

  it("caps the objects shown, seating first, and sizes models to the item", () => {
    const l = autoLayout(scanned!, DEFAULT_BRIEF);
    const items = sceneItems(l);
    expect(items.length).toBeLessThanOrEqual(MAX_SCENE_OBJECTS);
    expect(items.every((i) => i.type !== "kitchen-line" && i.type !== "walk-in")).toBe(true);
    const fit = fitModel({ type: "four-top", w: 1.5, d: 1.5 });
    expect(fit.scale.x * 0.84).toBeCloseTo(0.93);
    expect(sceneItems(l, 3)).toHaveLength(3);
  });
});

describe("fitModel", () => {
  it("sizes each model to the item and puts its underside and centre on the origin", () => {
    for (const type of ["booth", "bar-stool", "bar-counter", "patio-table", "counter", "four-top"] as const) {
      const item = { type, w: ITEM_SPECS[type].w, d: ITEM_SPECS[type].d };
      const spec = MODEL_FOR[type]!;
      const f = fitModel(item);
      expect(spec.size[0] * f.scale.x).toBeCloseTo(item.w * spec.fill);
      expect(spec.size[2] * f.scale.z).toBeCloseTo(item.d * spec.fill);
      expect(spec.size[1] * f.scale.y).toBeCloseTo(ITEM_SPECS[type].h);
      // lowest point of the scaled model is at y = 0; its footprint is centred on x/z = 0
      expect(spec.min[1] * f.scale.y + f.offset.y).toBeCloseTo(0);
      expect((spec.min[0] + spec.size[0] / 2) * f.scale.x + f.offset.x).toBeCloseTo(0);
      expect((spec.min[2] + spec.size[2] / 2) * f.scale.z + f.offset.z).toBeCloseTo(0);
    }
  });
});
