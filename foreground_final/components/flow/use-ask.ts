"use client";

import { useCallback, useRef, useState, type Dispatch } from "react";
import type { FlowEvent } from "./flow-reducer";
import type { OfferBrief } from "./messages/offer-cta";

/**
 * A grounded question about the chosen space (POST /api/ask: the model sees this site's engine analysis and
 * nothing else). The answer joins the thread with its source; a failure joins it as a failure. Nothing is faked.
 */
export function useAsk(dispatch: Dispatch<FlowEvent>, siteId: string | null, brief: OfferBrief | null) {
  const [asking, setAsking] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  const say = useCallback(
    (text: string, source?: string) => dispatch({ type: "append", at: Date.now(), message: { kind: "assistantText", text, streaming: false, source } }),
    [dispatch],
  );

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || !siteId || !brief) return;
      dispatch({ type: "append", at: Date.now(), message: { kind: "user", text: q } });
      ctrl.current?.abort();
      const ac = new AbortController();
      ctrl.current = ac;
      setAsking(true);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId, question: q, brief: { concept: brief.concept, seats: brief.seats, budgetUsd: brief.budgetUsd } }),
          signal: ac.signal,
        });
        const data = (await res.json()) as { answer?: string; source?: string; error?: string };
        if (!res.ok || !data.answer) throw new Error(data.error ?? `HTTP ${res.status}`);
        say(data.answer, data.source);
      } catch (e) {
        if (ac.signal.aborted) return;
        say(`I could not answer that: ${e instanceof Error ? e.message : "the request failed"} Ask again in a moment.`);
      } finally {
        if (ctrl.current === ac) setAsking(false);
      }
    },
    [dispatch, siteId, brief, say],
  );

  const stop = useCallback(() => {
    ctrl.current?.abort();
    setAsking(false);
  }, []);

  return { ask, asking, stop, say };
}
