import { useSyncExternalStore } from "react";
import type { Exchange } from "./next-question";
import { rankMatches, type Match } from "./matches";

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

/** Current Discover results for this tab. Falls back to an unbriefed ranking until intake seeds one. */
export function useMatches(): Match[] {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  if (!stored) return rankMatches([]);
  try {
    return JSON.parse(stored) as Match[];
  } catch {
    return rankMatches([]);
  }
}
