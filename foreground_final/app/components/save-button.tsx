"use client";

import type { Match } from "../lib/matches";
import { toggleSaved, useIsSaved } from "../lib/saved";

/** Bookmarks a property for the Saved tab. */
export default function SaveButton({ match, className = "" }: { match: Match; className?: string }) {
  const saved = useIsSaved(match.siteId);
  return (
    <button
      type="button"
      onClick={() => toggleSaved(match)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${match.address} from Saved` : `Save ${match.address}`}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-[transform,opacity,background-color] duration-300 active:scale-[0.98] ${
        saved ? "border-accent/30 bg-accent/10 text-accent" : "border-foreground/15 hover:opacity-70"
      } ${className}`}
    >
      <Bookmark filled={saved} />
      {saved ? "Saved" : "Save"}
    </button>
  );
}

export function Bookmark({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M7 4.5h10a1 1 0 0 1 1 1v14l-6-3.6-6 3.6v-14a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
    </svg>
  );
}
