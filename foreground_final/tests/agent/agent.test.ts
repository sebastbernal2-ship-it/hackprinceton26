import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentEvent, RawChunk } from "@/lib/agent/events";

vi.mock("@/lib/engine", async () => {
  const { fakeAnalysis } = await import("./helpers");
  return { analyzeSite: fakeAnalysis };
});

import { runAgent } from "@/lib/agent/agent";
import { POST } from "@/app/api/agent/route";

const recorded: { t: number; chunk: RawChunk }[] = JSON.parse(readFileSync(join(__dirname, "fixtures", "raw-run.json"), "utf8"));
const brief = { concept: "fast-casual" as const, seats: 40, budgetUsd: 150_000, city: "Houston" as const };
const query = "fast-casual taqueria, 40 seats, $150k budget, Houston";

async function* feed(chunks: RawChunk[]) {
  for (const c of chunks) yield c;
}

async function collect(stream: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const e of stream) events.push(e);
  return events;
}

describe("runAgent (model replaced by recorded chunks)", () => {
  it("produces brief → plan → parallel site checks → change of mind → ranking → done", async () => {
    const events = await collect(runAgent(query, { brief, streamFactory: async () => feed(recorded.map((r) => r.chunk)) }));
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("brief");
    expect(types.at(-1)).toBe("done");
    expect(types.at(-2)).toBe("result");
    expect(types.filter((t) => t === "done")).toHaveLength(1);
    const order = ["plan", "subagent", "decision", "result"].map((t) => types.indexOf(t as AgentEvent["type"]));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(events.some((e) => e.type === "decision" && e.action !== "keep")).toBe(true);
    const result = events.find((e) => e.type === "result");
    expect(result?.type === "result" && !result.fallback && result.ranking.length >= 3).toBe(true);
  });

  it("attaches engine numbers to finished site checks and reports usage", async () => {
    const events = await collect(runAgent(query, { brief, streamFactory: async () => feed(recorded.map((r) => r.chunk)) }));
    const dones = events.filter((e) => e.type === "subagent" && e.status === "done");
    expect(dones).toHaveLength(6);
    for (const d of dones) {
      expect(d.type === "subagent" && d.numbers?.buildoutUsd.low).toBeGreaterThan(0);
    }
    const done = events.at(-1);
    expect(done?.type === "done" && done.usage?.modelCalls).toBeGreaterThan(0);
  });

  it("stops reading the model stream once the ranking is delivered", async () => {
    let pulled = 0;
    async function* counting() {
      for (const r of recorded) {
        pulled += 1;
        yield r.chunk;
      }
      for (let i = 0; i < 5; i += 1) {
        pulled += 1;
        yield [[], "updates", {}] as RawChunk;
      }
    }
    await collect(runAgent(query, { brief, streamFactory: async () => counting() }));
    expect(pulled).toBeLessThanOrEqual(recorded.length);
  });

  it("falls back to an engine-score ranking when the planner never submits one", async () => {
    const cut = recorded.map((r) => r.chunk).filter(([, mode]) => mode !== "custom");
    const events = await collect(runAgent(query, { brief, streamFactory: async () => feed(cut) }));
    const result = events.find((e) => e.type === "result");
    expect(result).toMatchObject({ type: "result", fallback: true });
    expect(result?.type === "result" && result.ranking).toHaveLength(5);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("reports a model failure as an error event, then still ranks and finishes", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const events = await collect(
      runAgent(query, {
        brief,
        streamFactory: async () =>
          (async function* () {
            yield recorded[0].chunk;
            throw new Error("overloaded");
          })(),
      }),
    );
    const types = events.map((e) => e.type);
    const error = events.find((e) => e.type === "error");
    expect(error?.type === "error" && error.message).toMatch(/stopped early/);
    expect(JSON.stringify(error)).not.toContain("overloaded");
    expect(logged).toHaveBeenCalledWith("[agent] run failed:", "overloaded");
    logged.mockRestore();
    expect(types.slice(-2)).toEqual(["result", "done"]);
  });

  it("ends quietly when the caller aborts", async () => {
    const abort = new AbortController();
    const events: AgentEvent[] = [];
    for await (const e of runAgent(query, { brief, signal: abort.signal, streamFactory: async () => feed(recorded.map((r) => r.chunk)) })) {
      events.push(e);
      if (e.type === "subagent") abort.abort();
    }
    expect(events.some((e) => e.type === "error" || e.type === "result")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });
});

describe("POST /api/agent", () => {
  const post = (body: unknown) =>
    POST(new Request("http://localhost/api/agent", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("rejects bad input", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ query: "a" })).status).toBe(400);
    const tooLong = await post({ query: "x".repeat(501) });
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: "Keep it under 500 characters." });
    expect((await post({ query: "taqueria in Houston", speed: 1000 })).status).toBe(400);
  });

  it("streams a recorded run as server-sent events in replay mode", async () => {
    const res = await post({ query, replay: true, speed: 20 });
    if (res.status === 503) return; // no replay recorded yet
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-foreground-mode")).toBe("replay");
    const text = await res.text();
    const types = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    expect(types).toContain("plan");
    expect(types).toContain("result");
    expect(types.at(-1)).toBe("done");
    const firstData = /^data: (.+)$/m.exec(text)?.[1];
    expect(() => JSON.parse(firstData ?? "")).not.toThrow();
  }, 30_000);
});
