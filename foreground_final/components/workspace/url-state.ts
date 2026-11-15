"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { OwnerBrief } from "@/lib/engine/types";
import { parseUi, writeUi, type UiState } from "./url-model";

export * from "./url-model";

export function useWorkspaceState(initial: UiState) {
  const [ui, setUi] = useState(initial);
  const uiRef = useRef(ui);
  const written = useRef(false);
  const router = useRouter();
  const [briefPending, startBrief] = useTransition();

  // Back/forward or a pasted link on the same page: follow the URL.
  useEffect(() => {
    const onPop = () => {
      written.current = false;
      setUi(parseUi(Object.fromEntries(new URLSearchParams(window.location.search))));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // the URL follows the state after commit: writing history from inside a state updater updates Next's router while React renders
  useEffect(() => {
    uiRef.current = ui;
    if (!written.current) return;
    const params = new URLSearchParams(window.location.search);
    writeUi(params, ui);
    const q = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, [ui]);

  const update = useCallback((patch: Partial<UiState>) => {
    written.current = true;
    // chained updates in one event (view, then compare) build on each other
    const next = { ...uiRef.current, ...patch };
    uiRef.current = next;
    setUi(next);
  }, []);

  const setBrief = useCallback(
    (brief: Pick<OwnerBrief, "concept" | "seats" | "budgetUsd">) => {
      const params = new URLSearchParams(window.location.search);
      params.set("concept", brief.concept);
      if (brief.seats) params.set("seats", String(brief.seats));
      if (brief.budgetUsd) params.set("budget", String(brief.budgetUsd));
      startBrief(() => router.replace(`${window.location.pathname}?${params}`, { scroll: false }));
    },
    [router],
  );

  return { ui, update, setBrief, briefPending };
}

