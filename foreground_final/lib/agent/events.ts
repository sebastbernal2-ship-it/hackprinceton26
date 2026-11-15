import type { OwnerBrief } from "@/lib/engine/types";

/**
 * The normalized event stream the UI consumes (SSE from /api/agent, or a replay file).
 * `mapChunk` turns raw deepagents stream chunks ([namespace, mode, data]) into these events.
 */

export type PlanItem = { content: string; status: "pending" | "in_progress" | "completed" };

export type DecisionAction = "keep" | "drop" | "rerank";

/** What a site-inspector subagent returns for one site. */
export type SiteVerdict = {
  siteId: string;
  verdict: "strong" | "workable" | "risky" | "reject";
  /** one plain sentence, numbers first */
  headline: string;
  topRisk: string;
  positives: string[];
  risks: string[];
};

/** Engine numbers attached to events so the UI never has to trust a number typed by a model. */
export type SiteNumbers = {
  address: string;
  city: string;
  sf: number;
  rentPerSfYr: number | null;
  buildoutUsd: { low: number; mid: number; high: number };
  overBudget: boolean | null;
  seats: number;
  turnsPerDay: number;
  breakevenVerdict: "comfortable" | "stretch" | "unlikely";
  baseProfitUsd: number;
  /** food tenants that left the suite for lease for any reason (moved or closed): departures, not failures */
  sameSuiteFailures: number;
  /** of those, tenants CoStar records as closed (closed location or bankruptcy) */
  sameSuiteClosed: number;
  /** ready-to-show sentence, e.g. "2 food tenants left this suite within 2 years; Mezcal Houston closed in Oct 2026." */
  sameSuiteWording: string;
  trend: "tailwind" | "neutral" | "headwind";
  score: number;
};

export type RankedSite = {
  siteId: string;
  rank: number;
  oneLineReason: string;
  topRisk: string;
  /** added by the server from the site cache + engine (absent only if the engine failed) */
  numbers?: SiteNumbers;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; modelCalls: number }>;
};

export type AgentEvent =
  | { type: "brief"; brief: OwnerBrief; source: "llm" | "regex" }
  | { type: "plan"; items: PlanItem[] }
  /** planner prose between tool calls */
  | { type: "thought"; text: string }
  | {
      type: "tool";
      /** tool call id: pairs "start" with "done"/"error" */
      id: string;
      name: string;
      args: Record<string, unknown>;
      status: "start" | "progress" | "done" | "error";
      summary?: string;
      siteId?: string;
      agent: "planner" | "site-inspector";
    }
  | {
      type: "subagent";
      /** task tool call id: pairs "start" with "done" */
      id: string;
      siteId: string;
      status: "start" | "done";
      verdict?: SiteVerdict;
      numbers?: SiteNumbers;
    }
  | { type: "decision"; siteId: string; action: DecisionAction; reason: string; finding?: string; numbers?: SiteNumbers }
  | { type: "result"; ranking: RankedSite[]; summary?: string; fallback?: boolean }
  | { type: "error"; message: string }
  | { type: "done"; durationMs?: number; usage?: Usage };

export type AgentEventType = AgentEvent["type"];

/** Raw deepagents chunk with `subgraphs: true` and several stream modes. */
export type RawChunk = [namespace: string[], mode: string, data: unknown];

/** Tools hand finished events to the stream through config.writer wrapped like this. */
export const CUSTOM_KEY = "foreground";
export function customEvent(event: AgentEvent): Record<string, AgentEvent> {
  return { [CUSTOM_KEY]: event };
}

/** Tool calls that have their own event type, so they are not also shown as generic "tool" events. */
const SILENT_TOOLS = new Set(["task", "write_todos", "record_decision", "submit_ranking"]);

type NormMessage = {
  kind: "ai" | "tool" | "other";
  id?: string;
  text: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  toolCallId?: string;
  name?: string;
  status?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (isRecord(b) && b.type === "text" && typeof b.text === "string" ? b.text : ""))
    .join("");
}

