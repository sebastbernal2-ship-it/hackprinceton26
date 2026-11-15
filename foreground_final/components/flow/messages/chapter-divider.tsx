"use client";

import { CHAPTER_LABEL } from "../chapter-model";
import type { MessageRendererProps } from "./registry";

/** A thin row where the thread moves to another chapter. The thread itself is never cleared. */
export function ChapterDividerMessage({ message }: MessageRendererProps<"chapterDivider">) {
  return (
    <div role="separator" aria-label={`Chapter: ${CHAPTER_LABEL[message.chapter]}`} className="flex items-center gap-3 text-text-3">
      <span className="h-px flex-1 bg-line" />
      <span className="flow-label">{CHAPTER_LABEL[message.chapter]}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
