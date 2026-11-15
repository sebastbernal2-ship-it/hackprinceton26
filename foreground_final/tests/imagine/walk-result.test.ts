import { describe, expect, it } from "vitest";
import type { Assessment, Check } from "@/lib/feasibility/types";
import { summarizeImagine, toneFor } from "@/lib/imagine/walk-result";

const r = (low: number, mid: number, high: number) => ({ low, mid, high });
const check = (id: string, status: Check["status"], triggered: boolean, withCite = true): Check =>
  ({
    id,
    label: id,
    status,
    summary: `${id} summary`,
    detail: "",
    cost: null,
    citations: withCite ? [{ code: "IBC 1004", text: "t", source: { label: "Houston code", url: "https://x.test" } }] : [],
    permits: [],
    weeks: null,
    triggeredBy: triggered ? ["c1"] : [],
  }) as unknown as Check;

describe("toneFor", () => {
  it("reads a negative delta as saved", () => expect(toneFor(r(-9000, -5000, -2000), "likely-fine", 100_000)).toBe("saved"));
  it("reads a blocker as needed regardless of size", () => expect(toneFor(r(100, 200, 300), "likely-blocker", 100_000)).toBe("needed"));
  it("reads zero as info", () => expect(toneFor(r(0, 0, 0), "likely-fine", 100_000)).toBe("info"));
  it("scales with the budget", () => {
    expect(toneFor(r(8000, 12_000, 16_000), "likely-fine", 100_000)).toBe("needed");
    expect(toneFor(r(1000, 2000, 3000), "likely-fine", 100_000)).toBe("maybe");
  });
  it("falls back to an absolute line without a budget", () => {
    expect(toneFor(r(20_000, 30_000, 40_000), "likely-fine")).toBe("needed");
    expect(toneFor(r(1000, 2000, 3000), "likely-fine")).toBe("maybe");
  });
});

describe("summarizeImagine", () => {
  const a = {
    checks: [check("gas", "likely-fine", false), check("egress", "needs-professional", true), check("hood", "likely-blocker", true, false)],
    time: { permitWeeks: r(2.2, 5, 6.4) },
    worst: "likely-blocker",
  } as unknown as Assessment;
  it("keeps triggered or flagged checks, worst first, with the first citation", () => {
    const s = summarizeImagine(a, r(1000, 2000, 3000), 50_000);
    expect(s.checks.map((c) => c.id)).toEqual(["hood", "egress"]);
    expect(s.checks[0].citation).toBeUndefined();
    expect(s.checks[1].citation).toEqual({ code: "IBC 1004", label: "Houston code", url: "https://x.test" });
    expect(s.permitWeeks).toEqual({ low: 2, high: 6 });
    expect(s.costDeltaUsd).toEqual({ low: 1000, high: 3000 });
    expect(s.tone).toBe("needed");
  });
  it("drops permit weeks when none apply", () => {
    const s = summarizeImagine({ ...a, time: { permitWeeks: r(0, 0, 0) } } as unknown as Assessment, r(0, 0, 0));
    expect(s.permitWeeks).toBeNull();
  });
});
