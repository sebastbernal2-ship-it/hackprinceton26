// Mission Control client: POST /api/agent/run and GET /api/agent/replay are SSE. Event schema: agent/runner.py on rt/agent.
export type AgentMode = "LIVE" | "SCRIPTED" | "REPLAY" | "NONE";
export type AgentEvent = {
  type: "plan" | "tool_call" | "tool_result" | "subagent_start" | "subagent_finish" | "finding" | "action" | "final" | "error" | "replay_info";
  mode?: AgentMode; recordedMode?: AgentMode; agent?: string; tool?: string; args?: unknown; resultId?: string; ok?: boolean; summary?: string;
  items?: string[]; text?: string; kind?: string; cites?: string[]; listingId?: number; verdict?: Verdict; action?: string;
  message?: string; source?: string; note?: string; brief?: Brief; syntheticFixture?: boolean;
};
export type Verdict = { listingId: number; verdict: string; headline: string; topRisk?: string; risks?: string[]; unknowns?: string[]; cites: string[]; verified?: boolean };
export type Claim = { text: string; cites: string[] };
export type Brief = {
  runId: string; mode: AgentMode; goal: string; label: string; recommendation?: string; claims: Claim[]; rejectedClaims?: Claim[];
  verdicts: Verdict[]; unknowns: { listingId: number; unknowns: string[]; cites: string[] }[]; note?: string;
};

/** Incremental SSE parser: feed text chunks, get complete events. Keeps the unfinished tail. */
export function createSseParser(onEvent: (e: AgentEvent) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk.replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as AgentEvent);
      } catch {
        onEvent({ type: "error", message: "Unreadable event in the stream." });
      }
    }
  };
}

export async function streamAgent(url: string, init: RequestInit, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, { ...init, signal });
  if (!res.ok || !res.body) throw new Error(`agent ${res.status}`);
  const feed = createSseParser(onEvent);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    feed(dec.decode(value, { stream: true }));
  }
}
export const runAgent = (goal: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal, provider = "auto") =>
  streamAgent("/api/agent/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal, provider }) }, onEvent, signal);
export const replayAgent = (onEvent: (e: AgentEvent) => void, signal?: AbortSignal, delay = 0.25) =>
  streamAgent(`/api/agent/replay?delay=${delay}`, {}, onEvent, signal);

/** Badge text. Anything not LIVE must be flagged: REPLAY is a recording, SCRIPTED is a deterministic policy with no model. */
export function modeBadge(mode: AgentMode | undefined, source?: string): { text: string; live: boolean; detail: string } {
  if (mode === "LIVE") return { text: "LIVE", live: true, detail: "A model is driving this run." };
  if (mode === "SCRIPTED") return { text: "SCRIPTED", live: false, detail: "Deterministic policy over the real tools. No language model is reasoning in this run." };
  if (mode === "REPLAY") return { text: "REPLAY", live: false, detail: `A recorded trace, not a live run${source ? ` (${source})` : ""}.` };
  return { text: "NOT RUNNING", live: false, detail: "No run yet." };
}

export type Trace = { events: AgentEvent[]; results: Record<string, AgentEvent>; mode?: AgentMode; replaySource?: string; brief?: Brief; error?: string };
export const emptyTrace = (): Trace => ({ events: [], results: {} });
export function reduceTrace(t: Trace, e: AgentEvent): Trace {
  const next: Trace = { ...t, events: e.type === "replay_info" ? t.events : [...t.events, e], results: { ...t.results } };
  if (e.mode && e.mode !== "NONE") next.mode = e.mode;
  if (e.type === "replay_info") { next.mode = "REPLAY"; next.replaySource = e.source; }
  if (e.type === "tool_result" && e.resultId) next.results[e.resultId] = e;
  if (e.type === "action" && e.resultId) next.results[e.resultId] = e;
  if (e.type === "final" && e.brief) next.brief = e.brief;
  if (e.type === "error") next.error = e.message ?? "The run failed.";
  return next;
}

export type Piece = { text: string; cite?: string; unlinked?: boolean };
/** Split a claim into text and numbers; each number links to the first cited tool result that actually contains it. A number found in none is flagged. */
export function linkNumbers(text: string, cites: string[], results: Record<string, AgentEvent>): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const num = m[0];
    const bare = num.replace(/,/g, "");
    const hit = cites.find((c) => {
      const s = results[c]?.summary ?? "";
      return s.includes(num) || s.includes(bare);
    });
    out.push(hit ? { text: num, cite: hit } : { text: num, unlinked: true });
    last = idx + num.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
