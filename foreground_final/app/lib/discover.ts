import { useEffect, useState } from "react";
import type { Exchange } from "./next-question";
import type { Match } from "./matches";

/** The owner's brief as the backend reads it (lib/engine OwnerBrief). */
export type OwnerBrief = {
  concept?: "quick-service" | "fast-casual" | "full-service" | "cafe" | "bar";
  cuisine?: string;
  seats?: number;
  budgetUsd?: number;
  city?: "Houston" | "Los Angeles";
  mustHaves?: string[];
};

export type SearchStep = { id: string; text: string; tone: "plan" | "tool" | "site" | "keep" | "drop" | "note" };

export type SearchState = {
  status: "idle" | "searching" | "done" | "error";
  steps: SearchStep[];
  /** the agent's closing summary, when it wrote one */
  summary?: string;
  /** how the shortlist was ranked */
  source?: "agent" | "fallback";
  error?: string;
};

const KEY = "foreground.matches";
const BRIEF_KEY = "foreground.ownerBrief";
const CHANGE = "foreground-matches";

let state: SearchState = { status: "idle", steps: [] };
let running: AbortController | null = null;

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function notify() {
  window.dispatchEvent(new Event(CHANGE));
}

function setState(patch: Partial<SearchState>) {
  state = { ...state, ...patch };
  notify();
}

export function saveMatches(matches: Match[]) {
  sessionStorage.setItem(KEY, JSON.stringify(matches));
  notify();
}

export function saveOwnerBrief(brief: OwnerBrief) {
  sessionStorage.setItem(BRIEF_KEY, JSON.stringify(brief));
  notify();
}

export function readOwnerBrief(): OwnerBrief | null {
  const raw = read(BRIEF_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OwnerBrief;
  } catch {
    return null;
  }
}

/** The brief in one line, as the agent reads it. */
export function briefText(brief: Exchange[]): string {
  return brief
    .map((e) => e.answer.trim())
    .filter(Boolean)
    .join(". ")
    .slice(0, 480);
}

/** Starts the search agent on the intake answers. Returns at once; Discover follows along through useSearch(). */
export function seedMatches(brief: Exchange[]) {
  void runSearch(brief);
}

/** Re-rank from the current brief plus any refine answers. */
export function refreshMatches(brief: Exchange[]) {
  void runSearch(brief);
}

export function clearMatches() {
  running?.abort();
  running = null;
  state = { status: "idle", steps: [] };
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(BRIEF_KEY);
  notify();
}

async function fetchMatches(brief: OwnerBrief | null): Promise<Match[]> {
  const res = await fetch("/api/sites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brief, limit: 4 }),
  });
  if (!res.ok) throw new Error(`Could not load spaces (HTTP ${res.status}).`);
  return ((await res.json()) as { matches: Match[] }).matches;
}

/**
 * Finds spaces for the brief: Claude reads the answers into a brief (/api/intake), then the cost engine scores
 * every CoStar site against it (/api/sites). No long agent run, so results arrive in a few seconds.
 */
async function runSearch(exchanges: Exchange[]) {
  running?.abort();
  const ctrl = new AbortController();
  running = ctrl;
  state = { status: "searching", steps: [] };
  notify();
  try {
    let brief: OwnerBrief | null = null;
    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history: exchanges.slice(-12), maxQuestions: 1 }),
      signal: ctrl.signal,
    });
    if (res.ok) brief = ((await res.json()) as { brief: OwnerBrief }).brief;
    if (brief) saveOwnerBrief(brief);
    const matches = await fetchMatches(brief);
    if (running !== ctrl) return;
    saveMatches(matches);
    setState({ status: "done", source: "fallback" });
    prewarmTours(matches);
  } catch (err) {
    if (ctrl.signal.aborted || running !== ctrl) return;
    setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (running === ctrl) running = null;
  }
}

/** Starts Gemini tracing each match's floorplan in the background, so Imagine opens without the wait. */
function prewarmTours(matches: Match[]) {
  void (async () => {
    for (const m of matches) {
      if (!m.tourId) continue;
      await fetch("/api/layout-analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: m.tourId, squareFeet: m.squareFeet }),
      }).catch(() => null);
    }
  })();
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function loadMatches(): Match[] {
  const stored = read(KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as Match[];
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.siteId === "string") : [];
  } catch {
    return [];
  }
}

/** Current Discover results for this tab: empty until the agent (or its fallback) has ranked some spaces. */
export function useMatches(): Match[] {
  // Session storage is read after mount so the first paint matches the server.
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    const apply = () => setMatches(loadMatches());
    apply();
    return subscribe(apply);
  }, []);

  return matches;
}

/** The live search: what the agent is doing right now. */
export function useSearch(): SearchState {
  const [current, setCurrent] = useState<SearchState>({ status: "idle", steps: [] });
  useEffect(() => {
    const apply = () => setCurrent(state);
    apply();
    return subscribe(apply);
  }, []);
  return current;
}

/** The parsed brief (concept, seats, budget) for grounded chat and cost reports. */
export function useOwnerBrief(): OwnerBrief | null {
  const [brief, setBrief] = useState<OwnerBrief | null>(null);
  useEffect(() => {
    const apply = () => setBrief(readOwnerBrief());
    apply();
    return subscribe(apply);
  }, []);
  return brief;
}