/** Accepts live LangChain message objects and their JSON-serialized ({lc, id, kwargs}) form. */
function normMessage(raw: unknown): NormMessage {
  const none: NormMessage = { kind: "other", text: "", toolCalls: [] };
  if (!isRecord(raw)) return none;
  const serialized = isRecord(raw.kwargs) && Array.isArray(raw.id);
  const m = serialized ? (raw.kwargs as Record<string, unknown>) : raw;
  let typeName = "";
  if (serialized) typeName = String((raw.id as unknown[]).at(-1) ?? "");
  else if (typeof raw.type === "string") typeName = raw.type;
  else if (typeof (raw as { _getType?: unknown })._getType === "function") {
    typeName = String((raw as { _getType: () => string })._getType());
  }
  const t = typeName.toLowerCase();
  const kind: NormMessage["kind"] = t.startsWith("ai") ? "ai" : t.startsWith("tool") ? "tool" : "other";
  if (kind === "other") return none;

  const toolCalls: NormMessage["toolCalls"] = [];
  if (kind === "ai") {
    const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
    for (const c of calls) {
      if (!isRecord(c) || typeof c.name !== "string") continue;
      toolCalls.push({ id: String(c.id ?? ""), name: c.name, args: isRecord(c.args) ? c.args : {} });
    }
    if (toolCalls.length === 0 && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (!isRecord(b) || b.type !== "tool_use" || typeof b.name !== "string") continue;
        const input = typeof b.input === "string" ? parseJsonLoose(b.input) : b.input;
        toolCalls.push({ id: String(b.id ?? ""), name: b.name, args: isRecord(input) ? input : {} });
      }
    }
  }
  return {
    kind,
    id: typeof m.id === "string" ? m.id : undefined,
    text: contentText(m.content).trim(),
    toolCalls,
    toolCallId: typeof m.tool_call_id === "string" ? m.tool_call_id : undefined,
    name: typeof m.name === "string" ? m.name : undefined,
    status: typeof m.status === "string" ? m.status : undefined,
    usage: isRecord(m.usage_metadata) ? (m.usage_metadata as NormMessage["usage"]) : undefined,
    model:
      isRecord(m.response_metadata) && typeof m.response_metadata.model === "string"
        ? m.response_metadata.model
        : isRecord(m.additional_kwargs) && typeof m.additional_kwargs.model === "string"
          ? m.additional_kwargs.model
          : undefined,
  };
}

export function siteIdFromText(text: string): string | undefined {
  const m = /site\s*_?id\W{0,4}(\d{3,10})/i.exec(text) ?? /\b(\d{5,9})\b/.exec(text);
  return m?.[1];
}

const VERDICTS = new Set(["strong", "workable", "risky", "reject"]);

function strings(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : [];
}

/** Parse a subagent's reply (structured JSON, fenced JSON, or prose) into a SiteVerdict. */
export function parseVerdict(content: string, siteId: string): SiteVerdict {
  const parsed = parseJsonLoose(content);
  if (isRecord(parsed)) {
    const verdict = typeof parsed.verdict === "string" && VERDICTS.has(parsed.verdict) ? parsed.verdict : "risky";
    const risks = strings(parsed.risks, 4);
    return {
      siteId,
      verdict: verdict as SiteVerdict["verdict"],
      headline: typeof parsed.headline === "string" ? parsed.headline : "",
      topRisk: typeof parsed.topRisk === "string" ? parsed.topRisk : (risks[0] ?? ""),
      positives: strings(parsed.positives, 4),
      risks,
    };
  }
  return { siteId, verdict: "risky", headline: content.trim().slice(0, 240), topRisk: "", positives: [], risks: [] };
}

function toolSummary(content: string): string {
  const parsed = parseJsonLoose(content);
  if (isRecord(parsed)) {
    if (typeof parsed.summary === "string") return parsed.summary;
    if (typeof parsed.error === "string") return parsed.error;
  }
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat;
}

function planItems(args: Record<string, unknown>): PlanItem[] {
  const todos = Array.isArray(args.todos) ? args.todos : [];
  const items: PlanItem[] = [];
  for (const t of todos) {
    if (!isRecord(t) || typeof t.content !== "string") continue;
    const status = t.status === "completed" || t.status === "in_progress" ? t.status : "pending";
    items.push({ content: t.content, status });
  }
  return items;
}

const AGENT_EVENT_TYPES = new Set<string>([
  "brief", "plan", "thought", "tool", "subagent", "decision", "result", "error", "done",
]);

export type EventMapper = {
  /** Map one raw chunk to zero or more normalized events. */
  map(chunk: RawChunk): AgentEvent[];
  usage(): Usage;
};

/**
 * Stateful mapper: remembers which tool call belongs to which site so "done" events can be paired with "start".
 * Planner events arrive with an empty namespace; subagent events with a namespace like ["tools:<uuid>"].
 */
