"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AgentEvent, PlanItem, RankedSite, SiteNumbers, SiteVerdict, Usage } from "@/lib/agent/events";
import type { OwnerBrief } from "@/lib/engine/types";

export type ToolLine = { id: string; name: string; status: "start" | "progress" | "done" | "error"; summary?: string };

export type Inspector = {
  id: string;
  siteId: string;
  status: "running" | "done";
  order: number;
  tools: ToolLine[];
  verdict?: SiteVerdict;
  numbers?: SiteNumbers;
};

export type Decision = Extract<AgentEvent, { type: "decision" }> & { seq: number };

export type RunStatus = "idle" | "connecting" | "streaming" | "done" | "error" | "aborted";

export type RunState = {
  status: RunStatus;
  mode: "live" | "replay" | null;
  brief: OwnerBrief | null;
  briefSource: "llm" | "regex" | null;
  plan: PlanItem[];
  thoughts: string[];
  plannerTools: ToolLine[];
  inspectors: Record<string, Inspector>;
  decisions: Decision[];
  ranking: RankedSite[] | null;
  summary: string | null;
  fallback: boolean;
  error: string | null;
  /** replay only: the recorded query this run actually plays (the server picks the closest recording) */
  recordedQuery: string | null;
  startedAt: number | null;
  durationMs: number | null;
  recordedMs: number | null;
  usage: Usage | null;
};

const initial: RunState = {
  status: "idle",
  mode: null,
  brief: null,
  briefSource: null,
  plan: [],
  thoughts: [],
  plannerTools: [],
  inspectors: {},
  decisions: [],
  ranking: null,
  summary: null,
  fallback: false,
  error: null,
  recordedQuery: null,
  startedAt: null,
  durationMs: null,
  recordedMs: null,
  usage: null,
};

type Action =
  | { type: "reset"; at: number }
  | { type: "open"; mode: "live" | "replay"; recordedQuery?: string }
  | { type: "event"; event: AgentEvent }
  | { type: "fail"; message: string }
  | { type: "aborted" }
  | { type: "ended"; at: number };

function upsertTool(list: ToolLine[], t: ToolLine): ToolLine[] {
  const i = list.findIndex((x) => x.id === t.id);
  if (i < 0) return [...list, t];
  const next = list.slice();
  next[i] = { ...next[i], ...t, summary: t.summary ?? next[i].summary };
  return next;
}

function inspectorFor(state: RunState, siteId: string): Inspector | undefined {
  return Object.values(state.inspectors).find((x) => x.siteId === siteId);
}

function applyEvent(state: RunState, e: AgentEvent): RunState {
  switch (e.type) {
    case "brief":
      return { ...state, brief: e.brief, briefSource: e.source };
    case "plan":
      return { ...state, plan: e.items };
    case "thought":
      return { ...state, thoughts: [...state.thoughts, e.text] };
    case "tool": {
      const line: ToolLine = { id: e.id, name: e.name, status: e.status, summary: e.summary };
      if (e.agent === "site-inspector" && e.siteId) {
        const ins = inspectorFor(state, e.siteId);
        if (!ins) return state;
        return { ...state, inspectors: { ...state.inspectors, [ins.id]: { ...ins, tools: upsertTool(ins.tools, line) } } };
      }
      return { ...state, plannerTools: upsertTool(state.plannerTools, line) };
    }
    case "subagent": {
      const prev = state.inspectors[e.id];
      const ins: Inspector = {
        id: e.id,
        siteId: e.siteId !== "unknown" ? e.siteId : (prev?.siteId ?? e.siteId),
        status: e.status === "done" ? "done" : "running",
        order: prev?.order ?? Object.keys(state.inspectors).length,
        tools: prev?.tools ?? [],
        verdict: e.verdict ?? prev?.verdict,
        numbers: e.numbers ?? prev?.numbers,
      };
      return { ...state, inspectors: { ...state.inspectors, [e.id]: ins } };
    }
    case "decision": {
      const decisions = [...state.decisions, { ...e, seq: state.decisions.length }];
      const ins = inspectorFor(state, e.siteId);
      const inspectors = ins && e.numbers && !ins.numbers ? { ...state.inspectors, [ins.id]: { ...ins, numbers: e.numbers } } : state.inspectors;
      return { ...state, decisions, inspectors };
    }
    case "result":
      return { ...state, ranking: e.ranking, summary: e.summary ?? null, fallback: Boolean(e.fallback) };
    case "error":
      return { ...state, error: e.message };
    case "done":
      return {
        ...state,
        status: state.error && !state.ranking ? "error" : "done",
        // wall time the owner waited; a replay also keeps the recorded run's time
        durationMs: state.startedAt ? Date.now() - state.startedAt : (e.durationMs ?? null),
        recordedMs: e.durationMs ?? null,
        usage: e.usage ?? null,
      };
  }
}

function reducer(state: RunState, a: Action): RunState {
  switch (a.type) {
    case "reset":
      return { ...initial, status: "connecting", startedAt: a.at };
    case "open":
      return { ...state, status: "streaming", mode: a.mode, recordedQuery: a.recordedQuery ?? null };
    case "event":
      return applyEvent(state, a.event);
    case "fail":
      return { ...state, status: "error", error: a.message };
    case "aborted":
      return state.status === "done" ? state : { ...state, status: "aborted" };
    case "ended":
      if (state.status === "streaming" || state.status === "connecting") {
        return { ...state, status: state.ranking ? "done" : "aborted", durationMs: state.durationMs ?? (state.startedAt ? a.at - state.startedAt : null) };
      }
      return state;
  }
}

/** Parses one SSE frame ("event: x\ndata: {...}") into an AgentEvent, or null for comments and pings. */
function parseFrame(frame: string): AgentEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as AgentEvent;
    return typeof parsed?.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Runs POST /api/agent and folds its SSE stream into state. Restarts when query, replay or speed change. */
export function useAgentStream(opts: { query: string; replay: boolean; speed?: number }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const ctrl = useRef<AbortController | null>(null);
  const { query, replay, speed } = opts;

  const start = useCallback(async () => {
    ctrl.current?.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    // a run that has been replaced (re-run, or React's dev double mount) must not touch the new run's state
    const send = (a: Parameters<typeof dispatch>[0]) => {
      if (ctrl.current === ac) dispatch(a);
    };
    send({ type: "reset", at: Date.now() });
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ query, ...(replay ? { replay: true } : {}), ...(speed ? { speed } : {}) }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        let message = `The scout could not start (HTTP ${res.status}).`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* not JSON */
        }
        send({ type: "fail", message });
        return;
      }
      const recorded = res.headers.get("X-Foreground-Recorded-Query");
      send({ type: "open", mode: res.headers.get("X-Foreground-Mode") === "replay" ? "replay" : "live", recordedQuery: recorded ? decodeURIComponent(recorded) : undefined });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split(/\r?\n\r?\n/);
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const ev = parseFrame(f);
          if (ev) send({ type: "event", event: ev });
        }
      }
      const tail = parseFrame(buf);
      if (tail) send({ type: "event", event: tail });
      send({ type: "ended", at: Date.now() });
    } catch (err) {
      if (ac.signal.aborted) send({ type: "aborted" });
      else send({ type: "fail", message: err instanceof Error ? `The connection dropped: ${err.message}` : "The connection dropped." });
    }
  }, [query, replay, speed]);

  const stop = useCallback(() => ctrl.current?.abort(), []);

  useEffect(() => {
    if (!query) return;
    // kick off the run when the page opens or the query changes; the stream then drives state
    void start();
    return () => ctrl.current?.abort();
  }, [query, start]);

  return { state, start, stop };
}
