import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF } from "@/lib/engine";
import { autoLayout, type Item, type Pt } from "@/lib/layout";
import { loadSites } from "@/lib/sites/load";
import { modelToThree } from "@/lib/immersive/cube";
import { EYE_M, FURNITURE_CAP, FURNITURE_NEAR_M, FURNITURE_RANGE_M, furnitureFor, placeItem, planToThree, roomIndexAt, roomRenderInstruction, visibleFurniture, type FurnitureInput } from "@/lib/three-d/furniture-place";
import { planFrameFor, yawFromRotation } from "@/lib/three-d/layout-map";

// two 6 x 5 m rooms side by side, in model space (x, y; z up)
const A: Pt[] = [[10, 4], [16, 4], [16, 9], [10, 9]];
const B: Pt[] = [[16, 4], [22, 4], [22, 9], [16, 9]];
const rooms = [
  { label: "Dining", polygon: A },
  { label: "Back", polygon: B },
];
const frame = planFrameFor([A, B]);
const item = (id: string, x: number, y: number, rotation: Item["rotation"] = 0): Item => ({ id, type: "four-top", x, y, rotation, w: 1.5, d: 1.5 });
const input = (items: Item[]): FurnitureInput => ({ items, frame, rooms });

describe("furniture placement transform", () => {
  it("puts a plan point where the scan's three.js frame says, on the floor", () => {
    // plan [2, 1] is model (12, 8): three is {x: 12, y: floor, z: -8}
    expect(planToThree(frame, [2, 1], 0.3)).toEqual([12, 0.3, -8]);
    expect(modelToThree({ x: 12, y: 8, z: 0 })).toEqual([12, 0, -8]);
  });

  it("stands a piece on the floor under the camera height, turned by the plan's rotation", () => {
    const pano = { x: 13, y: 6, z: 1.5 };
    const [p] = visibleFurniture(input([item("a", 2, 3, 90)]), pano);
    expect(p.position[1]).toBeCloseTo(pano.z - EYE_M);
    expect(p.position[0]).toBeCloseTo(12);
    expect(p.position[2]).toBeCloseTo(-6);
    expect(p.yaw).toBeCloseTo(yawFromRotation(90));
    expect(placeItem(frame, { x: 2, y: 3, rotation: 90 }, 0).yaw).toBeCloseTo(-Math.PI / 2);
  });

  it("moving a piece in the plan moves it in the room by the same metres", () => {
    const pano = { x: 13, y: 6, z: 1.5 };
    const [a] = visibleFurniture(input([item("a", 2, 3)]), pano);
    const [b] = visibleFurniture(input([item("a", 3, 2)]), pano);
    expect(b.position[0] - a.position[0]).toBeCloseTo(1); // plan +x is east
    expect(b.position[2] - a.position[2]).toBeCloseTo(-1); // plan y runs down the page, three -z is north: y 3 to 2 is one metre north
  });
});

describe("same-room filter", () => {
  const pano = { x: 13, y: 6, z: 1.5 }; // in room A
  it("finds the room a point stands in", () => {
    expect(roomIndexAt(rooms, 12, 5)).toBe(0);
    expect(roomIndexAt(rooms, 18, 5)).toBe(1);
    expect(roomIndexAt(rooms, 30, 5)).toBe(-1);
  });

  it("draws the camera's room and leaves the next room's pieces out, even when they are in range", () => {
    const here = item("here", 4, 3); // model (14, 6), room A, 1 m from the camera
    const next = item("next", 7, 3); // model (17, 6), room B, 2 m from the camera
    const cam = { x: 15, y: 6, z: 1.5 }; // room A
    expect(roomIndexAt(rooms, cam.x, cam.y)).toBe(0);
    expect(visibleFurniture(input([here, next]), cam).map((p) => p.id)).toEqual(["here"]);
    // standing in room B the same plan shows the other piece
    expect(visibleFurniture(input([here, next]), { x: 19, y: 6, z: 1.5 }).map((p) => p.id)).toEqual(["next"]);
    expect(visibleFurniture(input([here]), pano).length).toBe(1);
  });

  it("drops pieces on the lens or beyond the cube, nearest first, capped", () => {
    const items = [item("lens", 3, 3), item("near", 4.5, 3), item("beyond", 11, 3)];
    const got = visibleFurniture(input(items), { x: 13.05, y: 6, z: 1.5 });
    expect(got.map((p) => p.id)).toEqual(["near"]);
    expect(got[0].dist).toBeLessThan(FURNITURE_RANGE_M);
    expect(Math.hypot(1, 0)).toBeGreaterThan(FURNITURE_NEAR_M);
    const many = Array.from({ length: 80 }, (_, i) => item(`m${i}`, 1 + (i % 8) * 0.5, 1 + Math.floor(i / 8) * 0.4));
    expect(visibleFurniture(input(many), { x: 13, y: 6.5, z: 1.5 }).length).toBeLessThanOrEqual(FURNITURE_CAP);
  });

  it("shows a piece outside every outline (the patio) only when close", () => {
    const patioNear = item("p1", 2, 5.6); // model y 3.4: just south of the front wall
    const patioFar = item("p2", 11, 6);
    const got = visibleFurniture(input([patioNear, patioFar]), { x: 12, y: 5, z: 1.5 }).map((p) => p.id);
    expect(got).toContain("p1");
    expect(got).not.toContain("p2");
  });
});

describe("on the real scans", () => {
  const sites = loadSites().filter((s) => s.matterport?.scanOfExactSuite);
  it("exists for scans of the exact suite and not for listing-only floors", () => {
    expect(sites.length).toBeGreaterThan(0);
    const s = sites[0];
    const lay = autoLayout(s, { ...DEFAULT_BRIEF, city: s.city });
    const f = furnitureFor(s, lay);
    expect(f).not.toBeNull();
    const other = loadSites().find((x) => !x.matterport?.scanOfExactSuite);
    if (other) expect(furnitureFor(other, autoLayout(other, { ...DEFAULT_BRIEF, city: other.city }))).toBeNull();
  });

  it("every piece in view stands inside its own room outline, at the plan's position", () => {
    for (const s of sites.slice(0, 3)) {
      const lay = autoLayout(s, { ...DEFAULT_BRIEF, city: s.city });
      const f = furnitureFor(s, lay)!;
      for (const pano of s.matterport!.panos.slice(0, 6)) {
        const placed = visibleFurniture(f, pano.position);
        const here = roomIndexAt(f.rooms, pano.position.x, pano.position.y);
        for (const p of placed) {
          const it = lay.items.find((i) => i.id === p.id)!;
          const m = f.frame.fromPlan([it.x, it.y]);
          expect(p.position[0]).toBeCloseTo(m.x);
          expect(p.position[2]).toBeCloseTo(-m.y);
          const there = roomIndexAt(f.rooms, m.x, m.y);
          if (here >= 0 && there >= 0) expect(there).toBe(here);
        }
      }
    }
  });
});

describe("AI render instruction", () => {
  it("counts the pieces the plan puts in view and stays under the endpoint cap", () => {
    const t = roomRenderInstruction("full-service", [{ type: "four-top" }, { type: "four-top" }, { type: "bar-counter" }]);
    expect(t).toContain("2 four-tops");
    expect(t).toContain("1 bar counter");
    expect(t.length).toBeLessThanOrEqual(500);
  });
});
