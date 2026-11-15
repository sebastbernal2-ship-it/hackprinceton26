import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF } from "@/lib/engine";
import { assess, changeLine, occupantLoad, ChangeSchema, type Change, type CheckId } from "@/lib/feasibility";
import { applyOps, autoLayout } from "@/lib/layout";
import { loadSite } from "@/lib/sites/load";
import type { Site } from "@/lib/sites/schema";

const base = loadSite("1018657")!;
const brief = { ...DEFAULT_BRIEF, city: base.city };

const change = (c: Partial<Change> & Pick<Change, "kind" | "target" | "detail">): Change => ChangeSchema.parse({ id: c.id ?? "c1", ...c });
const variant = (patch: (s: Site) => void): Site => {
  const s = structuredClone(base);
  patch(s);
  return s;
};
const run = (changes: Change[], site: Site = base) => assess({ site, brief, changes });
const get = (a: ReturnType<typeof assess>, id: CheckId) => a.checks.find((c) => c.id === id);

describe("wall removal", () => {
  const a = run([change({ kind: "wall", target: "wall between the dining room and the back room", detail: "open about 10 ft" })]);
  const wall = get(a, "wall")!;

  it("never assumes non-structural: a structural engineer is required", () => {
    expect(wall.status).toBe("needs-professional");
    expect(wall.professional).toMatch(/structural engineer/i);
    expect(wall.summary).toMatch(/structural engineer/i);
  });
  it("prices from a non-bearing partition to a bearing wall with a beam, plus the engineer", () => {
    expect(wall.cost!.range.low).toBe(2000 + 1500);
    expect(wall.cost!.range.high).toBe(30000 + 5000);
    expect(wall.cost!.counted).toBe(true);
  });
  it("scales with the opening length", () => {
    const wide = get(run([change({ kind: "wall", target: "back wall", detail: "open it", quantities: { lengthFt: 20 } })]), "wall")!;
    expect(wide.cost!.range.high).toBe(30000 * 2 + 5000);
  });
  it("an exterior or demising wall is a likely blocker", () => {
    const ext = get(run([change({ kind: "wall", target: "demising wall to suite 106", detail: "remove" })]), "wall")!;
    expect(ext.status).toBe("likely-blocker");
  });
  it("sends the project through structural plan review", () => {
    expect(a.permits.map((p) => p.id)).toEqual(expect.arrayContaining(["building", "structural"]));
    expect(a.permits.find((p) => p.id === "structural")!.neededBy).toContain("wall");
  });
});

describe("ceiling", () => {
  it("lowering to 10 ft in a 17 ft room needs sprinkler heads relocated", () => {
    const a = run([change({ kind: "ceiling", target: "Main Dining Room", detail: "drop the ceiling to 10 ft", quantities: { heightFt: 10 } })]);
    const c = get(a, "ceiling")!;
    expect(c.status).toBe("needs-professional");
    expect(c.detail).toMatch(/17 ft/);
    expect(c.detail).toMatch(/sprinkler/i);
    // 1,468 SF / 130 SF per head = 12 heads at $250-600, plus $2-6/SF for ducts and diffusers
    expect(c.cost!.range.low).toBeCloseTo(12 * 250 + 1468.2 * 2, 0);
    expect(c.cost!.range.high).toBeCloseTo(12 * 600 + 1468.2 * 6, 0);
    expect(a.lines[0].range!.low).toBeCloseTo(1468.2 * 5, 0);
  });
  it("below 7 ft 6 in is a likely blocker", () => {
    const c = get(run([change({ kind: "ceiling", target: "dining room", detail: "drop to 7 ft", quantities: { heightFt: 7 } })]), "ceiling")!;
    expect(c.status).toBe("likely-blocker");
    expect(c.citations.some((x) => x.code === "IBC 1208.2")).toBe(true);
  });
  it("raising past the measured room height is a likely blocker", () => {
    const c = get(run([change({ kind: "ceiling", target: "Storage", detail: "raise to 20 ft", quantities: { heightFt: 20 } })]), "ceiling")!;
    expect(c.status).toBe("likely-blocker");
  });
});

