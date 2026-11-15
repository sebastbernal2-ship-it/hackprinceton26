"use client";

import { useCallback, useMemo, useReducer, type Dispatch } from "react";
import { parseBriefRegex } from "@/lib/agent/brief";
import { createFlowState, flowReducer, type FlowEvent, type FlowSpace, type FlowState } from "./flow-reducer";
import type { FlowAction } from "./types";

export type Flow = {
  state: FlowState;
  /** what components call: the contract's FlowAction */
  onAction: (a: FlowAction) => void;
  /** the raw reducer, for wiring data in: append / update messages, set the phase */
  dispatch: Dispatch<FlowEvent>;
  /** the old search page for the current brief, once the brief is complete */
  searchHref: string | null;
};

/** Phase + messages for the single-route flow. All state lives in flow-reducer.ts. */
export function useFlow(init: { spaces: FlowSpace[] }): Flow {
  const [state, dispatch] = useReducer(flowReducer, init, createFlowState);

  const onAction = useCallback((a: FlowAction) => {
    switch (a.type) {
      case "send":
        dispatch({ type: "send", text: a.text, parsed: parseBriefRegex(a.text), at: Date.now() });
        return;
      case "answer":
        dispatch({ type: "answer", messageId: a.messageId, value: a.value, at: Date.now() });
        return;
      case "pick":
        dispatch({ type: "pick", siteId: a.siteId });
        return;
      case "back":
        dispatch({ type: "back" });
        return;
      // stop, walkGo, holdBefore, draftOffer: handled by the steps that own them (search, walk, offer)
      default:
        return;
    }
  }, []);

  const searchHref = useMemo(() => (state.query ? `/search?q=${encodeURIComponent(state.query)}` : null), [state.query]);

  return { state, onAction, dispatch, searchHref };
}
