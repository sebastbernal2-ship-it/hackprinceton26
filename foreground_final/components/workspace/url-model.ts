import type { Concept, OwnerBrief } from "@/lib/engine/types";

/**
 * Every piece of workspace state lives in the URL, so any link opens the exact view a person was looking at.
 * - view / cmp / v / d / tab are client state mirrored with history.replaceState (no server round trip).
 * - concept / seats / budget re-run the engine on the server (see useWorkspaceState in url-state.ts).
 * Plain module: the page parses the same URL on the server.
 */
export const VIEWS = ["walk", "plan", "above", "numbers"] as const;
export type View = (typeof VIEWS)[number];
export const COMPARES = ["scanned", "empty", "imagined"] as const;
export type Compare = (typeof COMPARES)[number];
export type Density = "owner" | "broker";
export type SheetTab = "read" | "imagine";

export type UiState = { view: View; cmp: Compare; v: string | null; d: Density; tab: SheetTab };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseUi(sp: Search): UiState {
  const view = one(sp.view) as View | undefined;
  const cmp = one(sp.cmp) as Compare | undefined;
  const v = one(sp.v);
  return {
    view: view && VIEWS.includes(view) ? view : "walk",
    cmp: cmp && COMPARES.includes(cmp) ? cmp : "scanned",
    v: v && /^[\w-]{1,24}$/.test(v) ? v : null,
    d: one(sp.d) === "broker" ? "broker" : "owner",
    tab: one(sp.tab) === "imagine" ? "imagine" : "read",
  };
}

export const DEFAULTS: UiState = { view: "walk", cmp: "scanned", v: null, d: "owner", tab: "read" };

export function writeUi(params: URLSearchParams, ui: UiState) {
  (Object.keys(DEFAULTS) as (keyof UiState)[]).forEach((k) => {
    const val = ui[k];
    if (val === null || val === DEFAULTS[k]) params.delete(k);
    else params.set(k, String(val));
  });
}

/** The brief part of the query, for links that carry it to another site or the offer page. */
export function briefQuery(brief: Pick<OwnerBrief, "concept" | "seats" | "budgetUsd">): string {
  const q = new URLSearchParams({ concept: brief.concept });
  if (brief.seats) q.set("seats", String(brief.seats));
  if (brief.budgetUsd) q.set("budget", String(brief.budgetUsd));
  return q.toString();
}

export const CONCEPT_LABEL: Record<Concept, string> = {
  "quick-service": "Quick service",
  "fast-casual": "Fast casual",
  "full-service": "Full service",
  cafe: "Cafe",
  bar: "Bar",
};

export const VIEW_LABEL: Record<View, { name: string; hint: string }> = {
  walk: { name: "Walk", hint: "Inside the scan" },
  plan: { name: "Plan", hint: "Your layout" },
  above: { name: "Above", hint: "Aerial" },
  numbers: { name: "Numbers", hint: "Money" },
};
