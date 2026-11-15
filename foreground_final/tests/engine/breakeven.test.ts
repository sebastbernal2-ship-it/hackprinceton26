import { describe, expect, it } from "vitest";

import { fitSeats, operatedSeats } from "@/lib/engine/seats";
import { occupancy } from "@/lib/engine/occupancy";
import benchmarks from "@/data/benchmarks.json";
import { makeSite } from "./fixtures";

describe("occupancy", () => {
  it("adds the city's NNN extras to rent for a NNN lease", () => {
    const o = occupancy(makeSite({ space: { sf: 1800, rentPerSfYr: 30, serviceType: "NNN" } }));
    const x = benchmarks.nnnExtrasPerSfYr.Houston;
    expect(o.extrasPerSfYr).toBe(x.mid);
    expect(o.annualUsd).toEqual({ low: 1800 * (30 + x.low), mid: 1800 * (30 + x.mid), high: 1800 * (30 + x.high) });
    expect(o.basis).toMatch(/NNN/);
    expect(o.basis).toMatch(/estimate/i);
  });

  it("uses Los Angeles extras for a Los Angeles site", () => {
    const o = occupancy(makeSite({ city: "Los Angeles", state: "CA" }));
    expect(o.extrasPerSfYr).toBe(benchmarks.nnnExtrasPerSfYr["Los Angeles"].mid);
  });

  it("adds nothing for a full-service gross lease", () => {
    const o = occupancy(makeSite({ space: { sf: 1200, rentPerSfYr: 17.4, serviceType: "FSG" } }));
    expect(o.extrasPerSfYr).toBe(0);
    expect(o.annualUsd).toEqual({ low: 20880, mid: 20880, high: 20880 });
  });

  it("treats an unquoted service type as NNN and says so", () => {
    const o = occupancy(makeSite({ space: { serviceType: null } }));
    expect(o.extrasPerSfYr).toBeGreaterThan(0);
    expect(o.basis).toMatch(/not quoted/i);
  });

  it("falls back to a labelled city rent estimate when no rent is quoted", () => {
    const o = occupancy(makeSite({ space: { rentPerSfYr: null, serviceType: "FSG", sf: 1000 } }));
    expect(o.annualUsd.mid).toBe(1000 * benchmarks.fallbackRentPerSfYr.Houston.value);
    expect(o.basis).toMatch(/no rent quoted/i);
  });
});

describe("fitSeats", () => {
  it("fits seats from space SF, the dining share and SF per seat for the concept", () => {
    const fit = fitSeats(makeSite({ space: { sf: 1800 } }), "fast-casual");
    expect(fit.seats).toBe(Math.floor((1800 * 0.6) / 12.5));
    expect(fit.basis).toMatch(/1,800 SF/);
    expect(fit.basis).toMatch(/CoStar/);
  });

  it("keeps seats as what the space fits and names the seats break-even will use in the basis", () => {
    const site = makeSite({ space: { sf: 1800 } });
    const fit = fitSeats(site, "fast-casual", 40);
    expect(fit.seats).toBe(86);
    expect(fit.basis).toMatch(/fits 86 seats/i);
    expect(fit.basis).toMatch(/break-even uses the 40 seats you want/i);
    expect(operatedSeats(fit, { concept: "fast-casual", seats: 40 })).toBe(40);
    expect(operatedSeats(fit, { concept: "fast-casual", seats: 120 })).toBe(86);
    expect(operatedSeats(fit, { concept: "fast-casual" })).toBe(86);
    expect(fitSeats(site, "fast-casual", 120).basis).toMatch(/break-even uses all 86, fewer than the 120 you want/i);
  });

  it("fits fewer seats for full service than for quick service", () => {
    const site = makeSite();
    expect(fitSeats(site, "full-service").seats).toBeLessThan(fitSeats(site, "quick-service").seats);
  });

  it("prefers the Matterport scan area when the scan is of the exact suite", () => {
    const site = makeSite({
      matterport: { modelId: "m", defurnishedViewId: null, scanOfExactSuite: true, areaSf: 1500 },
    });
    const fit = fitSeats(site, "fast-casual");
    expect(fit.seats).toBe(Math.floor((1500 * 0.6) / 12.5));
    expect(fit.basis).toMatch(/Matterport/);
  });

  it("ignores the scan area when the scan shows a neighbouring suite", () => {
    const site = makeSite({
      matterport: { modelId: "m", defurnishedViewId: null, scanOfExactSuite: false, areaSf: 1500 },
    });
    expect(fitSeats(site, "fast-casual").seats).toBe(Math.floor((1800 * 0.6) / 12.5));
  });
});

