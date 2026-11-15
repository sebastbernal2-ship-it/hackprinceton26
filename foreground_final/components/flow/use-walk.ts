"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import { getOutlook, type WalkData } from "@/app/flow-actions";
import type { PanoViewerHandle } from "@/components/immersive/pano-viewer";
import { useImaginePano } from "@/components/immersive/use-imagine-pano";
import type { ImaginedVersion } from "@/lib/immersive/imagine-types";
import { seatCount } from "@/lib/layout";
import type { ImagineEvent } from "@/lib/imagine/types";
import { summarizeImagine } from "@/lib/imagine/walk-result";
import { DUR } from "./motion";
import { lastOfKind, type FlowEvent, type FlowState } from "./flow-reducer";
import type { MessageBody } from "./types";

/**
 * The Walk, Imagine, Numbers and Deal steps. The tour comes from the shared deal (`walk`: undefined while it
 * loads, null when the space has no walkable scan). It appends a walkStep per stop as the owner moves (the viewer
 * glides there), turns typed text into an Imagine request on the current room, and appends the outlook (chapter
 * Numbers) and the offer (chapter Deal). All messages go through the flow reducer.
 */
export function useWalk(state: FlowState, dispatch: Dispatch<FlowEvent>, siteId: string | null, walk: WalkData | null | undefined) {
  const inWalk = state.chapter === "walk";
  const viewerRef = useRef<PanoViewerHandle>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const data = siteId && walk ? walk : null;
  const loaded = walk !== undefined;
  const [index, setIndex] = useState(0);
  const [pano, setPano] = useState<string | null>(null);
  const [pinShown, setPinShown] = useState(false);
  const [held, setHeld] = useState(false);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imagine = useImaginePano(siteId ?? "");
  const tracking = useRef<{ panoId: string; face: 1 | 2 | 3 | 4 } | null>(null);
  const outlooking = useRef(false);

  const say = useCallback((text: string) => dispatch({ type: "append", at: Date.now(), message: { kind: "assistantText", text, streaming: false } }), [dispatch]);

  const stepBody = useCallback(
    (i: number): MessageBody | null => {
      const s = data?.stops[i];
      if (!data || !s) return null;
      return {
        kind: "walkStep",
        siteId: data.site.id,
        index: i,
        total: data.stops.length,
        panoId: s.panoId,
        title: s.title,
        text: s.text,
        streaming: false,
        state: "active",
        source: s.source,
        pin: s.pin,
      };
    },
    [data],
  );

  const showPinAfterGlide = useCallback(() => {
    if (pinTimer.current) clearTimeout(pinTimer.current);
    queueMicrotask(() => setPinShown(false));
    pinTimer.current = setTimeout(() => setPinShown(true), DUR.glide * 1000);
  }, []);
  useEffect(
    () => () => {
      if (pinTimer.current) clearTimeout(pinTimer.current);
    },
    [],
  );

  // 2. first stop: the viewer starts there, the first step is appended once, when the Walk chapter opens
  useEffect(() => {
    if (!siteId || state.phase !== "walk" || !inWalk) return;
    if (loaded && !data) {
      if (!state.messages.some((m) => m.kind === "assistantText" && m.text.startsWith("This space has no"))) {
        say("This space has no walkable 360 scan. Full details has its photos and numbers.");
      }
      return;
    }
    if (!data || state.messages.some((m) => m.kind === "walkStep" && m.siteId === siteId)) return;
    const body = stepBody(0);
    if (!body) return;
    const first = data.stops[0].panoId;
    const v = viewerRef.current;
    if (v) {
      if (v.panoId() !== first) v.goTo(first);
      // face the finding (or the most open direction), never a blank wall
      if (data.stops[0].look) v.lookAt(data.stops[0].look, first);
    }
    queueMicrotask(() => {
      setIndex(0);
      setPano(first);
    });
    showPinAfterGlide();
    dispatch({ type: "append", at: Date.now(), message: body });
  }, [siteId, state.phase, inWalk, state.messages, data, loaded, stepBody, dispatch, say, showPinAfterGlide]);

  // coming back to the Walk from another chapter: face the current stop's finding again, not wherever the view was left
  const dataRef = useRef(data);
  const indexRef = useRef(index);
  useEffect(() => {
    dataRef.current = data;
    indexRef.current = index;
  });
  useEffect(() => {
    if (!inWalk) return;
    const stop = dataRef.current?.stops[indexRef.current];
    const v = viewerRef.current;
    if (stop?.look && v && v.panoId() === stop.panoId) v.lookAt(stop.look, stop.panoId);
  }, [inWalk]);

  /** the Numbers chapter shows the outlook, the Deal chapter the offer; each is appended to the Guide once */
  const ensure = useCallback(
    async (which: "outlookChart" | "offerCta") => {
      const b = stateRef.current.brief;
      if (!siteId || !b || outlooking.current) return;
      if (stateRef.current.messages.some((m) => m.kind === which && m.siteId === siteId)) return;
      outlooking.current = true;
      try {
        const plan = stateRef.current.layout;
        // the plan's seats and concept once there is a plan, not the first sentence the owner typed
        const r = await getOutlook(siteId, { concept: plan?.concept ?? b.concept, seats: plan ? seatCount(plan) : b.seats, budgetUsd: b.budgetUsd });
        if (!r) {
          say("I could not work out the numbers for this space.");
          return;
        }
        // a second chapter may have asked while this was in flight
        if (stateRef.current.messages.some((m) => m.kind === which && m.siteId === siteId)) return;
        dispatch({ type: "append", at: Date.now(), message: which === "outlookChart" ? r.outlook : r.offer });
      } catch {
        say("I could not work out the numbers for this space.");
      } finally {
        outlooking.current = false;
      }
    },
    [siteId, dispatch, say],
  );

  const go = useCallback(
    (i: number) => {
      if (!data) return;
      const stop = data.stops[i];
      if (!stop || i < 0) return;
      viewerRef.current?.goTo(stop.panoId);
      if (stop.look) viewerRef.current?.lookAt(stop.look, stop.panoId);
      setIndex(i);
      setPano(stop.panoId);
      showPinAfterGlide();
      if (!stateRef.current.messages.some((m) => m.kind === "walkStep" && m.siteId === data.site.id && m.index === i)) {
        const body = stepBody(i);
        if (body) dispatch({ type: "append", at: Date.now(), message: body });
      }
      dispatch({ type: "walkActive", siteId: data.site.id, index: i });
    },
    [data, dispatch, stepBody, showPinAfterGlide],
  );

  // the checks, citations, permit weeks and cost for the same change: the planner/checks/numbers stream with no images
  const feasibility = useCallback(
    async (instruction: string, shown: string) => {
      const b = stateRef.current.brief;
      if (!data || !b) return;
      const patch = (p: Partial<Extract<MessageBody, { kind: "imagineResult" }>>) => {
        const m = [...stateRef.current.messages].reverse().find((x) => x.kind === "imagineResult" && x.instruction === shown);
        if (m) dispatch({ type: "update", id: m.id, update: (x) => (x.kind === "imagineResult" ? { ...x, ...p } : x) });
      };
      patch({ feasibility: "loading" });
      try {
        const layout = stateRef.current.layout;
        const res = await fetch("/api/imagine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId: data.site.id, brief: b, instruction, maxViews: 0, ...(layout ? { layout } : {}) }),
        });
        if (!res.ok || !res.body) return patch({ feasibility: "none", feasibilityNote: "Could not price this change just now." });
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        let assessment: Extract<ImagineEvent, { type: "checks" }>["assessment"] | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let cut: number;
          while ((cut = buf.indexOf("\n\n")) >= 0) {
            const line = buf.slice(0, cut).replace(/^data: /, "");
            buf = buf.slice(cut + 2);
            if (!line) continue;
            const e = JSON.parse(line) as ImagineEvent;
            if (e.type === "error") return patch({ feasibility: "none", feasibilityNote: e.message });
            if (e.type === "checks") assessment = e.assessment;
            if (e.type === "numbers" && assessment) {
              const s = summarizeImagine(assessment, e.costDelta, b.budgetUsd);
              patch({ feasibility: "done", checks: s.checks, permitWeeks: s.permitWeeks, costDeltaUsd: s.costDeltaUsd, tone: s.tone });
              void reader.cancel();
              return;
            }
          }
        }
        patch({ feasibility: "none", feasibilityNote: "Could not price this change just now." });
      } catch {
        patch({ feasibility: "none", feasibilityNote: "Could not price this change just now." });
      }
    },
    [data, dispatch],
  );

  // 3. Imagine: typed text during the walk reimagines the room you stand in
  const runImagine = useCallback(
    (text: string, shown?: string) => {
      const t = text.trim();
      if (!t || !data) return;
      const panoId = viewerRef.current?.panoId() || pano || data.stops[0].panoId;
      const face = viewerRef.current?.lookFace() ?? 1;
      const at = Date.now();
      dispatch({ type: "append", at, message: { kind: "user", text: shown ?? t } });
      if (imagine.jobs[panoId]?.state === "running") {
        say("Still working on the last change in this room. Give it a moment, then try the next one.");
        return;
      }
      const skybox = data.site.matterport.panos.find((p) => p.id === panoId)?.skybox;
      tracking.current = { panoId, face };
      dispatch({
        type: "append",
        at,
        message: { kind: "imagineResult", siteId: data.site.id, panoId, instruction: shown ?? t, status: "running", stage: "Getting this room ready", beforeUrl: skybox?.[face], tone: "info" },
      });
      imagine.start(t, panoId, face);
      void feasibility(t, shown ?? t);
    },
    [data, pano, imagine, dispatch, say, feasibility],
  );

  // fold the stream's progress into the imagineResult message
  const { jobs, version } = imagine;
  useEffect(() => {
    const track = tracking.current;
    const msg = lastOfKind(stateRef.current, "imagineResult");
    if (!track || !msg || msg.panoId !== track.panoId) return;
    const job = jobs[track.panoId];
    if (!job) return;
    const after = version?.panos[track.panoId]?.[track.face];
    const patch =
      job.state === "error"
        ? { status: "error" as const, error: job.error?.message, stage: undefined }
        : job.state === "done"
          ? {
              status: "done" as const,
              stage: undefined,
              afterUrl: after,
              note: job.cached ? `Saved from an earlier run of "${version?.instruction ?? msg.instruction}".` : "",
            }
          : {
              status: "running" as const,
              afterUrl: after,
              stage: job.faces === 0 ? "Imagining the wall you are facing" : `Imagining: ${job.faces} of ${job.total} walls done`,
            };
    dispatch({ type: "update", id: msg.id, update: (m) => (m.kind === "imagineResult" ? { ...m, ...patch } : m) });
  }, [jobs, version, dispatch]);

  const here = pano ?? data?.stops[0]?.panoId ?? null;
  const hasFaces = Boolean(here && version?.panos[here] && Object.keys(version.panos[here]).length);
  const imagined: ImaginedVersion | null = hasFaces ? version : null;
  const working = Boolean(here && jobs[here]?.state === "running");
  const stop = data?.stops[index];

  return {
    data,
    viewerRef,
    index,
    total: data?.stops.length ?? 0,
    focus: stop && pinShown ? { panoId: stop.panoId, pin: stop.pin } : stop ? { panoId: stop.panoId } : undefined,
    imagined,
    showBefore: held,
    working,
    go,
    ensure,
    imagineText: runImagine,
    hold: setHeld,
    onPano: setPano,
  };
}
