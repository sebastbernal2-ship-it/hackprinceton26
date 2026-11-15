"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Square } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { num } from "@/lib/format";
import type { SiteCard } from "@/lib/sites/thumbs";
import { cn } from "@/lib/utils";
import { Lane, type Void } from "./lane";
import { BriefTitleBlock, briefToQuery, DecisionFeed, EASE_OUT, PlanChecklist, targetRank } from "./parts";
import { useAgentStream, type Inspector, type RunState } from "./use-agent-stream";

function useElapsed(startedAt: number | null, running: boolean, finalMs: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [running]);
  if (!running && finalMs != null) return finalMs;
  return startedAt ? Math.max(0, now - startedAt) : 0;
}

/** Lanes in the order the scout currently believes: final ranking, else latest reranks, dropped lanes last. */
function laneOrder(state: RunState, voided: Map<string, Void>, restored: Set<string>): { ins: Inspector; rank: number | null }[] {
  const dropped = new Set(voided.keys());
  const final = new Map(state.ranking?.map((r) => [r.siteId, r.rank]) ?? []);
  // sites the owner put back rank after the scout's own shortlist
  for (const id of restored) if (!final.has(id)) final.set(id, 90);
  const provisional = new Map<string, number>();
  for (const d of state.decisions) {
    if (d.action !== "rerank") continue;
    const sinks = /\b(ranked last|last of|falls to last|to last)\b/i.test(d.reason);
    const t = sinks ? 98 : targetRank(d.reason);
    // a later, more specific decision wins; "falls from #1" style reasons without a destination sink below the others
    provisional.set(d.siteId, t ?? 97);
  }
  const isDropped = (id: string) => dropped.has(id);
  const key = (id: string) => (isDropped(id) ? null : (final.get(id) ?? provisional.get(id) ?? null));
  const sorted = Object.values(state.inspectors)
    .map((ins, i) => ({ ins, k: key(ins.siteId), seq: i }))
    .sort((a, b) => {
      const da = isDropped(a.ins.siteId) ? 1 : 0;
      const db = isDropped(b.ins.siteId) ? 1 : 0;
      if (da !== db) return da - db;
      const ra = a.k ?? 99;
      const rb = b.k ?? 99;
      if (ra !== rb) return ra - rb;
      return a.ins.order - b.ins.order;
    });
  // shown ranks are the lanes' current positions, so two lanes never claim the same number
  let n = 0;
  return sorted.map(({ ins, k }) => ({ ins, rank: k == null ? null : ++n }));
}

