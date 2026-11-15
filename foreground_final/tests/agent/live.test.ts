import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Live smoke run against the real models. Skipped unless FOREGROUND_LIVE=1:
 *   FOREGROUND_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/agent/live.test.ts
 * FOREGROUND_LIVE_FAKE_ENGINE=1 swaps in the test engine; FOREGROUND_LIVE_DUMP=<file> saves the raw chunks;
 * FOREGROUND_LIVE_RECORD=1 saves the run to data/replays/<slug>.json (same file the route writes with FOREGROUND_RECORD=1).
 */
const live = process.env.FOREGROUND_LIVE === "1";

vi.mock("@/lib/engine", async (importOriginal) => {
  if (process.env.FOREGROUND_LIVE_FAKE_ENGINE !== "1") return importOriginal();
  const { fakeAnalysis } = await import("./helpers");
  return { analyzeSite: fakeAnalysis };
});

describe.skipIf(!live)("live agent run", () => {
  it("plans, inspects in parallel, changes its mind and ranks", async () => {
    const { runAgent } = await import("@/lib/agent/agent");
    const { createToolkit } = await import("@/lib/agent/tools");
    const { parseBrief } = await import("@/lib/agent/brief");
    const query = process.env.FOREGROUND_LIVE_QUERY ?? "fast-casual taqueria, 40 seats, $150k budget, Houston";
    const t0 = Date.now();
    const raw: unknown[] = [];
    const { brief } = await parseBrief(query);
    const toolkit = createToolkit(brief);
    const events = [];
    const { createRecorder, isCompleteRun, saveReplay } = await import("@/lib/agent/replay");
    const recorder = createRecorder(query);
    recorder.push({ type: "brief", brief, source: "llm" });
    for await (const event of runAgent(query, {
      toolkit,
      streamFactory: process.env.FOREGROUND_LIVE_DUMP
        ? async (tk, input, signal) => {
            const { createForegroundAgent } = await import("@/lib/agent/agent");
            const stream = await createForegroundAgent(tk).stream(
              { messages: [{ role: "user", content: input }] },
              { streamMode: ["updates", "custom"], subgraphs: true, signal, recursionLimit: 60 },
            );
            return (async function* () {
              for await (const chunk of stream as AsyncIterable<[string[], string, unknown]>) {
                raw.push({ t: Date.now() - t0, chunk: JSON.parse(JSON.stringify(chunk)) });
                yield chunk;
              }
            })();
          }
        : undefined,
    })) {
      events.push(event);
      if (event.type !== "brief") recorder.push(event);
      const { type, ...rest } = event;
      console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${type.padEnd(8)} ${JSON.stringify(rest).slice(0, 420)}`);
    }
    if (process.env.FOREGROUND_LIVE_DUMP) writeFileSync(join(process.cwd(), process.env.FOREGROUND_LIVE_DUMP), JSON.stringify(raw));
    const doc = recorder.finish();
    if (process.env.FOREGROUND_LIVE_RECORD === "1" && isCompleteRun(doc)) console.log("saved", saveReplay(doc));
    const types = events.map((e) => e.type);
    expect(types).toContain("plan");
    expect(events.filter((e) => e.type === "subagent" && e.status === "done").length).toBeGreaterThanOrEqual(4);
    expect(events.some((e) => e.type === "decision" && e.action !== "keep")).toBe(true);
    expect(events.some((e) => e.type === "result" && !e.fallback)).toBe(true);
    expect(types.at(-1)).toBe("done");
  }, 180_000);
});
