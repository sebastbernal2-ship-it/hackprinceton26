import { useEffect, useState } from "react";
import type { Exchange } from "./next-question";
import { MATCH_POOL, rankMatches, type Match } from "./matches";

const KEY = "foreground.matches";
const CHANGE = "foreground-matches";

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function notify() {
  window.dispatchEvent(new Event(CHANGE));
}

export function saveMatches(matches: Match[]) {
  sessionStorage.setItem(KEY, JSON.stringify(matches));
  notify();
}

export function seedMatches(brief: Exchange[]) {
  saveMatches(rankMatches(brief));
}

export function clearMatches() {
  sessionStorage.removeItem(KEY);
  notify();
}

/** Re-rank from the current brief plus any refine answers, then persist. */
export function refreshMatches(brief: Exchange[]) {
  saveMatches(rankMatches(brief));
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
  const stored = read();
  if (!stored) return rankMatches([]);
  try {
    const parsed = JSON.parse(stored) as Match[];
    if (!Array.isArray(parsed)) return rankMatches([]);
    return parsed.map((match) => {
      if (match.facts) return match;
      const source = MATCH_POOL.find((space) => space.address === match.address && space.detail === match.detail);
      return source ? { ...match, facts: source.facts } : match;
    });
  } catch {
    return rankMatches([]);
  }
}

/** Current Discover results for this tab. Falls back to an unbriefed ranking until intake seeds one. */
export function useMatches(): Match[] {
  // Session storage is read after mount so the first paint matches the server.
  const [matches, setMatches] = useState<Match[]>(() => rankMatches([]));

  useEffect(() => {
    const apply = () => setMatches(loadMatches());
    apply();
    return subscribe(apply);
  }, []);

  return matches;
}
