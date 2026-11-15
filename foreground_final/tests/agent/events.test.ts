import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventMapper, customEvent, parseVerdict, siteIdFromText, toSse, type AgentEvent, type RawChunk } from "@/lib/agent/events";

/** Raw chunks recorded from a real deepagents run (planner + 6 parallel site-inspector subagents). */
const recorded: { t: number; chunk: RawChunk }[] = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "raw-run.json"), "utf8"),
);

function mapAll(chunks: RawChunk[]): AgentEvent[] {
  const mapper = createEventMapper();
  return chunks.flatMap((c) => mapper.map(c));
}

describe("mapping a recorded run", () => {
  const events = mapAll(recorded.map((r) => r.chunk));
  const of = <T extends AgentEvent["type"]>(type: T) => events.filter((e): e is Extract<AgentEvent, { type: T }> => e.type === type);

  it("starts with a plan and the site search", () => {
    const firstPlan = of("plan")[0];
    expect(firstPlan.items.length).toBeGreaterThanOrEqual(3);
    expect(firstPlan.items.every((i) => ["pending", "in_progress", "completed"].includes(i.status))).toBe(true);
    const firstTool = of("tool")[0];
    expect(firstTool).toMatchObject({ name: "search_sites", status: "start", agent: "planner" });
    expect(events.findIndex((e) => e.type === "plan")).toBeLessThan(events.findIndex((e) => e.type === "subagent"));
  });

  it("pairs every subagent start with a done that carries a verdict", () => {
    const starts = of("subagent").filter((e) => e.status === "start");
    const dones = of("subagent").filter((e) => e.status === "done");
    expect(starts).toHaveLength(6);
    expect(dones.map((d) => d.id).sort()).toEqual(starts.map((s) => s.id).sort());
    for (const d of dones) {
      expect(d.siteId).toMatch(/^\d+$/);
      expect(d.siteId).toBe(starts.find((s) => s.id === d.id)?.siteId);
      expect(d.verdict?.siteId).toBe(d.siteId);
      expect(["strong", "workable", "risky", "reject"]).toContain(d.verdict?.verdict);
      expect(d.verdict?.headline.length).toBeGreaterThan(10);
    }
  });

  it("runs the subagents in parallel: all start before any finishes", () => {
    const sub = of("subagent");
    const firstDone = sub.findIndex((e) => e.status === "done");
    expect(sub.slice(0, firstDone).filter((e) => e.status === "start")).toHaveLength(6);
  });

  it("attributes subagent tool calls to their site and pairs start with done", () => {
    const inspectorTools = of("tool").filter((e) => e.agent === "site-inspector" && e.status !== "progress");
    expect(inspectorTools.length).toBeGreaterThanOrEqual(24);
    for (const start of inspectorTools.filter((e) => e.status === "start")) {
      expect(start.siteId).toBe(start.args.siteId);
      const done = inspectorTools.find((e) => e.id === start.id && e.status === "done");
      expect(done?.summary).toBeTruthy();
    }
  });

  it("hides plumbing: no task, todo, decision, ranking or structured-output helper shows as a tool", () => {
    const names = new Set(of("tool").map((e) => e.name));
    expect([...names].sort()).toEqual(["analyze_site", "compare_sites", "inspect_site", "search_sites"]);
  });

  it("shows a visible change of mind and ends with the ranking", () => {
    const changes = of("decision").filter((d) => d.action !== "keep");
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes[0].reason).toMatch(/\d/);
    const result = of("result");
    expect(result).toHaveLength(1);
    expect(result[0].ranking.map((r) => r.rank)).toEqual(result[0].ranking.map((_, i) => i + 1));
    const dropped = of("decision").filter((d) => d.action === "drop").map((d) => d.siteId);
    expect(result[0].ranking.some((r) => dropped.includes(r.siteId))).toBe(false);
  });

  it("emits no duplicate tool starts and only planner prose as thoughts", () => {
    const starts = of("tool").filter((e) => e.status === "start").map((e) => e.id);
    expect(new Set(starts).size).toBe(starts.length);
    expect(of("thought").every((t) => !t.text.trim().startsWith("{"))).toBe(true);
  });

  it("counts token usage per model", () => {
    const mapper = createEventMapper();
    for (const r of recorded) mapper.map(r.chunk);
    const usage = mapper.usage();
    expect(usage.modelCalls).toBeGreaterThanOrEqual(10);
    expect(Object.keys(usage.byModel).sort()).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(usage.inputTokens).toBe(Object.values(usage.byModel).reduce((a, m) => a + m.inputTokens, 0));
  });
});