function Panel({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("border-t border-ink pt-3", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="lettering text-xl font-semibold">{title}</h2>
        {aside ? <span className="text-xs text-ink-2">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function MissionControl({ query, replay, speed, sites }: { query: string; replay: boolean; speed?: number; sites: Record<string, SiteCard> }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const { state, start: startRun, stop } = useAgentStream({ query, replay, speed });
  // owner overrides: lanes pulled while the scout works ("Interrupt") and drops undone ("Undo drop")
  const [pulled, setPulled] = useState<Set<string>>(() => new Set());
  const [restored, setRestored] = useState<Set<string>>(() => new Set());
  const start = useCallback(() => {
    setPulled(new Set());
    setRestored(new Set());
    return startRun();
  }, [startRun]);
  const running = state.status === "connecting" || state.status === "streaming";
  const elapsed = useElapsed(state.startedAt, running, state.durationMs);
  const voided = useMemo(() => {
    const m = new Map<string, Void>();
    for (const d of state.decisions) if (d.action === "drop" && !restored.has(d.siteId)) m.set(d.siteId, { by: "agent", text: d.finding ?? d.reason });
    for (const id of pulled) m.set(id, { by: "you", text: "you took this space off your shortlist (the scout keeps running on the others)" });
    return m;
  }, [state.decisions, pulled, restored]);
  const agentDropped = useMemo(() => new Set(state.decisions.filter((d) => d.action === "drop").map((d) => d.siteId)), [state.decisions]);
  const lanes = useMemo(() => laneOrder(state, voided, restored), [state, voided, restored]);
  const toggle = useCallback(
    (siteId: string) => {
      if (pulled.has(siteId)) {
        setPulled((s) => new Set([...s].filter((x) => x !== siteId)));
      } else if (agentDropped.has(siteId)) {
        setRestored((s) => (s.has(siteId) ? new Set([...s].filter((x) => x !== siteId)) : new Set(s).add(siteId)));
      } else {
        setPulled((s) => new Set(s).add(siteId));
      }
    },
    [pulled, agentDropped],
  );
  const rerun = useCallback(
    (b: Parameters<typeof briefToQuery>[0]) => {
      const p = new URLSearchParams({ q: briefToQuery(b) });
      if (replay) p.set("replay", "1");
      if (speed) p.set("speed", String(speed));
      router.push(`/search?${p}`);
    },
    [router, replay, speed],
  );
  const rankedBy = useMemo(() => new Map(state.ranking?.map((r) => [r.siteId, r]) ?? []), [state.ranking]);
  const reported = lanes.filter((l) => l.ins.status === "done").length;
  const finished = state.status === "done" && Boolean(state.ranking);

  const replayHref = `/search?${new URLSearchParams({ q: query, replay: "1", speed: String(speed ?? 4) })}`;
  const liveHref = `/search?${new URLSearchParams({ q: query })}`;

  const statusText =
    state.status === "connecting"
      ? "Starting the scout"
      : state.status === "streaming"
        ? state.ranking
          ? "Writing up the shortlist"
          : lanes.length
            ? `${lanes.length} inspectors in parallel · ${reported} reported`
            : state.brief
              ? "Planning"
              : "Reading your brief"
        : state.status === "done"
          ? `Done in ${num(elapsed / 1000, 1)} s${state.mode === "replay" && state.recordedMs ? ` · replay of a ${num(state.recordedMs / 1000, 0)} s live run` : ""}`
          : state.status === "aborted"
            ? "Stopped before the scout finished"
            : state.status === "error"
              ? "The scout hit a problem"
              : "";

  return (
    <>
      <header className="bg-ink text-on-ink">
        <div className="mx-auto max-w-[90rem] px-4 sm:px-8">
          <div className="flex items-center justify-between border-b border-on-ink/20 py-3 text-sm">
            <Link href="/" className="lettering-wide text-[0.8125rem] font-bold hover:underline">
              Foreground
            </Link>
            <div className="flex items-center gap-4">
              {replay ? (
                <Link href={liveHref} className="text-on-ink-2 underline hover:text-on-ink">
                  Run live
                </Link>
              ) : (
                <Link href={replayHref} className="text-on-ink-2 underline hover:text-on-ink">
                  Replay offline
                </Link>
              )}
              <Link href="/" className="text-on-ink-2 hover:text-on-ink hover:underline">
                New search
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-5 py-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-on-ink-2">You asked for</p>
                <h1 className="lettering text-[2rem] font-bold leading-[1] sm:text-[2.75rem]">{query}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <p role="status" aria-live="polite" className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "inline-block size-2 rounded-full",
                      running ? "bg-maybe motion-safe:animate-pulse" : state.status === "done" ? "bg-saved" : state.status === "idle" ? "bg-on-ink-2" : "bg-needed",
                    )}
                  />
                  {statusText}
                </p>
                <span className="font-mono text-xs text-on-ink-2">
                  {state.mode === "replay" || (!state.mode && replay) ? `replay${speed ? ` ×${speed}` : ""}` : state.mode === "live" ? "live" : ""}
                  {running ? ` · ${num(elapsed / 1000, 1)} s` : ""}
                </span>
                {running ? (
                  <button type="button" onClick={stop} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-on-ink/40 px-3 transition-[border-color,transform] duration-150 hover:border-on-ink active:scale-[0.97]">
                    <Square aria-hidden className="size-3.5" /> Stop
                  </button>
                ) : (
                  <button type="button" onClick={() => void start()} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-on-ink/40 px-3 transition-[border-color,transform] duration-150 hover:border-on-ink active:scale-[0.97]">
                    <RotateCcw aria-hidden className="size-3.5" /> Run again
                  </button>
                )}
              </div>
            </div>
            <BriefTitleBlock brief={state.brief} source={state.briefSource} onRerun={running ? undefined : rerun} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[90rem] flex-1 gap-x-10 gap-y-8 px-4 py-8 sm:px-8 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          {state.status === "error" && !state.ranking ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-sm border border-needed bg-needed-wash p-4">
              <p className="font-semibold">{state.error ?? "Something went wrong."}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <button type="button" onClick={() => void start()} className="h-9 rounded-sm bg-ink px-3 font-semibold text-on-ink active:scale-[0.97]">
                  Try again
                </button>
                {!replay ? (
                  <Link href={replayHref} className="flex h-9 items-center rounded-sm border border-ink px-3 font-semibold hover:bg-paper-2">
                    Use the recorded run
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
          {state.status === "aborted" && !state.ranking ? (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-sm border border-dashed border-rule-strong p-4 text-sm">
              <span>The run stopped before a shortlist was ready.</span>
              <button type="button" onClick={() => void start()} className="h-9 rounded-sm bg-ink px-3 font-semibold text-on-ink active:scale-[0.97]">
                Start again
              </button>
            </div>
          ) : null}

          <section aria-label={state.ranking ? "Your shortlist" : "Site inspectors"}>
            <div className="mb-1 flex items-baseline justify-between gap-3 border-t border-ink pt-3">
              <h2 className="lettering text-xl font-semibold">{state.ranking ? "Your shortlist" : "Site inspectors"}</h2>
              <span className="text-xs text-ink-2">{lanes.length ? `${reported} of ${lanes.length} reported` : ""}</span>
            </div>

            <AnimatePresence>
              {state.summary ? (
                <motion.p
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                  className="max-w-3xl py-2 text-base leading-snug"
                >
                  {state.summary}
                </motion.p>
              ) : null}
            </AnimatePresence>
            {state.fallback ? (
              <p role="note" className="my-2 rounded-sm border border-dashed border-maybe-ink bg-maybe-wash px-3 py-2 text-sm">
                The agent could not finish its ranking, so this order comes from the engine&apos;s site scores alone.
              </p>
            ) : null}

            {lanes.length === 0 ? (
              <div className="flex flex-col gap-3 py-4" aria-busy={running}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 rounded-sm border border-dashed border-rule-strong bg-paper-2/60 motion-safe:animate-pulse" />
                ))}
                <p className="text-sm text-ink-2">{running ? "The planner is choosing which spaces to send an inspector to." : "No spaces were inspected."}</p>
              </div>
            ) : (
              <LayoutGroup>
                {/* the brief's baseline: every lane's survey line starts here */}
                <ol className="relative divide-y divide-rule before:absolute before:top-0 before:bottom-0 before:left-[2.5rem] before:hidden before:w-px before:bg-ink sm:before:left-[3rem] sm:before:block">
                  {lanes.map(({ ins, rank }) => (
                    <Lane
                      key={ins.id}
                      ins={ins}
                      site={sites[ins.siteId]}
                      brief={state.brief}
                      voided={voided.get(ins.siteId)}
                      restored={restored.has(ins.siteId)}
                      onToggle={toggle}
                      rank={rank}
                      ranked={rankedBy.get(ins.siteId)}
                    />
                  ))}
                </ol>
              </LayoutGroup>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8 lg:col-span-4" aria-label="How the scout is working">
          <Panel title="The plan">
            <PlanChecklist items={state.plan} running={running} finished={finished} />
          </Panel>
          <Panel title="Decisions" aside="where it changes its mind">
            <DecisionFeed decisions={state.decisions} sites={sites} />
          </Panel>
          {state.thoughts.length ? (
            <Panel title="Planner notes">
              <ol className="flex flex-col gap-2">
                {state.thoughts.map((t, i) => (
                  <li key={i} className={cn("text-sm leading-snug", i === state.thoughts.length - 1 ? "text-ink" : "text-ink-2")}>
                    {t}
                  </li>
                ))}
              </ol>
              {state.plannerTools.length ? (
                <ul className="mt-3 flex flex-col gap-1 border-t border-dotted border-rule pt-2">
                  {state.plannerTools.map((t) => (
                    <li key={t.id} className="font-mono text-[0.6875rem] leading-snug text-ink-2">
                      {t.name}
                      {t.summary && t.status !== "start" ? `: ${t.summary}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          ) : null}
          {state.usage && state.mode === "live" ? (
            <p className="font-mono text-[0.6875rem] text-ink-2">
              {state.usage.modelCalls} model calls · {num(state.usage.inputTokens)} in / {num(state.usage.outputTokens)} out tokens
            </p>
          ) : null}
        </aside>
      </main>
    </>
  );
}
