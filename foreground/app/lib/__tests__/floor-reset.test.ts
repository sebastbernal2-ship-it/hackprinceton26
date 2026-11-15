import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// modeling/floor_reset.js is a plain browser script; its pure functions also export for node.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FR: any = createRequire(import.meta.url)("../../../../modeling/floor_reset.js");

// A synthetic scan: a 6 x 4 m floor at z=0.02 with a bumpy "sofa" (0.9 m tall box), a wall on the +y side and a low skirting hanging above the floor.
function room() {
  const P: number[] = [], I: number[] = [];
  const v = (x: number, y: number, z: number) => { P.push(x, y, z); return P.length / 3 - 1; };
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { const i = [a, b, c, d].map((p) => v(p[0], p[1], p[2])); I.push(i[0], i[1], i[2], i[0], i[2], i[3]); };
  for (let x = 0; x < 6; x += 0.5) for (let y = 0; y < 4; y += 0.5) quad([x, y, 0.02], [x + 0.5, y, 0.02], [x + 0.5, y + 0.5, 0.02], [x, y + 0.5, 0.02]);
  const floorTris = I.length / 3;
  quad([2, 1, 0.4], [3, 1, 0.4], [3, 2, 0.4], [2, 2, 0.4]);                 // sofa seat (smeared remnant)
  quad([2, 1, 0.02], [3, 1, 0.02], [3, 1, 0.4], [2, 1, 0.4]);                // sofa front, vertical and low, away from walls
  const wallStart = I.length / 3;
  quad([0, 4, 0.1], [6, 4, 0.1], [6, 4, 2.5], [0, 4, 2.5]);                  // wall whose foot hangs 8 cm above the floor
  return { P: Float32Array.from(P), I: Uint32Array.from(I), floorTris, wallStart };
}

describe("floor reset", () => {
  it("finds the main floor level, not the sofa seat", () => {
    const { P, I } = room();
    const lvl = FR.floorLevel(P, I, 0.1, 0.5);
    expect(lvl.z).toBeCloseTo(0.02, 2);
  });

  it("culls the bumps in the slab, keeps walls, and pulls wall feet to the floor", () => {
    const { P, I, floorTris, wallStart } = room();
    const A = FR.analyse({ P, I, floorZ: 0.02, pieces: [{ cx: 2.5, cy: 1.5, hx: 0.5, hy: 0.5, yaw: 0 }] });
    for (let t = 0; t < floorTris; t++) expect(A.cull[t]).toBe(1);          // the scanned floor itself
    expect(A.cull[floorTris]).toBe(1);                                      // sofa seat
    expect(A.cull[floorTris + 1]).toBe(1);                                  // sofa front
    for (let t = wallStart; t < I.length / 3; t++) expect(A.cull[t]).toBe(0); // wall stays
    expect(A.snap.length).toBeGreaterThan(0);                               // wall foot (z=0.1) gets pulled to the floor
    expect(A.area).toBeGreaterThan(20);                                     // ~24 m2 floor
    expect(A.area).toBeLessThan(30);
  });

  it("builds a flat floor over the footprint", () => {
    const { P, I } = room();
    const A = FR.analyse({ P, I, floorZ: 0.02, pieces: [] });
    const g = FR.floorGeometry(A.G, A.mask, 0.02);
    for (let k = 2; k < g.pos.length; k += 3) expect(g.pos[k]).toBeCloseTo(0.02, 5);
    expect(g.idx.length).toBeGreaterThan(0);
  });

  it("classifies scan floor colours", () => {
    const rep = (c: number[], n = 50) => Array.from({ length: n }, (_, i) => c.map((x) => x + ((i % 5) - 2)));
    expect(FR.classifyFloor(rep([196, 150, 100])).kind).toBe("wood");
    expect(FR.classifyFloor(rep([140, 139, 137])).kind).toBe("concrete");
    expect(FR.classifyFloor(rep([225, 224, 220])).kind).toBe("tile");
    expect(FR.classifyFloor([]).kind).toBe("concrete");
  });

  it.each(["wood", "tile", "concrete", "carpet", "plain"])("%s texture tiles seamlessly", (kind) => {
    const N = 128, px = FR.makeTexture(kind, undefined, N);
    const lum = (x: number, y: number) => px[(y * N + x) * 4];
    let seam = 0, inner = 0;
    for (let y = 0; y < N; y++) { seam += Math.abs(lum(0, y) - lum(N - 1, y)) + Math.abs(lum(y, 0) - lum(y, N - 1)); inner += Math.abs(lum(N / 2, y) - lum(N / 2 - 1, y)) + Math.abs(lum(y, N / 2) - lum(y, N / 2 - 1)); }
    expect(seam).toBeLessThanOrEqual(inner * 3 + N * 8);                    // the wrap edge is no rougher than the interior
    expect(px[3]).toBe(255);
  });

  it("measures flatness", () => {
    const f = FR.flatness([0.02, 0.02, 0.1, NaN, -Infinity], 0.02);
    expect(f.n).toBe(3);
    expect(f.maxDev).toBeCloseTo(0.08, 5);
  });
});
