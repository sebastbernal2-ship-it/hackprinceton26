"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, type Dispatch } from "react";
import { useAgentStream } from "@/components/results/use-agent-stream";
import { lastOfKind, type FlowEvent, type FlowState } from "./flow-reducer";
import { buildNoFitText, buildPicks, buildSearchView } from "./search-map";

/** a recorded run plays this much faster than it was recorded, so a demo does not wait a full minute */
const REPLAY_SPEED = 4;

const noop = () => () => {};

/** `/?replay=1` asks for the recorded run (demos, no model spend). Nothing else ever does. */
export function useReplayFlag(): boolean {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get("replay") === "1",
    () => false,
  );
}

/**
 * Runs the agent when the brief completes (state.query) and folds its stream into the thread: the searchProgress
 * message ticks forward, and when the run ends the top three become a pickCards message and the phase goes to
 * "pick". The run is live unless the URL says `?replay=1`. A live run that fails shows its error and a Retry
 * (`retry()`); it never switches to a recording on its own.
 */
export function useSearch(state: FlowState, dispatch: Dispatch<FlowEvent>) {
  const query = state.query;
  const replay = useReplayFlag();
  const progress = lastOfKind(state, "searchProgress");
  const progressId = progress?.id;
  // only runs that started after this search's message was added may touch the thread (a reset leaves the old run's state behind)
  const since = progress?.at ?? Infinity;
  const finishedFor = useRef<number | null>(null);

  const { state: run, start, stop } = useAgentStream({ query: query ?? "", replay, speed: replay ? REPLAY_SPEED : undefined });

  const current = Boolean(query) && run.startedAt !== null && run.startedAt >= since;
  const spaces = state.spaces;
  const budgetUsd = state.brief?.budgetUsd;

  useEffect(() => {
    if (!current || !progressId || run.status === "idle") return;
    const view = buildSearchView(run, spaces);
    // a retry starts a fresh run in the same message: clear the old error with it
    dispatch({ type: "update", id: progressId, update: (m) => (m.kind === "searchProgress" ? { ...m, error: undefined, ...view } : m) });

    const ended = run.status === "done" || run.status === "aborted" || run.status === "error";
    if (!ended || finishedFor.current === run.startedAt) return;
    finishedFor.current = run.startedAt;
    if (run.status === "error") return;
    const at = Date.now();
    const picks = buildPicks(run.ranking, spaces);
    if (picks.length) {
      dispatch({ type: "append", at, message: { kind: "pickCards", intro: `${picks.length === 1 ? "One space is" : `${picks.length} spaces are`} worth walking through.`, picks } });
      dispatch({ type: "phase", phase: "pick" });
    } else if (run.status === "done") {
      dispatch({ type: "append", at, message: { kind: "assistantText", text: buildNoFitText(run.inspectors, budgetUsd), streaming: false } });
    }
  }, [run, current, progressId, spaces, budgetUsd, dispatch]);

  const running = Boolean(query) && current && (run.status === "connecting" || run.status === "streaming");
  const retry = useCallback(() => void start(), [start]);

  return { running, stop, retry, replay, recordedQuery: run.recordedQuery };
}
