"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { STREAM_CPS } from "../motion";

/** message ids whose text has already been revealed once; a remount (layout change) must not retype them */
const settled = new Set<string>();

export function isSettled(id: string): boolean {
  return settled.has(id);
}

/**
 * Assistant text revealed at STREAM_CPS behind a 2px `live` caret. The whole text is laid out from the first
 * frame (the unrevealed part is transparent), so nothing below it moves while it types. `streaming` means more
 * text may still arrive: the caret stays until the reveal has caught up and streaming has ended.
 */
export function StreamText({
  id,
  text,
  streaming = false,
  className,
}: {
  id: string;
  text: string;
  streaming?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(() => (settled.has(id) ? text.length : 0));
  const shownRef = useRef(shown);

  useEffect(() => {
    if (reduce) return;
    const from = shownRef.current;
    if (from >= text.length) {
      if (!streaming) settled.add(id);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const n = Math.min(text.length, from + Math.floor(((now - start) / 1000) * STREAM_CPS));
      if (n !== shownRef.current) {
        shownRef.current = n;
        setShown(n);
      }
      if (n < text.length) raf = requestAnimationFrame(tick);
      else if (!streaming) settled.add(id);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, text, streaming, reduce]);

  const visible = reduce ? text.length : Math.min(shown, text.length);
  const done = visible >= text.length && !streaming;

  return (
    <p className={cn("flow-chat text-text", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, visible)}
        <span
          className={cn(
            "-mr-0.5 border-l-2 border-live transition-opacity duration-300",
            done ? "opacity-0" : "opacity-100",
          )}
        />
        <span className="opacity-0">{text.slice(visible)}</span>
      </span>
    </p>
  );
}
