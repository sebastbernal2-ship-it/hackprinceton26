"use client";

import { useRef, useState } from "react";
import { emptyTrace, linkNumbers, modeBadge, reduceTrace, replayAgent, runAgent, type AgentEvent, type Trace } from "../../lib/agent";

const DEFAULT_GOAL = "Independent cafe in Houston; menu, seating, budget, and on-site baking are unconfirmed: find candidate spaces, connect each claim to evidence, and revise the plan when an assumption changes";

function replayContext(source?: string): string {
  switch (source) {
    case "local-recorded-run":
      return "Source: a recorded run from local data. This is not live, and its goal may differ from the one entered here.";
    case "recorded-run-sanitized":
      return "Source: a sanitized recording of the earlier Italian restaurant with gelato scenario. It is not a result for the current café goal; property addresses and IDs are masked.";
    case "SYNTHETIC-fixture":
      return "Source: a synthetic fixture for the earlier Italian restaurant with gelato scenario. Its values are synthetic and it is not a result for the current café goal.";
    default:
      return "Source: saved trace; source details are unavailable. This is not a live run or a result for the current goal.";
  }
}

function Line({ e }: { e: AgentEvent }) {
  const who = e.agent ? <span className="text-foreground/45">{e.agent} </span> : null;
  switch (e.type) {
    case "plan":
      return <li data-kind="plan"><b>Plan</b> {e.items?.join(" / ")}</li>;
    case "tool_call":
      return <li data-kind="tool_call">{who}calls <code className="font-mono text-xs">{e.tool}</code> <span className="text-foreground/45">{JSON.stringify(e.args)?.slice(0, 120)}</span></li>;
    case "tool_result": {
      return <li id={`res-${e.resultId}`} data-kind="tool_result" className="scroll-mt-24">{who}result <b>{e.resultId}</b> from <code className="font-mono text-xs">{e.tool}</code> {e.ok === false ? "(failed)" : ""} <span className="text-foreground/50">{(e.summary ?? "").slice(0, 160)}</span></li>;
    }
    case "subagent_start":
      return <li data-kind="subagent">Subagent <b>{e.agent}</b> started (listing {e.listingId})</li>;
    case "subagent_finish":
      return <li data-kind="subagent">Subagent <b>{e.agent}</b> finished: {e.verdict?.verdict ?? "unknown"}{e.verdict?.verified === false ? " (claims failed verification)" : ""}</li>;
    case "finding":
      return <li data-kind="finding">Finding ({e.kind}) listing {e.listingId}: {e.text} <span className="text-foreground/45">[{e.cites?.join(", ")}]</span></li>;
    case "action":
      return <li id={`res-${e.resultId}`} data-kind="action"><b>Action</b> {e.action} <span className="text-foreground/50">{(e.summary ?? "").slice(0, 160)}</span></li>;
    default:
      return null;
  }
}

