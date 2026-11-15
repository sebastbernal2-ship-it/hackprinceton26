import { describe, expect, it } from "vitest";
import { FACES, RING, capEdgeTouching, cubeQuat, faceForYaw, modelQuatToThree, modelToThree, opposite, ringNeighbours, rotate, yawOf } from "@/lib/immersive/cube";
import { imagineVersionId, normalizeInstruction, panoCacheKey } from "@/lib/immersive/cache-key";
import { planFaces, sharedEdge } from "@/lib/immersive/imagine-pano";
import { bestAligned, headingWord, neighbours, pickByDirection, roomAt, walkable, type WalkPano } from "@/lib/immersive/walk";

const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe("cube face mapping", () => {
  it("keeps Matterport's index order: f0 up, f1-f4 ring turning right, f5 down", () => {
    expect(FACES.map((f) => f.name)).toEqual(["up", "front", "right", "back", "left", "down"]);
    expect(FACES.map((f) => f.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("every face is seen from inside without mirroring (right x up = toward the viewer)", () => {
    for (const f of FACES) close(cross(f.right, f.up), f.dir.map((v) => -v));
  });

  it("ring faces join edge to edge: a face's right edge is the next face's left edge", () => {
    for (const f of RING) {
      const next = FACES[ringNeighbours(f).right];
      // the right edge of f sits at dir + right; the left edge of next at dir - right: the same line
      close(FACES[f].dir.map((v, i) => v + FACES[f].right[i]), next.dir.map((v, i) => v - next.right[i]));
    }
  });

  it("ceiling bottom meets the front face's top; floor top meets the front face's bottom", () => {
    const up = FACES[0];
    const down = FACES[5];
    const front = FACES[1];
    close(up.dir.map((v, i) => v - up.up[i]), front.dir.map((v, i) => v + front.up[i]));
    close(down.dir.map((v, i) => v + down.up[i]), front.dir.map((v, i) => v - front.up[i]));
    expect(capEdgeTouching(0, 1)).toBe("bottom");
    expect(capEdgeTouching(5, 1)).toBe("top");
    expect(capEdgeTouching(0, 3)).toBe("top");
    expect(capEdgeTouching(0, 2)).toBe("right");
  });

  it("ring helpers", () => {
    expect(ringNeighbours(1)).toEqual({ left: 4, right: 2 });
    expect(ringNeighbours(4)).toEqual({ left: 3, right: 1 });
    expect(opposite(2)).toBe(4);
  });

  it("model z-up maps to three y-up as a proper rotation", () => {
    expect(modelToThree({ x: 1, y: 2, z: 3 })).toEqual([1, 3, -2]);
    // a 90 degree yaw about model z becomes a 90 degree yaw about three y
    const s = Math.SQRT1_2;
    const q = modelQuatToThree({ x: 0, y: 0, z: s, w: s });
    close(rotate(q, [0, 0, -1]), [-1, 0, 0]); // three -z (model +y) turns to three -x (model -x)
  });

  it("calibration: identity rotation faces model +x (three +x, yaw -90 deg)", () => {
    close(rotate(cubeQuat(undefined), [0, 0, -1]), [1, 0, 0]);
  });

  it("faceForYaw follows the pano rotation", () => {
    expect(faceForYaw(-Math.PI / 2)).toBe(1); // model +x
    expect(faceForYaw(Math.PI)).toBe(2); // turning right from +x is model -y
    expect(faceForYaw(0)).toBe(4);
    const s = Math.SQRT1_2;
    // rotated 90 deg left about up: front now faces model +y (yaw 0)
    expect(faceForYaw(0, { x: 0, y: 0, z: s, w: s })).toBe(1);
  });
});

const pano = (id: string, x: number, y: number, z = 1.4, sky = true): WalkPano => ({ id, position: { x, y, z }, skybox: sky ? ["a", "b", "c", "d", "e", "f"] : undefined });

describe("neighbour selection", () => {
  const panos = [pano("a", 0, 0), pano("b", 0, 3), pano("c", 4, 0), pano("d", 0, 5.5), pano("e", 20, 0), pano("f", -2, 0, 1.4, false), pano("g", 0, -3, 3.5)];

  it("only panos with a skybox are walkable", () => {
    expect(walkable(panos).map((p) => p.id)).not.toContain("f");
  });

  it("finds panos within 6 m on the same level, nearest first, nearer one hiding the farther in the same direction", () => {
    const n = neighbours(panos, "a");
    expect(n.map((x) => x.id)).toEqual(["b", "c"]);
    expect(n[0].distance).toBeCloseTo(3);
  });

  it("bearing: model +y is straight ahead at yaw 0, model +x is to the right", () => {
    const [b, c] = neighbours(panos, "a");
    expect(b.yaw).toBeCloseTo(0);
    expect(c.yaw).toBeCloseTo(-Math.PI / 2);
    expect(yawOf(1, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it("an isolated pano still reaches its nearest neighbours up to 10 m", () => {
    const n = neighbours([pano("a", 0, 0), pano("b", 8, 0), pano("c", 0, -9), pano("d", 30, 0)], "a");
    expect(n.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("bestAligned picks the neighbour in the view direction, null when nothing is ahead", () => {
    const n = neighbours(panos, "a");
    expect(bestAligned(n, 0.2)?.id).toBe("b");
    expect(bestAligned(n, -1.4)?.id).toBe("c");
    expect(bestAligned(n, Math.PI)).toBeNull();
    expect(pickByDirection(n, 0.7)).toBeNull();
  });

  it("roomAt and headingWord", () => {
    expect(roomAt([{ label: "Dining", polygon: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }], { x: 0, y: 0 })).toBe("Dining");
    expect(roomAt([{ label: "Dining", polygon: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }], { x: 3, y: 0 })).toBeNull();
    expect(headingWord(0)).toBe("north");
    expect(headingWord(-Math.PI / 2)).toBe("east");
  });
});

describe("imagined pano cache key and edit plan", () => {
  it("normalizes instructions so trivial differences hit the same cache", () => {
    expect(normalizeInstruction("  Add a long  wooden bar. ")).toBe("add a long wooden bar");
    expect(panoCacheKey("1018657", "p1", "Add a bar")).toBe(panoCacheKey("1018657", "p1", "add a bar."));
    expect(panoCacheKey("1018657", "p1", "add a bar")).not.toBe(panoCacheKey("1018657", "p2", "add a bar"));
    expect(panoCacheKey("1018657", "p1", "add a bar")).not.toBe(panoCacheKey("1018657", "p1", "add a bar", "scanned"));
  });

  it("version ids are per (site, instruction) and match the Imagine version pattern", () => {
    const v = imagineVersionId("1018657", "add a bar");
    expect(v).toMatch(/^v[a-z0-9]{6,16}$/);
    expect(imagineVersionId("1018657", "Add a bar.")).toBe(v);
    expect(imagineVersionId("5697296", "add a bar")).not.toBe(v);
  });

  it("edits the looked-at face first, its neighbours next, the opposite last; caps only when asked", () => {
    expect(planFaces(2, "add a long wooden bar with stools")).toEqual([[2], [1, 3], [4]]);
    expect(planFaces(1, "paint the walls and add pendant lighting and a terrazzo floor")).toEqual([[1], [4, 2, 0, 5], [3]]);
    expect(planFaces(1, "new ceiling and new floor").flat().length).toBeLessThanOrEqual(6);
  });

  it("describes shared edges between faces", () => {
    expect(sharedEdge(2, 1)).toEqual({ edgeOfTarget: "left", edgeOfRef: "right" });
    expect(sharedEdge(4, 1)).toEqual({ edgeOfTarget: "right", edgeOfRef: "left" });
    expect(sharedEdge(0, 1)).toEqual({ edgeOfTarget: "bottom", edgeOfRef: "top" });
    expect(sharedEdge(5, 3)).toEqual({ edgeOfTarget: "bottom", edgeOfRef: "bottom" });
  });
});

import { nearestPano } from "@/lib/immersive/walk";

describe("nearestPano", () => {
  const six = ["a", "b", "c", "d", "e", "f"];
  const panos = [
    { id: "near-no-sky", position: { x: 0, y: 0, z: 1.5 } },
    { id: "a", position: { x: 5, y: -5, z: 1.5 }, skybox: six },
    { id: "b", position: { x: 20, y: 0, z: 1.5 }, skybox: six },
  ];
  it("maps scene space (y-up, plan y = -z) onto the model and skips panos without a skybox", () => {
    expect(nearestPano(panos, { x: 4, y: 1.4, z: 4.5 })?.id).toBe("a");
    expect(nearestPano(panos, { x: 19, y: 1.4, z: 0 })?.id).toBe("b");
    expect(nearestPano([], { x: 0, y: 0, z: 0 })).toBeNull();
  });
});
