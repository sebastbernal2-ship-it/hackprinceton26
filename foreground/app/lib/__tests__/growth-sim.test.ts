import { describe, expect, it } from "vitest";
import { ALL_SEATS, net, seatsForStage, spawn, staticCrowd, STAGES, step, fmtK, type Person } from "../growth-sim";

const rng = () => 0.3;

describe("growth sim", () => {
  it("seat counts match the stage table", () => {
    STAGES.forEach((s, i) => expect(seatsForStage(i)).toHaveLength(s.seats));
    expect(new Set(ALL_SEATS.map((s) => s.id)).size).toBe(ALL_SEATS.length);
  });
  it("stages only grow and ranges are ordered", () => {
    STAGES.forEach((s, i) => {
      if (i) { expect(s.seats).toBeGreaterThan(STAGES[i - 1].seats); expect(s.month).toBeGreaterThan(STAGES[i - 1].month); }
      for (const r of [s.footfall, s.revenue, s.cost, s.capex]) expect(r.low).toBeLessThan(r.high);
    });
    expect(net(STAGES[0]).low).toBeLessThan(0);
  });
  it("a guest walks in, sits, then leaves and is removed", () => {
    let list: Person[] = [];
    const p = spawn(list, 0, 1, () => 0.5);
    expect(p?.seat).toBeTruthy();
    list = [p!];
    let sawSit = false;
    for (let i = 0; i < 4000 && list.length; i++) { list = step(list, 0.05, 0, () => 0.5); if (list[0]?.phase === "sit") sawSit = true; }
    expect(sawSit).toBe(true);
    expect(list).toHaveLength(0);
  });
  it("never double-books a seat and drops guests whose zone disappears", () => {
    let list: Person[] = [];
    for (let i = 0; i < 40; i++) { const p = spawn(list, 3, i, Math.random); if (p) list = [...list, p]; }
    const seats = list.map((p) => p.seat).filter(Boolean);
    expect(new Set(seats).size).toBe(seats.length);
    expect(step(list, 0.01, 0, rng).every((p) => p.seat === null || p.seat.startsWith("cafe"))).toBe(true);
  });
  it("static crowd fits and formats money", () => {
    expect(staticCrowd(2).length).toBeLessThan(seatsForStage(2).length);
    expect(fmtK(22000)).toBe("$22k");
    expect(fmtK(-4000)).toBe("-$4k");
  });
});
