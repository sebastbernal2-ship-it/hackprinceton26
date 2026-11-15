import type { ReactNode, Ref } from "react";
import type { PanoSite, PanoViewerHandle } from "@/components/immersive/pano-viewer";
import type { ImaginedVersion } from "@/lib/immersive/imagine-types";
import type { FurnitureInput } from "@/lib/three-d/furniture-place";
import type { Chapter } from "./chapter-model";

/** The flow contract (docs/design-v2.md, section 5). Change it there first. */

export type FlowPhase = "ask" | "clarify" | "search" | "pick" | "walk" | "outlook" | "offer";
export type Tone = "needed" | "saved" | "maybe" | "info";
export type UsdRange = { low: number; high: number };
type Base = { id: string; at: number };

export type SpacePick = {
  siteId: string;
  rank: 1 | 2 | 3;
  photo: string;
  address: string;
  city: string;
  sf: number;
  allInUsd: UsdRange;
  reason: string;
  highlight?: { tone: Tone; text: string };
  hasScan: boolean;
};

export type MessageBody =
  | { kind: "user"; text: string }
  /** `source` is a mono line under the text: where the answer came from ("Claude", "Offline parser") */
  | { kind: "assistantText"; text: string; streaming: boolean; source?: string }
  /** thin row marking where the thread moved to another chapter */
  | { kind: "chapterDivider"; chapter: Chapter }
  | {
      kind: "clarifyChips";
      question: string;
      field: "seats" | "budgetUsd" | "city" | "concept";
      options: { label: string; value: string | number }[];
      allowFreeText: boolean;
      answer?: string | number;
    }
  | {
      kind: "searchProgress";
      status: "running" | "done" | "error";
      headline: string;
      /** the failure, in words, when status is "error" (a Retry button shows with it) */
      error?: string;
      checked: number;
      total: number;
      candidates: {
        siteId: string;
        photo: string;
        address: string;
        state: "queued" | "inspecting" | "kept" | "rejected";
        reason?: string;
      }[];
    }
  /** 1 to 3 picks, never more */
  | { kind: "pickCards"; intro: string; picks: SpacePick[]; chosenSiteId?: string }
  | {
      kind: "walkStep";
      siteId: string;
      index: number;
      total: number;
      panoId?: string;
      title: string;
      text: string;
      streaming: boolean;
      state: "active" | "visited";
      source: string;
      pin?: { tone: Tone; label: string; amountUsd?: UsdRange };
    }
  | {
      kind: "imagineResult";
      siteId: string;
      panoId: string;
      instruction: string;
      status: "running" | "done" | "error";
      stage?: string;
      beforeUrl?: string;
      afterUrl?: string;
      costDeltaUsd?: UsdRange;
      /** the feasibility checks for this change, worst first, each with the code it cites */
      checks?: { id: string; label: string; status: "likely-fine" | "needs-professional" | "likely-blocker"; summary: string; citation?: { code: string; label: string; url?: string } }[];
      permitWeeks?: { low: number; high: number } | null;
      /** the checks and cost run alongside the picture: loading, then done, or none (nothing in the request to price) */
      feasibility?: "loading" | "done" | "none";
      feasibilityNote?: string;
      tone: Tone;
      note?: string;
      error?: string;
    }
  | {
      kind: "outlookChart";
      siteId: string;
      read: string;
      scenarios: Record<"slow" | "base" | "strong", { profitByYearUsd: [number, number, number] }>;
      breakevenCoversPerDay: number;
      seats: number;
      turnsPerDay: number;
      rentAskingPerSfYr: number | null;
      rentFairPerSfYr: UsdRange | null;
      verdict: "comfortable" | "stretch" | "unlikely";
      risks: string[];
      sources: string[];
    }
  | {
      kind: "offerCta";
      siteId: string;
      summary: string;
      label: string;
      memoHref: string;
      state: "idle" | "drafting" | "ready";
    };

export type Message = Base & MessageBody;
export type MessageKind = Message["kind"];
export type MessageOf<K extends MessageKind> = Extract<Message, { kind: K }>;

export type FlowAction =
  | { type: "send"; text: string }
  | { type: "stop" }
  | { type: "retrySearch" }
  | { type: "chapter"; chapter: Chapter }
  | { type: "back" }
  | { type: "pick"; siteId: string }
  | { type: "answer"; messageId: string; value: string | number }
  | { type: "walkGo"; index: number }
  | { type: "holdBefore"; held: boolean }
  | { type: "draftOffer"; siteId: string };

export type SheetSnap = "peek" | "half" | "full";

export type StageProps = {
  mode: "backdrop" | "space" | "spaceDim";
  /** real scan interiors for Ask, 4 to 6 */
  backdrop: { src: string; alt: string }[];
  /** poster carries layoutId `space-media-{site.id}` */
  site?: PanoSite;
  poster?: string;
  viewerRef?: Ref<PanoViewerHandle>;
  onViewerReady?: () => void;
  focus?: { panoId: string; pin?: { tone: Tone; label: string; amountUsd?: UsdRange } };
  imagined?: ImaginedVersion | null;
  showBefore?: boolean;
  /** working = light sweep */
  working?: boolean;
  header?: { address: string; rentLabel: string };
  tour?: { index: number; total: number };
  /** px covered by the Guide (guide width + insets); phone 0 */
  rightInset: number;
  /** px covered by the chapter rail; phone 0 */
  leftInset?: number;
  /** the owner's plan as 3D pieces in the scan (Room and the Deal finale); null otherwise */
  furniture?: FurnitureInput | null;
  /** the de-furnished scan under the furniture (falls back per pano to the furnished one) */
  empty?: boolean;
  /** ?grid=1: draw a metre grid and the room outlines through the furniture transform */
  grid?: boolean;
  /** addition: every pano the viewer stands in, so the tour can follow free walking */
  onPano?: (panoId: string) => void;
  onAction: (a: FlowAction) => void;
  /**
   * Addition to the contract: in `backdrop` mode, true once the thread is up (Clarify, Search, Pick): the scrim
   * goes 0.55 -> 0.78 and the photos blur 12px.
   */
  dim?: boolean;
};

export type ChatThreadProps = {
  messages: Message[];
  phase: FlowPhase;
  composer: ReactNode;
  onAction: (a: FlowAction) => void;
  /** center 720, panel 400 / 560, sheet = phone */
  layout: "center" | "panel" | "sheet";
  sheetSnap?: SheetSnap;
  onSheetSnap?: (s: SheetSnap) => void;
};

export type ComposerProps = {
  /** hero 72 high, radius 28; docked 56 high, radius full */
  variant: "hero" | "docked";
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  placeholder: string;
  /** hero only: chips under the field */
  examples?: string[];
  /** docked only: max 2 chips above the field */
  suggestions?: string[];
  busy?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
};