describe("mapper details", () => {
  const ai = (id: string, content: unknown, tool_calls: unknown[] = []) => ({ type: "ai", id, content, tool_calls });
  const toolMsg = (tool_call_id: string, name: string, content: string, status = "success") => ({ type: "tool", tool_call_id, name, content, status });
  const upd = (node: string, messages: unknown[], ns: string[] = []): RawChunk => [ns, "updates", { [node]: { messages } }];

  it("handles live message objects as well as serialized ones", () => {
    const events = mapAll([
      upd("model_request", [ai("m1", [{ type: "text", text: "Looking in Houston." }], [{ id: "c1", name: "search_sites", args: { city: "Houston" } }])]),
      upd("tools", [toolMsg("c1", "search_sites", JSON.stringify({ summary: "6 spaces" }))]),
    ]);
    expect(events).toEqual([
      { type: "thought", text: "Looking in Houston." },
      { type: "tool", id: "c1", name: "search_sites", args: { city: "Houston" }, status: "start", agent: "planner" },
      { type: "tool", id: "c1", name: "search_sites", args: { city: "Houston" }, status: "done", summary: "6 spaces", agent: "planner" },
    ]);
  });

  it("reads the site id from a task description and the verdict from fenced JSON", () => {
    const events = mapAll([
      upd("model_request", [ai("m1", "", [{ id: "t1", name: "task", args: { subagent_type: "site-inspector", description: "siteId: 1018657. Taqueria, 40 seats." } }])]),
      upd("tools", [toolMsg("t1", "task", '```json\n{"siteId":"1018657","verdict":"reject","headline":"$198k–$401k build-out.","topRisk":"Over budget.","positives":[],"risks":["Over budget."]}\n```')]),
    ]);
    expect(events[0]).toEqual({ type: "subagent", id: "t1", siteId: "1018657", status: "start" });
    expect(events[1]).toMatchObject({ type: "subagent", id: "t1", siteId: "1018657", status: "done", verdict: { verdict: "reject", topRisk: "Over budget." } });
  });

  it("marks failed tool calls, including ones normally hidden", () => {
    const events = mapAll([
      upd("model_request", [ai("m1", "", [{ id: "s1", name: "submit_ranking", args: {} }])]),
      upd("tools", [toolMsg("s1", "submit_ranking", "Error: invalid input", "error")]),
    ]);
    expect(events).toEqual([expect.objectContaining({ type: "tool", name: "submit_ranking", status: "error", summary: "Error: invalid input" })]);
  });

  it("does not repeat a message that appears in two updates", () => {
    const msg = ai("m1", "", [{ id: "c1", name: "inspect_site", args: { siteId: "1" } }]);
    const ns = ["tools:abc"];
    const events = mapAll([upd("model_request", [msg], ns), upd("model_request", [msg, ai("m2", '{"verdict":"risky"}')], ns)]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ agent: "site-inspector", siteId: "1" });
  });

  it("passes through custom events and ignores everything else", () => {
    const decision: AgentEvent = { type: "decision", siteId: "1", action: "drop", reason: "$210k against $150k." };
    expect(mapAll([[[], "custom", customEvent(decision)]])).toEqual([decision]);
    expect(mapAll([[[], "custom", { something: "else" }], [[], "custom", { foreground: { type: "nope" } }]])).toEqual([]);
    expect(mapAll([[[], "messages", [{ type: "ai", content: "tok" }, {}]], [[], "updates", { "SomeMiddleware.before_agent": {} }], [[], "updates", null]])).toEqual([]);
  });

  it("maps write_todos to a plan", () => {
    const events = mapAll([upd("model_request", [ai("m1", "", [{ id: "w1", name: "write_todos", args: { todos: [{ content: "Find candidates", status: "in_progress" }, { content: "Rank", status: "weird" }] } }])])]);
    expect(events).toEqual([{ type: "plan", items: [{ content: "Find candidates", status: "in_progress" }, { content: "Rank", status: "pending" }] }]);
  });
});

describe("helpers", () => {
  it("finds site ids in task text", () => {
    expect(siteIdFromText("siteId: 20219730. Cafe")).toBe("20219730");
    expect(siteIdFromText("Inspect site_id=838391 please")).toBe("838391");
    expect(siteIdFromText("Look at 1018657 for a taqueria")).toBe("1018657");
    expect(siteIdFromText("no id here")).toBeUndefined();
  });

  it("falls back to prose when a verdict is not JSON", () => {
    expect(parseVerdict("Looks fine to me.", "1")).toMatchObject({ siteId: "1", verdict: "risky", headline: "Looks fine to me." });
  });

  it("frames events for SSE", () => {
    expect(toSse({ type: "done", durationMs: 5 })).toBe('event: done\ndata: {"type":"done","durationMs":5}\n\n');
  });
});