describe("hood and grease", () => {
  const fryer = change({ kind: "equipment", target: "cook line", detail: "add a fryer and a flat-top grill", involves: ["grease-cooking", "gas-appliance"], quantities: { count: 2 } });

  it("an existing hood is likely fine and only needs re-certifying", () => {
    const hood = get(run([fryer]), "hood")!;
    expect(hood.status).toBe("likely-fine");
    expect(hood.cost!.range).toMatchObject({ low: 800, high: 3500 });
  });
  it("no hood: a Type I hood with a roof path, $35k-80k, cited to IMC 507 and NFPA 96", () => {
    const site = variant((s) => {
      s.findings = s.findings.filter((f) => f.kind !== "hood");
      s.findings.push({ id: "x", kind: "hood", status: "absent", confidence: 0.9, evidence: "No hood.", source: "matterport-vision" });
    });
    const hood = get(run([fryer], site), "hood")!;
    expect(hood.status).toBe("needs-professional");
    expect(hood.cost!.range).toMatchObject({ low: 35000, high: 80000 });
    expect(hood.cost!.counted).toBe(false); // the X-Ray already carries the hood line
    expect(hood.detail).toMatch(/18 in/);
    expect(hood.detail).toMatch(/roof/i);
    expect(hood.citations.map((c) => c.code)).toEqual(expect.arrayContaining(["IMC 507.2", "NFPA 96"]));
  });
  it("no hood under three or more floors is a likely blocker", () => {
    const site = variant((s) => {
      s.findings = s.findings.filter((f) => f.kind !== "hood");
      s.stories = 5;
    });
    expect(get(run([fryer], site), "hood")!.status).toBe("likely-blocker");
  });
  it("an unconfirmed grease interceptor needs a plumber; in-ground for a full kitchen, under-sink for a cafe", () => {
    const g = get(run([fryer]), "grease")!;
    expect(g.status).toBe("needs-professional");
    expect(g.cost!.range).toMatchObject({ low: 15000, high: 45000 });
    const cafe = assess({ site: base, brief: { ...brief, concept: "cafe" }, changes: [change({ kind: "equipment", target: "counter", detail: "add an espresso machine and a three-compartment sink", involves: ["plumbing-fixture"] })] });
    expect(get(cafe, "grease")!.cost!.range).toMatchObject({ low: 1500, high: 5000 });
  });
  it("gas and electrical capacity are checked when appliances are added", () => {
    const a = run([fryer]);
    expect(get(a, "gas")!.status).toBe("needs-professional");
    expect(get(a, "electrical")!.status).toBe("needs-professional");
    expect(get(a, "electrical")!.citations[0].code).toBe("NEC 220");
  });
});

describe("occupant load, egress and restrooms", () => {
  it("counts 15 net SF per person in dining and 200 in the kitchen", () => {
    const o = occupantLoad(base, []);
    // 2,454 SF scan: 60% dining = 1,472.4 SF -> 99; 40% kitchen = 981.6 SF -> 5
    expect(o.load).toBe(99 + 5);
    expect(o.occupancy).toBe("A-2");
    expect(o.exitsRequired).toBe(2);
    expect(o.sprinklersRequired).toBe(true);
  });
  it("49 or fewer stays B with one exit", () => {
    const small = variant((s) => {
      s.matterport!.areaSf = 1000;
    });
    const o = occupantLoad(small, []);
    expect(o.load).toBe(40 + 2);
    expect(o.occupancy).toBe("B");
    expect(o.exitsRequired).toBe(1);
  });
  it("a patio adds occupants and triggers egress and restroom checks", () => {
    const patio = change({ kind: "exterior", target: "front sidewalk", detail: "add a patio with 16 seats", involves: ["patio", "seating"], quantities: { areaSf: 300, seats: 16 } });
    const a = run([patio]);
    expect(a.occupant.load).toBe(a.occupant.baseline + 20);
    const egress = get(a, "egress")!;
    expect(egress.status).toBe("needs-professional");
    expect(egress.detail).toMatch(/two exits/i);
    const rest = get(a, "restrooms")!;
    // 124 occupants: 62 of each sex, one water closet per 75 -> 2 water closets
    expect(rest.detail).toMatch(/2 water closets/);
    expect(a.permits.map((p) => p.id)).toContain("patio");
  });
  it("finishes alone trigger no checks and no permits", () => {
    const a = run([change({ kind: "finish", target: "all walls", detail: "exposed brick veneer" }), change({ id: "c2", kind: "finish", target: "floors", detail: "polished concrete floors" })]);
    expect(a.checks).toHaveLength(0);
    expect(a.permits).toHaveLength(0);
    expect(a.worst).toBe("likely-fine");
    expect(a.cost.total.low).toBeGreaterThan(0);
    expect(a.cost.total).toEqual(a.cost.changes);
  });
});

describe("plumbing moves", () => {
  it("prices slab trenching per linear foot plus a slab scan", () => {
    const bar = change({ kind: "layout", target: "window wall", detail: "add a bar along the window", involves: ["plumbing-fixture", "alcohol"], quantities: { runFt: 30 } });
    const p = get(run([bar]), "plumbing")!;
    expect(p.status).toBe("needs-professional");
    expect(p.cost!.range.low).toBe(30 * 75 + 500);
    expect(p.cost!.range.high).toBe(30 * 200 + 1500);
    expect(p.detail).toMatch(/30 ft/);
  });
  it("reads plumbed fixtures from layout ops", () => {
    const layout = autoLayout(base, brief);
    const ops = [{ op: "add" as const, type: "bar-counter" as const, count: 1, near: "window" as const }];
    const after = applyOps(layout, ops, { site: base, brief }).layout;
    const a = assess({ site: base, brief, layout: after, layoutOps: ops, changes: [change({ kind: "layout", target: "window", detail: "a long counter with stools" })] });
    expect(get(a, "plumbing")).toBeDefined();
  });
});

