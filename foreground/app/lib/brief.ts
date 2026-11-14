import { useSyncExternalStore } from "react";
import type { Exchange } from "./next-question";

const KEY = "foreground.brief";
const CHANGE = "foreground-brief";

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

export function saveBrief(brief: Exchange[]) {
  sessionStorage.setItem(KEY, JSON.stringify(brief));
  notify();
}

export function clearBrief() {
  sessionStorage.removeItem(KEY);
  notify();
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readBrief(): Exchange[] {
  const stored = read();
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as Exchange[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The intake answers, kept for this browser tab. Empty until the intake has been completed. */
export function useBrief(): Exchange[] {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Exchange[];
  } catch {
    return [];
  }
}
