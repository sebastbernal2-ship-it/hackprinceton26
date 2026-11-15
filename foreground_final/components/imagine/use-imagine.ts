"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OwnerBrief } from "@/lib/engine/types";
import type { Change } from "@/lib/feasibility/types";
import { evaluate } from "@/lib/imagine/numbers";
import type { ImagineEvent, ImagineVersion, Stage } from "@/lib/imagine/types";
import { loadVersions, nextLabel, removeVersion, saveVersions, toRef } from "@/lib/imagine/versions";
import type { Layout, Op } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";

export type RunState = { status: "idle" | "running" | "error"; stage: Stage | null; done: Stage[]; timings: Partial<Record<Stage, number>>; error: string | null; instruction: string };

const IDLE: RunState = { status: "idle", stage: null, done: [], timings: {}, error: null, instruction: "" };

/**
 * Imagine state: the version tree (kept in localStorage per site), the live run, and local re-pricing when a
 * line item is edited. `baseLayout` is the plan every version is measured against.
 */
export function useImagine(opts: {
  site: Site;
  brief: OwnerBrief;
  baseLayout: Layout | null;
  onLayoutOps?: (ops: Op[], layout: Layout | null) => void;
  getScreenshot?: () => Promise<string | null>;
}) {
  const { site, brief, baseLayout } = opts;
  const [versions, setVersions] = useState<ImagineVersion[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>(IDLE);
  const abort = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const callbacks = useRef(opts);
  useEffect(() => {
    callbacks.current = opts;
  });

  // stored versions arrive after hydration, so the server HTML and the first client render agree
  useEffect(() => {
    const stored = loadVersions(window.localStorage, site.id);
    loaded.current = true;
    if (stored.length === 0) return;
    // reading browser storage after mount is the external sync this effect exists for
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVersions(stored);
    setCurrentId(stored[stored.length - 1].id);
  }, [site.id]);

  useEffect(() => {
    if (loaded.current) saveVersions(window.localStorage, site.id, versions);
  }, [site.id, versions]);

  useEffect(() => () => abort.current?.abort(), []);

  const patch = useCallback((id: string, fn: (v: ImagineVersion) => ImagineVersion) => setVersions((list) => list.map((v) => (v.id === id ? fn(v) : v))), []);

  const start = useCallback(
    async (instruction: string) => {
      const text = instruction.trim();
      if (text.length < 3 || abort.current) return;
      const parent = versions.find((v) => v.id === currentId) ?? null;
      const controller = new AbortController();
      abort.current = controller;
      setRun({ ...IDLE, status: "running", stage: "plan", instruction: text });
      let id: string | null = null;
      let failed: string | null = null;
      let draft: Partial<ImagineVersion> = {};
      const stageDone = (stage: Stage, ms: number) => setRun((r) => ({ ...r, done: r.done.includes(stage) ? r.done : [...r.done, stage], timings: { ...r.timings, [stage]: ms } }));

      const handle = (e: ImagineEvent) => {
        switch (e.type) {
          case "stage":
            return setRun((r) => ({ ...r, stage: e.stage }));
          case "plan":
            id = e.id;
            draft = { id: e.id, parentId: parent?.id ?? null, instruction: text, changeSpec: e.changeSpec, layout: e.layout, plannedBy: e.plannedBy, notes: e.notes };
            return stageDone("plan", e.ms);
          case "checks":
            draft = { ...draft, assessment: e.assessment, checks: e.assessment.checks };
            return stageDone("checks", e.ms);
          case "numbers": {
            stageDone("numbers", e.ms);
            const version = { ...draft, numbers: e.numbers, costDelta: e.costDelta, images: [], imageError: null, qa: null, createdAt: new Date().toISOString() } as Omit<ImagineVersion, "label">;
            setVersions((list) => [...list, { ...version, label: nextLabel(list, version.parentId) }]);
            setCurrentId(version.id);
            const added = version.changeSpec.layoutOps.slice(parent?.changeSpec.layoutOps.length ?? 0);
            if (added.length) callbacks.current.onLayoutOps?.(added, version.layout);
            return;
          }
          case "image":
            return id && patch(id, (v) => ({ ...v, images: [...v.images.filter((i) => i.view !== e.image.view), e.image].sort((a, b) => a.view.localeCompare(b.view)) }));
          case "images":
            stageDone("images", e.ms);
            return id && patch(id, (v) => ({ ...v, imageError: e.error }));
          case "qa":
            stageDone("qa", e.ms);
            return id && patch(id, (v) => ({ ...v, qa: e.qa }));
          case "error":
            failed = e.message;
            return;
          case "done":
            return;
        }
      };

      try {
        const screenshot = (await callbacks.current.getScreenshot?.()) ?? undefined;
        const res = await fetch("/api/imagine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId: site.id, brief, instruction: text, ...(parent ? { parentVersion: toRef(parent) } : {}), ...(baseLayout ? { layout: baseLayout } : {}), ...(screenshot ? { screenshot } : {}) }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Imagine could not be reached. Try again.");
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (line) handle(JSON.parse(line.slice(6)) as ImagineEvent);
          }
        }
        setRun(failed ? { ...IDLE, status: "error", error: failed, instruction: text } : IDLE);
      } catch (err) {
        if (controller.signal.aborted) setRun(IDLE);
        else setRun({ ...IDLE, status: "error", error: err instanceof Error ? err.message : "Imagine could not be reached. Try again.", instruction: text });
      } finally {
        abort.current = null;
      }
    },
    [versions, currentId, site.id, brief, baseLayout, patch],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  /** Edit or switch off a line item: checks, costs and break-even are re-run in the browser. */
  const editChange = useCallback(
    (versionId: string, changeId: string, next: Partial<Pick<Change, "enabled" | "quantities">>) =>
      patch(versionId, (v) => {
        const changes = v.changeSpec.changes.map((c) => (c.id === changeId ? { ...c, ...next, quantities: { ...c.quantities, ...next.quantities } } : c));
        const e = evaluate({ site, brief, changes, layoutOps: v.changeSpec.layoutOps, baseLayout });
        return { ...v, changeSpec: { ...v.changeSpec, changes }, layout: e.layout, assessment: e.assessment, checks: e.assessment.checks, numbers: e.numbers, costDelta: e.costDelta };
      }),
    [patch, site, brief, baseLayout],
  );

  const undo = useCallback(
    (id: string) => {
      const r = removeVersion(versions, id);
      setVersions(r.versions);
      setCurrentId(r.current);
    },
    [versions],
  );

  return { versions, current: versions.find((v) => v.id === currentId) ?? null, select: setCurrentId, run, start, stop, editChange, undo };
}
