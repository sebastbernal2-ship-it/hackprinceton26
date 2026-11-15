import type { RefObject } from "react";
import type { PanoViewerHandle } from "@/components/immersive/pano-viewer";
import type { Chapter } from "../chapter-model";

/** What the Room needs from the stage: the viewer, live drags, and the opt-in AI render. State lives in flow.tsx. */
export type RoomHooks = {
  viewer: RefObject<PanoViewerHandle | null>;
  /** a piece is being dragged on the mini-plan (live position, metres) or released (null) */
  onDrag: (d: { id: string; x: number; y: number } | null) => void;
  /** the opt-in AI render: `instruction` is sent, `shown` is what the Guide shows */
  render: (instruction: string, shown: string) => void;
  rendering: boolean;
  /** an AI render of this view is on the stage */
  rendered: boolean;
  /** the render is held back to show the 3D pieces */
  before: boolean;
  setBefore: (b: boolean) => void;
};

export type ChapterProps = {
  status: "idle" | "loading" | "ready" | "error";
  onRetry: () => void;
  /** open another chapter (tiles and pills use it) */
  onChapter: (c: Chapter) => void;
  /** the Deal finale: the stage lifts its scrim and glides to the storefront (state lives in flow.tsx) */
  onFinale: (on: boolean) => void;
  /** start another search (the same as the header wordmark) */
  onRestart: () => void;
  room: RoomHooks;
};