describe("change of use", () => {
  it("a former restaurant becoming a coffee shop is likely fine", () => {
    const a = run([change({ kind: "use", target: "whole space", detail: "make it a coffee shop", concept: "cafe" })]);
    expect(get(a, "use")!.status).toBe("likely-fine");
  });
  it("a space with no restaurant history needs a new certificate of occupancy and plan check", () => {
    const site = variant((s) => {
      s.findings = [];
      s.tenantHistory = [];
    });
    const a = run([change({ kind: "use", target: "whole space", detail: "make it a coffee shop", concept: "cafe" })], site);
    const use = get(a, "use")!;
    expect(use.status).toBe("needs-professional");
    expect(use.cost!.range).toMatchObject({ low: 3000, high: 15000 });
    expect(use.cost!.counted).toBe(true);
    expect(a.permits.find((p) => p.id === "occupancy")!.weeks).toEqual({ low: 4, high: 12 });
  });
  it("uses the Los Angeles pack for an LA site, with the alcohol approval for a bar", () => {
    const la = variant((s) => {
      s.city = "Los Angeles";
      s.state = "CA";
    });
    const a = run([change({ kind: "use", target: "whole space", detail: "make it a cocktail bar", concept: "bar", involves: ["alcohol"] })], la);
    expect(a.codeBasis).toMatch(/California/);
    const alcohol = a.permits.find((p) => p.id === "alcohol")!;
    expect(alcohol.weeks).toEqual({ low: 16, high: 36 });
    expect(a.time.permitWeeks.high).toBe(36);
    expect(get(a, "use")!.status).toBe("needs-professional");
  });
});

describe("totals", () => {
  it("sums only counted costs, and a disabled change drops out", () => {
    const wall = change({ kind: "wall", target: "back wall", detail: "open 10 ft" });
    const brick = change({ id: "c2", kind: "finish", target: "walls", detail: "brick", quantities: { areaSf: 1000 } });
    const a = run([wall, brick]);
    expect(a.cost.changes.low).toBe(12 * 1000);
    expect(a.cost.total.low).toBe(a.cost.changes.low + a.cost.checks.low);
    expect(a.cost.checks.low).toBe(a.checks.filter((c) => c.cost?.counted).reduce((t, c) => t + c.cost!.range.low, 0));
    const off = run([{ ...wall, enabled: false }, brick]);
    expect(get(off, "wall")).toBeUndefined();
    expect(off.worst).toBe("likely-fine");
  });
  it("permits run side by side: the longest sets the wait, then the work follows", () => {
    const a = run([change({ kind: "wall", target: "back wall", detail: "open 10 ft" })]);
    expect(a.time.permitWeeks).toMatchObject({ low: 4, high: 10 });
    expect(a.time.totalWeeks.low).toBe(a.time.permitWeeks.low + a.time.workWeeks.low);
    expect(a.worst).toBe("needs-professional");
  });
  it("every check carries a citation with a source, and every cost a source label", () => {
    const a = run([
      change({ kind: "wall", target: "w", detail: "open" }),
      change({ id: "c2", kind: "equipment", target: "line", detail: "fryer", involves: ["grease-cooking", "gas-appliance"] }),
      change({ id: "c3", kind: "ceiling", target: "dining", detail: "drop", quantities: { heightFt: 10 } }),
      change({ id: "c4", kind: "use", target: "space", detail: "bar", concept: "bar" }),
      change({ id: "c5", kind: "exterior", target: "front", detail: "patio", involves: ["patio"] }),
    ]);
    expect(a.checks.length).toBeGreaterThanOrEqual(9);
    for (const c of a.checks) {
      expect(c.citations.length, c.id).toBeGreaterThan(0);
      for (const x of c.citations) expect(x.source.label).toBeTruthy();
      if (c.cost) expect(c.cost.source.label).toBeTruthy();
      expect(c.triggeredBy.length, c.id).toBeGreaterThan(0);
    }
  });
});

describe("change lines", () => {
  it("storefront is priced per linear foot, with a default width", () => {
    const l = changeLine(change({ kind: "storefront", target: "front", detail: "new glass storefront" }), base);
    expect(l.range).toMatchObject({ low: 24 * 700, high: 24 * 1600 });
    expect(l.basis).toMatch(/24 ft/);
  });
  it("a wall has no line price: it is priced in the wall check", () => {
    expect(changeLine(change({ kind: "wall", target: "w", detail: "open" }), base).range).toBeNull();
  });
});
