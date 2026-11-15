"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { STREAM_CPS } from "../motion";

export type LetterState = {
  status: "idle" | "streaming" | "ready" | "error";
  text: string;
  source: "claude" | "template" | null;
  error: string | null;
  /** the owner changed the text: a new set of asks must not overwrite it silently */
  edited: boolean;
  /** the asks the text was written from, to tell when it is out of date */
  askKey: string;
};

export const EMPTY_LETTER: LetterState = { status: "idle", text: "", source: null, error: null, edited: false, askKey: "" };

export type DraftInput = {
  siteId: string;
  brief: { concept: string; seats?: number; budgetUsd?: number };
  seats: number;
  askIds: string[];
};

/**
 * Drafts the letter from /api/offer as a stream and reveals it at STREAM_CPS (the model's own stream when it is
 * live, the template, which arrives whole, paced the same way). `received` is what the network has delivered; the
 * shown text trails it. Reduced motion shows text as it arrives, and a stale request is aborted by the next one.
 */
export function useLetter(initial: LetterState, onChange: (s: LetterState) => void) {
  const reduce = useReducedMotion();
  const [s, setS] = useState<LetterState>(initial);
  const [shown, setShown] = useState(initial.status === "ready" ? initial.text.length : 0);
  const received = useRef(initial.text);
  const finished = useRef(initial.status !== "streaming");
  const ctrl = useRef<AbortController | null>(null);
  const sRef = useRef(s);

  const commit = useCallback(
    (next: LetterState) => {
      sRef.current = next;
      setS(next);
      onChange(next);
    },
    [onChange],
  );

  const draft = useCallback(
    async (input: DraftInput) => {
      ctrl.current?.abort();
      const ac = new AbortController();
      ctrl.current = ac;
      received.current = "";
      finished.current = false;
      setShown(0);
      const askKey = input.askIds.join(",");
      commit({ status: "streaming", text: "", source: null, error: null, edited: false, askKey });
      try {
        const res = await fetch("/api/offer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId: input.siteId, brief: input.brief, seats: input.seats, askIds: input.askIds, stream: true }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const e = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(e.error ?? `HTTP ${res.status}`);
        }
        const source = res.headers.get("x-offer-source") === "claude" ? "claude" : "template";
        commit({ ...sRef.current, source });
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received.current += dec.decode(value, { stream: true });
          commit({ ...sRef.current, text: received.current });
        }
        finished.current = true;
        if (!received.current.trim()) throw new Error("The letter came back empty.");
      } catch (e) {
        if (ac.signal.aborted) return;
        finished.current = true;
        commit({ ...sRef.current, status: "error", error: e instanceof Error ? e.message : "Could not draft the letter." });
      }
    },
    [commit],
  );

  // the reveal trails the network at STREAM_CPS; the letter is "ready" (editable) once it has caught up
  useEffect(() => {
    if (s.status !== "streaming") return;
    if (reduce) {
      queueMicrotask(() => setShown(s.text.length));
      if (finished.current && s.text) commit({ ...sRef.current, status: "ready" });
      return;
    }
    let raf = 0;
    let last = performance.now();
    let pos = shown;
    const tick = (now: number) => {
      const target = sRef.current.text.length;
      pos = Math.min(target, pos + ((now - last) / 1000) * STREAM_CPS);
      last = now;
      setShown(Math.floor(pos));
      if (finished.current && pos >= sRef.current.text.length && sRef.current.text) commit({ ...sRef.current, status: "ready" });
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `shown` is read once as the starting point of this run; the loop owns it afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.status, reduce, commit]);

  useEffect(() => () => ctrl.current?.abort(), []);

  const edit = useCallback((text: string) => commit({ ...sRef.current, text, edited: true }), [commit]);
  return { letter: s, shown: s.status === "ready" ? s.text.length : Math.min(shown, s.text.length), draft, edit };
}
