import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@/lib/agent/events";
import {
  createRecorder, findClosestReplay, isCompleteRun, loadReplays, matchScore, playReplay, saveReplay, slugify, type Replay,
} from "@/lib/agent/replay";

const result: AgentEvent = { type: "result", ranking: [{ siteId: "800827", rank: 1, oneLineReason: "1.5 turns a day.", topRisk: "No hood." }] };

function makeReplay(query: string, events: [number, AgentEvent][]): Replay {
  return { version: 1, slug: slugify(query), query, recordedAt: "2026-11-13T00:00:00.000Z", durationMs: events.at(-1)?.[0] ?? 0, events: events.map(([t, event]) => ({ t, event })) };
}

const taqueria = makeReplay("fast-casual taqueria, 40 seats, $150k budget, Houston", [
  [0, { type: "brief", brief: { concept: "fast-casual" }, source: "regex" }],
  [1000, { type: "thought", text: "Looking in Houston." }],
  [1000, { type: "plan", items: [{ content: "Find candidates", status: "in_progress" }] }],
  [5000, result],
  [5200, { type: "done", durationMs: 5200 }],
]);
const cafe = makeReplay("specialty coffee cafe, 25 seats, $90k, Los Angeles", [[0, result], [10, { type: "done" }]]);

async function play(replay: Replay, opts: { speed?: number; maxGapMs?: number } = {}) {
  const sleeps: number[] = [];
  const events: AgentEvent[] = [];
  for await (const e of playReplay(replay, { ...opts, sleep: async (ms) => { sleeps.push(ms); } })) events.push(e);
  return { sleeps, events };
}

describe("recorder", () => {
  it("stamps events with time since the run started", () => {
    let now = 1_000;
    const rec = createRecorder("Taqueria, 40 seats — Houston!", () => now);
    rec.push({ type: "thought", text: "a" });
    now = 1_750;
    rec.push(result);
    now = 2_000;
    rec.push({ type: "done" });
    const doc = rec.finish();
    expect(doc.events.map((e) => e.t)).toEqual([0, 750, 1000]);
    expect(doc).toMatchObject({ version: 1, slug: "taqueria-40-seats-houston", durationMs: 1000, query: "Taqueria, 40 seats — Houston!" });
    expect(isCompleteRun(doc)).toBe(true);
  });

  it("does not count failed, fallback or unfinished runs as complete", () => {
    expect(isCompleteRun(makeReplay("q", [[0, result]]))).toBe(false);
    expect(isCompleteRun(makeReplay("q", [[0, { ...result, fallback: true } as AgentEvent], [1, { type: "done" }]]))).toBe(false);
    expect(isCompleteRun(makeReplay("q", [[0, result], [1, { type: "error", message: "x" }], [2, { type: "done" }]]))).toBe(false);
  });
});

describe("slugify", () => {
  it("makes safe file names", () => {
    expect(slugify("fast-casual taqueria, 40 seats, $150k budget, Houston")).toBe("fast-casual-taqueria-40-seats-150k-budget-houston");
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("???")).toBe("run");
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("playReplay", () => {
  it("keeps the original gaps and order", async () => {
    const { sleeps, events } = await play(taqueria);
    expect(sleeps).toEqual([1000, 4000, 200]);
    expect(events).toEqual(taqueria.events.map((e) => e.event));
  });

  it("plays twice as fast at speed 2", async () => {
    expect((await play(taqueria, { speed: 2 })).sleeps).toEqual([500, 2000, 100]);
  });

  it("caps long waits when asked", async () => {
    expect((await play(taqueria, { maxGapMs: 800 })).sleeps).toEqual([800, 800, 200]);
  });

  it("ignores a nonsense speed", async () => {
    expect((await play(taqueria, { speed: 0 })).sleeps).toEqual([1000, 4000, 200]);
  });

  it("stops when aborted", async () => {
    const abort = new AbortController();
    const events: AgentEvent[] = [];
    for await (const e of playReplay(taqueria, { signal: abort.signal, sleep: async () => {} })) {
      events.push(e);
      if (events.length === 2) abort.abort();
    }
    expect(events).toHaveLength(2);
  });

  it("really waits with the default timer", async () => {
    const quick = makeReplay("q", [[0, result], [40, { type: "done" }]]);
    const t0 = Date.now();
    for await (const e of playReplay(quick)) void e;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
  });
});

describe("finding the closest replay", () => {
  it("matches on city first", () => {
    expect(findClosestReplay("burger joint in Houston, 30 seats", [taqueria, cafe])).toBe(taqueria);
    expect(findClosestReplay("ramen shop, Koreatown LA", [taqueria, cafe])).toBe(cafe);
  });

  it("uses concept and shared words when no city is given", () => {
    expect(findClosestReplay("a small coffee cafe", [taqueria, cafe])).toBe(cafe);
    expect(findClosestReplay("taqueria", [taqueria, cafe])).toBe(taqueria);
    expect(matchScore(taqueria.query, taqueria.query)).toBeGreaterThan(matchScore("taqueria in Houston", taqueria.query));
  });

  it("returns something for any query when replays exist, and null when none do", () => {
    expect(findClosestReplay("zzz", [taqueria, cafe])).not.toBeNull();
    expect(findClosestReplay("zzz", [])).toBeNull();
  });
});

describe("saving and loading", () => {
  it("round-trips through data/replays-style files and skips broken ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "fg-replays-"));
    const file = saveReplay(taqueria, dir);
    expect(file.endsWith("fast-casual-taqueria-40-seats-150k-budget-houston.json")).toBe(true);
    writeFileSync(join(dir, "broken.json"), "{ not json");
    writeFileSync(join(dir, "wrong-shape.json"), JSON.stringify({ hello: "world" }));
    expect(loadReplays(dir)).toEqual([taqueria]);
    expect(loadReplays(join(dir, "missing"))).toEqual([]);
  });
});

describe("recorded demo runs", () => {
  const replays = loadReplays();

  it.skipIf(replays.length === 0)("each has a plan, parallel site checks, a change of mind and a ranking", () => {
    for (const r of replays) {
      const events = r.events.map((e) => e.event);
      expect(isCompleteRun(r), r.slug).toBe(true);
      expect(events.some((e) => e.type === "plan"), r.slug).toBe(true);
      expect(events.filter((e) => e.type === "subagent" && e.status === "done").length, r.slug).toBeGreaterThanOrEqual(4);
      expect(events.some((e) => e.type === "decision" && e.action !== "keep"), r.slug).toBe(true);
      const ranking = events.find((e) => e.type === "result");
      expect(ranking?.type === "result" && ranking.ranking.length, r.slug).toBeGreaterThanOrEqual(3);
      expect(r.events.map((e) => e.t), r.slug).toEqual([...r.events.map((e) => e.t)].sort((a, b) => a - b));
    }
  });
});