export function createEventMapper(): EventMapper {
  const seenMessages = new Set<string>();
  const calls = new Map<string, { name: string; args: Record<string, unknown>; siteId?: string }>();
  const nsSite = new Map<string, string>();
  const usage: Usage = { inputTokens: 0, outputTokens: 0, modelCalls: 0, byModel: {} };
  const seenCalls = new Set<string>();

  function fromAi(msg: NormMessage, nsKey: string, isSub: boolean): AgentEvent[] {
    const out: AgentEvent[] = [];
    if (msg.usage) {
      usage.inputTokens += msg.usage.input_tokens ?? 0;
      usage.outputTokens += msg.usage.output_tokens ?? 0;
      usage.modelCalls += 1;
      const m = (usage.byModel[msg.model ?? "unknown"] ??= { inputTokens: 0, outputTokens: 0, modelCalls: 0 });
      m.inputTokens += msg.usage.input_tokens ?? 0;
      m.outputTokens += msg.usage.output_tokens ?? 0;
      m.modelCalls += 1;
    }
    // Subagent prose is its verdict, which arrives again as the task result: only the planner "thinks" aloud.
    if (msg.text && !isSub) out.push({ type: "thought", text: msg.text });
    for (const call of msg.toolCalls) {
      // "extract-N" is the structured-output helper a subagent uses to hand back its verdict.
      if (call.name.startsWith("extract-") || (call.id && seenCalls.has(call.id))) continue;
      if (call.id) seenCalls.add(call.id);
      const argSite = typeof call.args.siteId === "string" ? call.args.siteId : undefined;
      if (isSub && argSite && !nsSite.has(nsKey)) nsSite.set(nsKey, argSite);
      const siteId = argSite ?? (isSub ? nsSite.get(nsKey) : undefined);
      if (call.name === "task") {
        const taskSite = siteIdFromText(String(call.args.description ?? "")) ?? "unknown";
        calls.set(call.id, { name: call.name, args: call.args, siteId: taskSite });
        out.push({ type: "subagent", id: call.id, siteId: taskSite, status: "start" });
        continue;
      }
      calls.set(call.id, { name: call.name, args: call.args, siteId });
      if (call.name === "write_todos") {
        const items = planItems(call.args);
        if (items.length) out.push({ type: "plan", items });
        continue;
      }
      if (SILENT_TOOLS.has(call.name)) continue;
      out.push({
        type: "tool", id: call.id, name: call.name, args: call.args, status: "start",
        ...(siteId ? { siteId } : {}), agent: isSub ? "site-inspector" : "planner",
      });
    }
    return out;
  }

  function fromTool(msg: NormMessage, isSub: boolean): AgentEvent[] {
    const call = msg.toolCallId ? calls.get(msg.toolCallId) : undefined;
    const name = msg.name ?? call?.name ?? "tool";
    const failed = msg.status === "error";
    if (name === "task") {
      const siteId = call?.siteId ?? "unknown";
      const verdict = parseVerdict(msg.text, siteId);
      return [{ type: "subagent", id: msg.toolCallId ?? "", siteId, status: "done", verdict }];
    }
    if (SILENT_TOOLS.has(name) && !failed) return [];
    // Structured-output helper calls have no matching visible start: skip them.
    if (!call && !failed) return [];
    return [{
      type: "tool", id: msg.toolCallId ?? "", name, args: call?.args ?? {},
      status: failed ? "error" : "done", summary: toolSummary(msg.text),
      ...(call?.siteId ? { siteId: call.siteId } : {}), agent: isSub ? "site-inspector" : "planner",
    }];
  }

  function map(chunk: RawChunk): AgentEvent[] {
    const [ns, mode, data] = chunk;
    const nsKey = Array.isArray(ns) ? ns.join("|") : "";
    const isSub = nsKey.includes("tools:");

    if (mode === "custom") {
      const event = isRecord(data) ? data[CUSTOM_KEY] : undefined;
      if (isRecord(event) && typeof event.type === "string" && AGENT_EVENT_TYPES.has(event.type)) {
        return [event as AgentEvent];
      }
      return [];
    }
    if (mode !== "updates" || !isRecord(data)) return [];

    const out: AgentEvent[] = [];
    for (const [node, value] of Object.entries(data)) {
      if (node !== "model_request" && node !== "tools") continue;
      if (!isRecord(value) || !Array.isArray(value.messages)) continue;
      for (const raw of value.messages) {
        const msg = normMessage(raw);
        if (msg.kind === "other") continue;
        const key = msg.kind === "tool" ? `tool:${msg.toolCallId}` : `ai:${nsKey}:${msg.id}`;
        if ((msg.id || msg.toolCallId) && seenMessages.has(key)) continue;
        seenMessages.add(key);
        out.push(...(msg.kind === "ai" ? fromAi(msg, nsKey, isSub) : fromTool(msg, isSub)));
      }
    }
    return out;
  }

  return { map, usage: () => structuredClone(usage) };
}

/** Server-Sent Events framing for one event. */
export function toSse(event: AgentEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
