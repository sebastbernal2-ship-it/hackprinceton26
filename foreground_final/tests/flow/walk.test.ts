import { describe, expect, it } from "vitest";
import { getWalk } from "@/app/flow-actions";
import { createFlowState, flowReducer } from "@/components/flow/flow-reducer";
import type { MessageBody } from "@/components/flow/types";
import { buildTour, type TourFinding, type TourLine } from "@/lib/immersive/tour";
import type { WalkPano } from "@/lib/immersive/walk";

const face = ["a", "b", "c", "d", "e", "f"];
const pano = (id: string, x: number, y: number): WalkPano => ({ id, position: { x, y, z: 0 }, skybox: face });
const panos = [pano("p1", 0, 0), pano("p2", 3, 0), pano("p3", 6, 0), pano("p4", 9, 0), { id: "bare", position: { x: 1, y: 1, z: 0 } }];
const finding = (id: string, kind: string, status: TourFinding["status"], panoId?: string, x = 0): TourFinding => ({
  id,
  kind,
  status,
  confidence: 0.8,
  evidence: `evidence ${id}`,
  source: "matterport-vision",
  panoId,
  position: panoId ? undefined : { x, y: 0, z: 0 },
});
const line = (kind: string, status: TourLine["status"], high: number, findingId?: string): TourLine => ({
  kind,
  status,
  label: kind,
  range: { low: high / 2, high },
  findingId,
});

describe("buildTour", () => {
  it("returns nothing when no pano can be stood in", () => {
    expect(buildTour({ panos: [panos[4]], rooms: [], findings: [], lines: [] })).toEqual([]);
  });

  it("puts money first, one stop per pano, never more than the cap", () => {
    const stops = buildTour({
      panos,
      rooms: [],
      findings: [finding("f1", "hood", "absent", "p1"), finding("f2", "walk-in", "present", "p2"), finding("f3", "gas", "unknown", "p3"), finding("f4", "ada", "absent", "p4")],
      lines: [line("hood", "needed", 40000, "f1"), line("walk-in", "saved", 9000, "f2"), line("gas", "maybe", 5000, "f3"), line("ada", "needed", 20000, "f4")],
      max: 3,
    });
    expect(stops).toHaveLength(3);
    expect(new Set(stops.map((s) => s.panoId)).size).toBe(3);
    // the saved walk-in is the least important of four, so it is cut
    expect(stops.map((s) => s.pin?.tone).sort()).toEqual(["maybe", "needed", "needed"]);
    expect(stops.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("anchors a finding with no pano to the nearest one and carries the engine range", () => {
    const [stop] = buildTour({
      panos,
      rooms: [],
      findings: [finding("f1", "hood", "absent", undefined, 8.5)],
      lines: [line("hood", "needed", 40000, "f1")],
      max: 1,
    });
    expect(stop.panoId).toBe("p4");
    expect(stop.pin?.amountUsd).toEqual({ low: 20000, high: 40000 });
    expect(stop.text).toBe("evidence f1");
    expect(stop.source).toContain("80%");
  });

  it("never pins 'already here' on a scan that shows it absent; the listing-vs-scan conflict becomes ask-the-landlord", () => {
    const [stop] = buildTour({ panos, rooms: [], findings: [finding("scan-hood", "hood", "absent", "p1")], lines: [line("hood", "saved", 40000, "listing-hood")] });
    expect(stop.pin?.tone).toBe("maybe");
    expect(stop.pin?.label).toMatch(/ask the landlord/);
    expect(stop.text).toMatch(/disagree/);
  });

  it("pads thin findings only with stops that have something true to say, built from the room", () => {
    const rooms = [{ label: "Dining room", polygon: [[-1, -1], [10, -1], [10, 2], [-1, 2]] as [number, number][] }];
    const stops = buildTour({ panos, rooms, findings: [finding("f1", "hood", "absent", "p1")], lines: [line("hood", "needed", 1000, "f1")] });
    expect(stops.length).toBe(3);
    expect(stops[1].pin).toBeUndefined();
    expect(stops[1].panoId).toBe("p4");
    // 11 m x 3 m = 33 m2, about 360 SF; four scan positions stand in it
    expect(stops[1].title).toBe("Dining room");
    expect(stops[1].text).toMatch(/about 360 SF/);
    expect(stops[1].text).toMatch(/4 scan positions/);
    expect(stops[1].text).not.toMatch(/Nothing was flagged/);
  });

  it("drops padded stops when no room outline can describe them", () => {
    const stops = buildTour({ panos, rooms: [], findings: [finding("f1", "hood", "absent", "p1")], lines: [line("hood", "needed", 1000, "f1")] });
    expect(stops).toHaveLength(1);
  });

  it("walks to the nearest stop next", () => {
    const stops = buildTour({
      panos,
      rooms: [],
      findings: [finding("f1", "hood", "absent", "p4"), finding("f2", "gas", "absent", "p1"), finding("f3", "ada", "absent", "p2")],
      lines: [line("hood", "needed", 3), line("gas", "needed", 2), line("ada", "needed", 1)],
    });
    expect(stops.map((s) => s.panoId)).toEqual(["p1", "p2", "p4"]);
  });
});

describe("getWalk (real site data)", () => {
  it("gives the viewer walkable panos and a tour of stops that exist in them", async () => {
    const w = await getWalk("1018657", { concept: "fast-casual" });
    expect(w).not.toBeNull();
    const ids = new Set(w!.site.matterport.panos.map((p) => p.id));
    expect(w!.stops.length).toBeGreaterThanOrEqual(3);
    for (const s of w!.stops) expect(ids.has(s.panoId)).toBe(true);
  });
  it("refuses an unknown site or a bad concept", async () => {
    expect(await getWalk("nope", { concept: "cafe" })).toBeNull();
    expect(await getWalk("1018657", { concept: "x" as never })).toBeNull();
  });
});

describe("walk reducer events", () => {
  const step = (index: number): MessageBody => ({
    kind: "walkStep",
    siteId: "a",
    index,
    total: 3,
    title: "t",
    text: "x",
    streaming: false,
    state: "active",
    source: "s",
  });
  const base = () => {
    let s = createFlowState({ spaces: [] });
    s = flowReducer(s, { type: "append", message: { kind: "pickCards", intro: "i", picks: [{ siteId: "a", rank: 1, photo: "", address: "", city: "", sf: 1, allInUsd: { low: 1, high: 2 }, reason: "", hasScan: true }] }, at: 1 });
    s = flowReducer(s, { type: "pick", siteId: "a" });
    for (const i of [0, 1, 2]) s = flowReducer(s, { type: "append", message: step(i), at: 2 });
    return s;
  };

  it("walkActive makes one step active and the rest visited", () => {
    const s = flowReducer(base(), { type: "walkActive", siteId: "a", index: 1 });
    expect(s.messages.filter((m) => m.kind === "walkStep").map((m) => (m.kind === "walkStep" ? m.state : ""))).toEqual(["visited", "active", "visited"]);
  });

  it("back drops the walk messages and keeps the cards unchosen", () => {
    let s = flowReducer(base(), { type: "append", message: { kind: "imagineResult", siteId: "a", panoId: "p", instruction: "x", status: "done", tone: "info" }, at: 3 });
    s = flowReducer(s, { type: "back" });
    expect(s.phase).toBe("pick");
    expect(s.messages.map((m) => m.kind)).toEqual(["pickCards"]);
    expect((s.messages[0] as { chosenSiteId?: string }).chosenSiteId).toBeUndefined();
  });
});
