"use client";

import { useEffect, useRef, useState } from "react";
import { parseChange, runAgent, VERIFY_TOPICS, type AgentEvent, type AgentMode, type ParsedChange } from "../../lib/imagine";
import { fetchConcepts, type Concept } from "../../lib/reskin";
import Badge from "../reskin/badge";
import { useReskin } from "../reskin/reskin-panel";
import ReskinResultView from "../reskin/reskin-result";
import WalkEmbed from "./walk-embed";

const EXAMPLES = ["Turn this Italian restaurant into Indian", "Make it a Japanese izakaya", "Open the wall to the next suite"];

function describe(e: AgentEvent): string | null {
  if (e.type === "plan" && Array.isArray(e.items)) return `Plan: ${(e.items as string[]).join("; ")}`;
  if (e.type === "tool_call") return `${e.agent ?? "agent"} called ${String(e.tool)}`;
  if (e.type === "tool_result") return `${String(e.tool)} returned ${e.ok ? "ok" : "an error"}`;
  if (e.type === "subagent_start") return `Started ${String(e.agent)}`;
  if (e.type === "final") return "Final brief produced";
  if (e.type === "finding") return `Finding: ${String(e.kind ?? "")}`;
  if (e.type === "action") return `Action: ${String(e.name ?? e.tool ?? "")}`;
  return null;
}

export default function ImaginePanel({ listingId }: { listingId: number }) {
  const [text, setText] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [parsed, setParsed] = useState<ParsedChange | null>(null);
  const [trace, setTrace] = useState<string[]>([]);
  const [mode, setMode] = useState<AgentMode | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const reskin = useReskin(listingId);

  useEffect(() => {
    fetchConcepts().then(setConcepts, () => setConcepts([]));
    return () => ctl.current?.abort();
  }, []);

  async function go(t: string) {
    const change = parseChange(t, concepts);
    setParsed(change);
    setTrace([]);
    setMode(null);
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setAgentBusy(true);
    if (change.kind === "reskin" && change.toConcept) void reskin.run("italian", change.toConcept);
    try {
      const m = await runAgent(`Imagine this change for listing ${listingId} and say what to verify: ${t}`, (e) => {
        const d = describe(e);
        if (d) setTrace((cur) => (cur.length < 60 ? [...cur, d] : cur));
      }, c.signal);
      setMode(m);
    } catch {
      /* aborted by a newer run */
    } finally {
      if (ctl.current === c) setAgentBusy(false);
    }
  }

  const stub = mode === "STUB";
  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="imagine-title">
      <h2 id="imagine-title" className="text-lg font-medium tracking-tight">Imagine a change</h2>
      <p className="mt-1 text-sm text-foreground/50">Describe a change. A local router picks the analysis, the agent endpoint plans it, and everything that cannot be sourced says so.</p>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 3) void go(text.trim()); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Describe the change" maxLength={300}
          placeholder="e.g. turn this Italian restaurant into Indian" className="min-w-0 flex-1 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm" />
        <button type="submit" disabled={agentBusy || text.trim().length < 3} className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-40">Imagine</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => { setText(x); void go(x); }} className="rounded-full border border-foreground/15 px-3 py-1 text-xs text-foreground/70 hover:bg-foreground/5">{x}</button>)}
      </div>

      {parsed && (
        <div className="mt-5 space-y-6">
          <section aria-labelledby="img-route-h">
            <h3 id="img-route-h" className="text-sm font-medium">1. Plan</h3>
            <p className="mt-1 text-sm text-foreground/70">
              {parsed.kind === "reskin" && <>Local router: concept swap Italian to <strong>{concepts.find((c) => c.id === parsed.toConcept)?.name ?? parsed.toConcept}</strong>. Running the reskin analysis below.</>}
              {parsed.kind === "wall" && <>Local router: this reads as opening a wall or adding space. Use the expansion simulation under Structure and climate; wall type must be confirmed by an engineer.</>}
              {parsed.kind === "other" && <>Local router: no analysis matches this text, so only the agent trace and the verify list apply. Nothing was costed.</>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-foreground/50">Agent endpoint:</span>
              {agentBusy && <span role="status">running.</span>}
              {mode && <Badge kind={stub ? "unknown" : mode === "LIVE" ? "observed" : "estimated"}>{stub ? "STUB: agent unavailable" : mode === "REPLAY" ? "REPLAY (recorded, not run for this text)" : mode}</Badge>}
              {mode === "SCRIPTED" && <span className="text-foreground/50">deterministic policy, no model</span>}
            </div>
            {stub && <p className="mt-2 text-sm text-foreground/60">The agent could not be reached or had no data, so no agent plan was produced. Nothing is shown in its place.</p>}
            {trace.length > 0 && (
              <ol className="mt-2 max-h-48 list-decimal space-y-0.5 overflow-y-auto pl-5 text-xs text-foreground/70" aria-label="Agent trace">
                {trace.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            )}
          </section>

          {parsed.kind === "reskin" && (
            <section aria-labelledby="img-res-h">
              <h3 id="img-res-h" className="text-sm font-medium">2. Cost delta, feasibility and imagined layout</h3>
              {reskin.busy && <p className="mt-2 text-sm text-foreground/50">Planning.</p>}
              {reskin.error && <p className="mt-2 text-sm text-accent" role="alert">{reskin.error}</p>}
              {reskin.result && <ReskinResultView result={reskin.result} dims={reskin.dims} />}
            </section>
          )}

          <section aria-labelledby="img-ver-h">
            <h3 id="img-ver-h" className="text-sm font-medium">{parsed.kind === "reskin" ? "3" : "2"}. Things to verify before committing</h3>
            <p className="mt-1 text-xs text-foreground/50">A checklist, not findings. None of these has a source here, so every item is unverified; none states a code requirement.</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {VERIFY_TOPICS.map((v) => (
                <li key={v.id} className="rounded-lg border border-foreground/10 p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{v.topic}</span><Badge kind="unverified">unverified</Badge></div>
                  <p className="mt-1 text-foreground/60">{v.ask}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <div className="mt-6"><WalkEmbed listingId={listingId} /></div>
    </section>
  );
}
