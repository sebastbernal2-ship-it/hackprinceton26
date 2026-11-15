"use client";

import { cn } from "@/lib/utils";
import type { LetterState } from "./letter";

/** The letter itself: streams behind a `live` caret, then becomes an editable text area. Source is named. */
export function LetterDoc({
  letter,
  shown,
  onEdit,
  onDraft,
  outOfDate,
  disabled,
}: {
  letter: LetterState;
  shown: number;
  onEdit: (t: string) => void;
  onDraft: () => void;
  outOfDate: boolean;
  disabled: boolean;
}) {
  if (letter.status === "idle" || (letter.status === "error" && !letter.text)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3">
        <p className="text-sm text-text-2">
          {letter.status === "error" ? <span className="text-needed">{letter.error} </span> : null}
          A short letter to the landlord or broker, written from the asks you checked, your plan&apos;s seats and your budget.
        </p>
        <button
          type="button"
          onClick={onDraft}
          disabled={disabled}
          className="flow-label h-10 rounded-full border border-line-strong bg-glass-fill px-4 text-text transition-transform duration-100 active:scale-[0.97] disabled:opacity-40"
        >
          {letter.status === "error" ? "Try again" : "Draft the letter"}
        </button>
      </div>
    );
  }
  const streaming = letter.status === "streaming";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {streaming ? (
        <div className="min-h-0 flex-1 overflow-y-auto text-[0.8125rem] leading-[1.55] whitespace-pre-wrap text-text" aria-live="off">
          {letter.text.slice(0, shown)}
          <span className="-mr-0.5 border-l-2 border-live" />
          <span className="opacity-0">{letter.text.slice(shown)}</span>
        </div>
      ) : (
        <textarea
          value={letter.text}
          onChange={(e) => onEdit(e.target.value)}
          aria-label="The offer letter, editable"
          spellCheck
          className="min-h-0 flex-1 resize-none rounded-f-sm bg-[oklch(1_0_0/0.05)] p-2.5 text-[0.8125rem] leading-[1.55] text-text outline-none focus-visible:ring-2 focus-visible:ring-live"
        />
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className={cn("flow-source truncate", letter.status === "error" ? "text-needed" : "text-text-3")}>
          {letter.status === "error"
            ? `${letter.error} The text above is what arrived.`
            : letter.source === "claude"
              ? "Written by Claude from your asks"
              : letter.source === "template"
                ? "Template filled from your asks (the model was not used)"
                : "Drafting"}
        </p>
        {outOfDate && !streaming ? (
          <button type="button" onClick={onDraft} className="flow-label shrink-0 rounded-full bg-live-wash px-3 py-1 text-live">
            {letter.edited ? "Asks changed: redraft (replaces your edits)" : "Asks changed: redraft"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
