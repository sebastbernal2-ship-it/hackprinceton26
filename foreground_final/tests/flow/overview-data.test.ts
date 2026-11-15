import { describe, expect, it } from "vitest";
import { budgetWords, moneyScale, tenantBars, weeksToOpen } from "@/components/flow/overview/data";
import type { Tenancy } from "@/lib/sites/schema";

const t = (o: Partial<Tenancy>): Tenancy => ({ name: "A", industry: null, isFood: true, moveIn: "2015-01-01", moveOut: "2018-01-01", years: 3, sameSuite: false, current: false, outcome: "unknown", ...o });

describe("overview data", () => {
  it("converts months to weeks", () => {
    expect(weeksToOpen({ months: { low: 3, mid: 4, high: 6 } })).toEqual({ low: 13, high: 26 });
  });
  it("words the budget gap with its sign", () => {
    expect(budgetWords({ low: 300, mid: 350, high: 400 }, 250)?.tone).toBe("needed");
    expect(budgetWords({ low: 100, mid: 150, high: 200 }, 250)?.tone).toBe("saved");
    expect(budgetWords({ low: 200, mid: 250, high: 300 }, 250)?.tone).toBe("maybe");
    expect(budgetWords({ low: 1, mid: 2, high: 3 }, undefined)).toBeNull();
  });
  it("scales the budget marker onto the same axis", () => {
    const s = moneyScale({ low: 100, mid: 150, high: 200 }, 300);
    expect(s.budget).toBeGreaterThan(s.high);
    expect(moneyScale({ low: 1, mid: 2, high: 3 }, undefined).budget).toBeNull();
  });
  it("sizes tenant bars by years, newest first, and keeps unknown lengths honest", () => {
    const { bars, more } = tenantBars([t({ name: "Old", moveIn: "2001-01-01", years: 10 }), t({ name: "New", moveIn: "2019-01-01", years: 2 }), t({ name: "Mystery", moveIn: "2010-01-01", years: null })], 2);
    expect(bars.map((b) => b.name)).toEqual(["New", "Mystery"]);
    expect(more).toBe(1);
    expect(bars[1].years).toBeNull();
  });
});

import { checkedIds, mailtoHref, nextSteps, sealLine } from "@/components/flow/deal/data";
import { fillFrame, zeroCrossing } from "@/components/flow/numbers/data";
import type { Ask } from "@/lib/outputs/ask-list";

describe("deal data", () => {
  const timeToOpen = { months: { low: 3, mid: 4, high: 6 }, deadRentUsd: { low: 1, mid: 2, high: 3 }, basis: "Second-generation space" };
  it("orders the timeline: offer, permits, build, open", () => {
    const steps = nextSteps(
      {
        city: "Houston",
        permits: [{ id: "p1", label: "Health permit", agency: "City health dept", weeks: { low: 2, high: 4 }, source: { label: "City pack" }, neededBy: [] }],
        time: { permitWeeks: { low: 2, mid: 3, high: 4 }, workWeeks: { low: 6, mid: 8, high: 10 }, totalWeeks: { low: 8, mid: 11, high: 14 }, basis: "Foreground estimate" },
      },
      timeToOpen,
    );
    expect(steps.map((s) => s.id)).toEqual(["offer", "p1", "build", "open"]);
    expect(steps[3].weeks).toEqual({ low: 13, high: 26 });
  });
  it("builds the seal line from state and checks asks", () => {
    expect(sealLine({ address: "1 Test St", seats: 40, total: { low: 100_000, mid: 120_000, high: 140_000 }, timeToOpen })).toBe("1 Test St - 40 seats - all-in $100k – $140k - open in ~13 to 26 weeks");
    const asks = [{ id: "a" }, { id: "b" }] as Ask[];
    expect(checkedIds(asks, new Set(["a"]))).toEqual(["b"]);
  });
  it("encodes the letter in a mailto link and refuses an oversize one", () => {
    expect(mailtoHref("Hi there", "a&b")).toBe("mailto:?subject=Hi%20there&body=a%26b");
    expect(mailtoHref("s", "x".repeat(7000))).toBeNull();
  });
});

describe("numbers data", () => {
  it("finds where a series crosses zero", () => {
    expect(zeroCrossing([-10, 10, 20])).toBe(0.5);
    expect(zeroCrossing([5, 6, 7])).toBeNull();
  });
  it("plays a day: guests wait, sit, and are counted", () => {
    const sim = {
      minutes: 100, openHour: 11, dwell: 30, patience: 10, needed: 3, served: 2, walked: 1, peakQueue: 1, turns: 2, seats: 1,
      guests: [
        { arrive: 0, seat: 0, seatAt: 0, leaveAt: 30 },
        { arrive: 5, seat: 0, seatAt: 30, leaveAt: 60 },
        { arrive: 6, seat: -1, seatAt: 16, leaveAt: -1 },
      ],
    };
    const layout = { entry: [0, 0] as [number, number], items: [{ id: "t", type: "two-top" as const, x: 5, y: 5, rotation: 0 as const, w: 0.8, d: 1.6 }] };
    const early = fillFrame(sim, layout, 10);
    expect(early.seated).toBe(1);
    expect(early.waiting).toBe(2);
    const late = fillFrame(sim, layout, 99);
    expect(late.served).toBe(2);
    expect(late.walked).toBe(1);
    expect(late.seated).toBe(0);
  });
});
