import { useEffect, useState } from "react";
import { readBrief } from "./brief";
import { fetchMatches } from "./api";
import { DEMO_FALLBACK } from "./demo-flag";
import { rankMatches } from "./demo-matches";
import type { Exchange } from "./next-question";
import type { Match } from "./matches";

const KEY = "foreground.matches.v2";
const CHANGE = "foreground-matches";

export type MatchesState =
  | { status: "loading" }
  /** `dataAvailable: false` means the API has no candidate registry loaded; it is not "no matches". */
  | { status: "ready"; matches: Match[]; dataAvailable: boolean; demo: boolean; notice?: string; scene?: "sarah" }
  | { status: "error"; message: string };

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let memory: MatchesState | null = null;
/** Requests under way; a page that mounts meanwhile waits for them instead of starting its own. */
let inflight = 0;

function save(state: MatchesState) {
  memory = state;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the next mount will refetch.
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function clearMatches() {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored to clear.
  }
  window.dispatchEvent(new Event(CHANGE));
}

/** Ask the API for matches for this brief and persist the outcome for this tab. */
export async function refreshMatches(brief: Exchange[], opts: { limit?: number; scene?: "sarah" } = {}): Promise<void> {
  inflight += 1;
  try {
    const { matches, dataAvailable } = await fetchMatches(brief, opts.limit);
    inflight -= 1;
    if (!dataAvailable && DEMO_FALLBACK) {
      save({ status: "ready", matches: rankMatches(brief), dataAvailable: false, demo: true });
      return;
    }
    save({ status: "ready", matches, dataAvailable, demo: false, ...(opts.scene ? { scene: opts.scene } : {}) });
  } catch (error) {
    inflight -= 1;
    if (DEMO_FALLBACK) {
      save({ status: "ready", matches: rankMatches(brief), dataAvailable: false, demo: true });
      return;
    }
    save({ status: "error", message: error instanceof Error ? error.message : "Could not load matches." });
  }
}

export const seedMatches = refreshMatches;

/** Show a fixed, labelled set of demo spaces instead of asking the API. */
export function showDemoMatches(matches: Match[], notice: string): void {
  save({ status: "ready", matches, dataAvailable: false, demo: true, notice });
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function load(): MatchesState | null {
  const stored = read();
  if (!stored) return memory;
  try {
    return JSON.parse(stored) as MatchesState;
  } catch {
    return null;
  }
}

/** Current Discover results for this tab. Fetches from the API when nothing is stored yet. */
export function useMatches(): MatchesState {
  // Session storage is read after mount so the first paint matches the server.
  const [state, setState] = useState<MatchesState>({ status: "loading" });

  useEffect(() => {
    const apply = () => {
      const stored = load();
      if (stored) setState(stored);
      else {
        setState({ status: "loading" });
        if (inflight === 0) void refreshMatches(readBrief());
      }
    };
    apply();
    return subscribe(apply);
  }, []);

  return state;
}
