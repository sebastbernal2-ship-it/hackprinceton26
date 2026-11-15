"use client";

import { ChapterFrame } from "./chapter-frame";
import type { ChapterProps } from "./types";

/**
 * Chapter 2, Walk. The canvas is the pano itself (it never unmounts: see Stage), with the stop pill and the finding
 * pin it already draws, and the guided steps in the Guide. Nothing mounts over it, unless the deal failed to load:
 * then it says so and offers Retry.
 */
export function WalkChapter({ status, onRetry }: ChapterProps) {
  if (status !== "error") return null;
  return (
    <ChapterFrame
      step={2}
      title="Walk"
      lede="The guided walk needs this space's data, and it did not load."
      will={[]}
      live={null}
      status="error"
      onRetry={onRetry}
    />
  );
}