export default function AgentPanel() {
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [trace, setTrace] = useState<Trace>(emptyTrace());
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function start(kind: "run" | "replay") {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setTrace(emptyTrace());
    setFail(null);
    setBusy(true);
    const on = (e: AgentEvent) => setTrace((t) => reduceTrace(t, e));
    try {
      if (kind === "run") await runAgent(goal, on, ctl.signal);
      else await replayAgent(on, ctl.signal);
    } catch (err) {
      if (!ctl.signal.aborted) setFail(err instanceof Error ? err.message : "The stream failed.");
    } finally {
      if (abort.current === ctl) setBusy(false);
    }
  }

  const badge = modeBadge(trace.mode, trace.replaySource);
  const brief = trace.brief;
  const err = trace.error ?? fail;

  return (
    <section className="mx-auto mt-10 max-w-4xl border-t border-foreground/10 px-6 pb-16 pt-6" aria-labelledby="agent-title" data-testid="agent-panel">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="agent-title" className="text-lg font-medium tracking-tight">Mission control</h2>
        {trace.mode && (
          <span
            data-testid="mode-badge"
            title={badge.detail}
            className={`rounded px-2.5 py-1 text-sm font-semibold tracking-wide ${badge.live ? "bg-match-soft text-match" : "bg-accent text-background"}`}
          >
            {badge.text}
          </span>
        )}
      </div>
      {trace.mode && !badge.live && trace.mode !== "REPLAY" && <p className="mt-1 text-sm font-medium text-accent" data-testid="mode-detail">{badge.detail}</p>}
      {trace.mode === "REPLAY" && <p className="mt-1 text-sm font-medium text-accent" data-testid="mode-detail">{replayContext(trace.replaySource)}</p>}
      <p className="mt-1 text-sm text-foreground/50">The agent plans, calls tools, and spawns one inspector per shortlisted site. Every number in the brief must appear in a tool result it cites; click a number to see that result.</p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void start("run"); }}>
        <label className="sr-only" htmlFor="agent-goal">Goal</label>
        <input id="agent-goal" value={goal} onChange={(e) => setGoal(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-foreground/20 bg-background px-3 py-2 text-sm" />
        <button type="submit" disabled={busy || !goal.trim()} className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-40">Run agent</button>
        <button type="button" disabled={busy} onClick={() => void start("replay")} className="rounded-lg border border-foreground/25 px-4 py-2 text-sm disabled:opacity-40">Replay saved run (earlier Italian/gelato scenario)</button>
      </form>
      {err && <p role="alert" className="mt-3 rounded-lg border border-accent/40 p-3 text-sm" data-testid="agent-error">{err} Nothing was run. Try the replay.</p>}
      {busy && <p className="mt-2 text-xs text-foreground/50" aria-live="polite">Streaming trace.</p>}
      {trace.events.length > 0 && (
        <ol className="mt-4 max-h-80 space-y-1.5 overflow-y-auto rounded-lg border border-foreground/10 p-3 text-sm" aria-label="Agent trace" data-testid="trace">
          {trace.events.map((e, i) => <Line key={i} e={e} />)}
        </ol>
      )}
      {brief && (
        <article className="mt-5 rounded-lg border border-foreground/15 p-4" data-testid="brief">
          <h3 className="text-base font-medium">Decision brief</h3>
          <p className="mt-1 text-xs text-foreground/50">Goal: {brief.goal}</p>
          {brief.recommendation && <p className="mt-2 text-sm font-medium">{brief.recommendation}</p>}
          <ul className="mt-3 space-y-2 text-sm">
            {brief.claims.map((c, i) => (
              <li key={i} data-testid="claim">
                {linkNumbers(c.text, c.cites, trace.results).map((p, j) =>
                  p.cite ? <a key={j} href={`#res-${p.cite}`} className="font-medium underline decoration-accent underline-offset-2" title={`From tool result ${p.cite}`}>{p.text}</a>
                  : p.unlinked ? <span key={j} className="underline decoration-dotted" title="This number was not found in a cited tool result">{p.text}</span>
                  : <span key={j}>{p.text}</span>)}
                <span className="ml-2 text-xs text-foreground/45">{c.cites.map((x) => <a key={x} href={`#res-${x}`} className="mr-1 underline">{x}</a>)}</span>
              </li>
            ))}
          </ul>
          {brief.verdicts.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {brief.verdicts.map((v) => <li key={v.listingId}>Listing {v.listingId}: <b>{v.verdict}</b>{v.verified === false ? " (unverified claims)" : ""}. {v.topRisk && <span className="text-foreground/60">Top risk: {v.topRisk}</span>}</li>)}
            </ul>
          )}
          {brief.unknowns.length > 0 && (
            <div className="mt-3 text-xs text-foreground/60">
              <b>Cannot say yet:</b>
              <ul className="list-disc pl-4">{brief.unknowns.flatMap((u) => u.unknowns.map((x, i) => <li key={`${u.listingId}-${i}`}>Listing {u.listingId}: {x}</li>))}</ul>
            </div>
          )}
          {brief.rejectedClaims && brief.rejectedClaims.length > 0 && <p className="mt-2 text-xs text-accent">{brief.rejectedClaims.length} claim(s) were rejected because their numbers did not match a cited result.</p>}
          <p className="mt-3 text-xs text-foreground/45">{brief.label}. {brief.note}</p>
        </article>
      )}
    </section>
  );
}
