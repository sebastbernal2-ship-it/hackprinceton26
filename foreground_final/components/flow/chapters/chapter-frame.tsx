"use client";

import type { ReactNode } from "react";

/**
 * The titled empty state a chapter shows until its phase lands: the chapter's name, the data it will show (each
 * with its source), and one line read live from the shared deal so the context is visibly wired. Plain fill, no
 * glass: glass is for the rail, the Guide and the impact bar only.
 */
export function ChapterFrame({
  step,
  title,
  lede,
  will,
  live,
  status,
  onRetry,
}: {
  step: number;
  title: string;
  lede: string;
  will: { what: string; source: string }[];
  /** one line computed from the deal, or null while it loads */
  live: ReactNode | null;
  status: "idle" | "loading" | "ready" | "error";
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby={`chapter-${step}`} className="pointer-events-none mx-auto flex h-full max-w-[760px] flex-col justify-center">
      <div className="pointer-events-auto rounded-f-lg border border-line bg-stage/70 p-8">
        <p className="flow-source text-text-3">Chapter {step} of 6</p>
        <h2 id={`chapter-${step}`} className="flow-display mt-2 text-text">
          {title}
        </h2>
        <p className="flow-chat mt-3 max-w-[56ch] text-text-2">{lede}</p>

        <p className="mt-6 min-h-6 text-text" role="status">
          {status === "error" ? (
            <span className="inline-flex flex-wrap items-center gap-3">
              <span className="text-needed">The deal data did not load.</span>
              <button type="button" onClick={onRetry} className="flow-label h-9 rounded-full bg-text px-4 font-semibold text-stage active:scale-[0.97]">
                Retry
              </button>
            </span>
          ) : status === "ready" && live ? (
            live
          ) : (
            <span className="flow-shimmer text-text-2">Loading this space</span>
          )}
        </p>

        <ul className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 border-t border-line pt-5" aria-label="What this chapter will show">
          {will.map((w) => (
            <li key={w.what} className="flex flex-col gap-0.5">
              <span className="text-sm text-text">{w.what}</span>
              <span className="flow-source text-text-3">{w.source}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
