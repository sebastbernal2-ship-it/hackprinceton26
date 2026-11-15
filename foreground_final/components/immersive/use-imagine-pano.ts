"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SideFace } from "@/lib/immersive/cube";
import type { FaceIndex, ImaginedVersion, PanoImagineErrorCode, PanoImagineEvent } from "@/lib/immersive/imagine-types";

export type PanoJob = {
  state: "running" | "done" | "error";
  background: boolean;
  faces: number;
  total: number;
  firstFaceMs?: number;
  ms?: number;
  cached?: boolean;
  error?: { code: PanoImagineErrorCode; message: string };
};

const MESSAGES: Partial<Record<PanoImagineErrorCode, string>> = {
  quota: "The image model is out of quota right now. Walking, Scanned and Empty still work; try Imagine again in a minute.",
  busy: "Imagine is busy with other rooms. Try again in a moment.",
  no_key: "Imagine is not set up here (no image model key).",
  blocked: "The image model declined this change. Try wording it differently.",
};

/**
 * Streams imagined cube faces for one change across the panos you walk through.
 * start(): a new change from the pano you stand in; ensure(): the same change for another pano (walking or prefetch).
 */
export function useImaginePano(siteId: string) {
  const [version, setVersion] = useState<ImaginedVersion | null>(null);
  const [jobs, setJobs] = useState<Record<string, PanoJob>>({});
  const instructionRef = useRef<string | null>(null);
  const started = useRef(new Set<string>());
  const aborts = useRef(new Set<AbortController>());

  useEffect(() => {
    const set = aborts.current;
    return () => {
      for (const a of set) a.abort();
    };
  }, []);

  const run = useCallback(
    async (instruction: string, panoId: string, lookFace: SideFace, background: boolean) => {
      const key = `${instruction}::${panoId}`;
      if (started.current.has(key)) return;
      started.current.add(key);
      const patch = (p: Partial<PanoJob>) => setJobs((j) => ({ ...j, [panoId]: { ...(j[panoId] ?? { state: "running", background, faces: 0, total: 4 }), ...p } }));
      const fail = (code: PanoImagineErrorCode, message?: string) => {
        started.current.delete(key); // retryable
        patch({ state: "error", error: { code, message: MESSAGES[code] ?? message ?? "Something went wrong while imagining this room." } });
      };
      patch({ state: "running", background, faces: 0, total: 4, error: undefined });
      const ctrl = new AbortController();
      aborts.current.add(ctrl);
      try {
        const res = await fetch("/api/imagine-pano", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId, panoId, instruction, lookFace }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { code?: PanoImagineErrorCode; error?: string };
          return fail((body.code as string | undefined) === "image_quota" ? "quota" : res.status === 429 ? "busy" : (body.code ?? "failed"), body.error);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        let ended = false;
        while (!ended) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let cut: number;
          while ((cut = buf.indexOf("\n\n")) >= 0) {
            const line = buf.slice(0, cut).replace(/^data: /, "");
            buf = buf.slice(cut + 2);
            if (!line) continue;
            const e = JSON.parse(line) as PanoImagineEvent;
            if (instructionRef.current !== instruction) return; // a newer change replaced this one
            if (e.type === "start") {
              patch({ total: e.stages.flat().length, cached: e.cached });
              setVersion((v) => (v && v.instruction === instruction ? { ...v, versionId: e.versionId } : v));
            } else if (e.type === "face") {
              setVersion((v) => {
                if (!v || v.instruction !== instruction) return v;
                const faces = { ...(v.panos[e.panoId] ?? {}), [e.face]: e.url } as Partial<Record<FaceIndex, string>>;
                return { ...v, panos: { ...v.panos, [e.panoId]: faces } };
              });
              setJobs((j) => {
                const cur = j[panoId];
                return { ...j, [panoId]: { ...cur, faces: (cur?.faces ?? 0) + 1, firstFaceMs: cur?.firstFaceMs ?? e.ms } };
              });
            } else if (e.type === "face_error") {
              if (e.code === "quota") patch({ error: { code: "quota", message: MESSAGES.quota! } });
            } else if (e.type === "done") {
              patch({ state: "done", ms: e.ms });
              ended = true;
            } else if (e.type === "error") {
              fail(e.code, e.message);
              ended = true;
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) fail("failed");
      } finally {
        aborts.current.delete(ctrl);
      }
    },
    [siteId],
  );

  /** Imagine a new change, starting with the pano you stand in and the face you look at. */
  const start = useCallback(
    (instruction: string, panoId: string, lookFace: SideFace) => {
      const text = instruction.trim();
      if (instructionRef.current !== text) {
        instructionRef.current = text;
        started.current.clear();
        setJobs({});
        setVersion({ versionId: "", instruction: text, panos: {} });
      }
      void run(text, panoId, lookFace, false);
    },
    [run],
  );

  /** The current change for another pano: when you walk there, or in the background for the pano ahead. */
  const ensure = useCallback(
    (panoId: string, lookFace: SideFace, background = false) => {
      const text = instructionRef.current;
      if (text) void run(text, panoId, lookFace, background);
    },
    [run],
  );

  const retry = useCallback(
    (panoId: string, lookFace: SideFace) => {
      const text = instructionRef.current;
      if (text) void run(text, panoId, lookFace, false);
    },
    [run],
  );

  return { version, jobs, start, ensure, retry };
}
