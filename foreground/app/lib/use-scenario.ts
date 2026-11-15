"use client";
import { useEffect, useRef, useState } from "react";

export type Scenario<T> = {
  /** Latest response, kept while a newer request is in flight (the page dims it and says "recalculating"). */
  data: T | null;
  /** The response before `data`, for per-line before/after deltas. */
  prev: T | null;
  /** True while the inputs have changed and their response has not arrived. */
  pending: boolean;
  failed: boolean;
  /** Increments with every response, so the page can restart a "recalculated" flash. */
  version: number;
  /** Time of the last response. */
  at: number | null;
};

/** Debounced fetch keyed by the scenario's inputs. A null key means "nothing to fetch". `run` is read at fire time. */
export function useScenario<T>(key: string | null, run: () => Promise<T>, delayMs = 250): Scenario<T> {
  const [s, setS] = useState<{ key: string | null; data: T | null; prev: T | null; version: number; at: number | null; failedKey: string | null }>({ key: null, data: null, prev: null, version: 0, at: null, failedKey: null });
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; });
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const t = setTimeout(() => {
      runRef.current().then(
        (d) => live && setS((o) => ({ key, data: d, prev: o.data, version: o.version + 1, at: Date.now(), failedKey: null })),
        () => live && setS((o) => ({ ...o, failedKey: key })),
      );
    }, delayMs);
    return () => { live = false; clearTimeout(t); };
  }, [key, delayMs]);
  const failed = key !== null && s.failedKey === key;
  return { data: key === null ? null : s.data, prev: key === null ? null : s.prev, pending: key !== null && s.key !== key && !failed, failed, version: s.version, at: s.at };
}

/** Change in a number between renders (set during render, so it is visible in the same frame the value moves). */
export function useDelta(value: number | null): { prev: number | null; n: number } {
  const [s, setS] = useState<{ cur: number | null; prev: number | null; n: number }>({ cur: value, prev: null, n: 0 });
  if (value !== s.cur) setS({ cur: value, prev: s.cur, n: s.n + 1 });
  return { prev: s.prev, n: s.n };
}
