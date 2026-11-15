import { z } from "zod";
import type { Range } from "@/lib/engine/types";
import { ChangeSchema, type Assessment, type Check } from "@/lib/feasibility/types";
import { CONCEPTS, OpSchema, type Layout } from "@/lib/layout/types";

/** Shared contract for Imagine: the planner's output, the stream events and the stored version. No Node imports. */

export const DISCLAIMER = "AI visualization, not a construction drawing";
export const IMAGE_QUOTA_MESSAGE = "Visualization unavailable; checks and costs still shown";

export const ViewPromptSchema = z.object({
  /** id of a view offered to the planner: v1, v2, ... or "shot" for a provided screenshot */
  view: z.string().max(12),
  /** what to change in this photo, in the photo's own terms */
  prompt: z.string().min(4).max(900),
  /** the part of the photo that may change; everything else must stay */
  region: z.string().max(240).default(""),
});
export type ViewPrompt = z.infer<typeof ViewPromptSchema>;

export const ChangeSpecSchema = z.object({
  /** one sentence for the owner */
  summary: z.string().max(320).default(""),
  changes: z.array(ChangeSchema).max(10),
  /** lib/layout operations for layout-type changes, cumulative along the version line; applied to the base plan */
  layoutOps: z.array(OpSchema).max(48).default([]),
  viewPrompts: z.array(ViewPromptSchema).max(3).default([]),
  /** things an engineer or the landlord must clear before this is real */
  structuralFlags: z.array(z.string().max(280)).max(6).default([]),
});
export type ChangeSpec = z.infer<typeof ChangeSpecSchema>;

export const BriefSchema = z.object({
  concept: z.enum(CONCEPTS),
  cuisine: z.string().max(60).optional(),
  seats: z.number().int().min(0).max(400).optional(),
  budgetUsd: z.number().min(0).max(50_000_000).optional(),
  city: z.enum(["Houston", "Los Angeles"]).optional(),
  mustHaves: z.array(z.string().max(60)).max(12).optional(),
});

export type ImagineErrorCode = "image_quota" | "image_failed" | "image_blocked" | "no_key" | "no_views";
export type ImagineError = { code: ImagineErrorCode; message: string };

export type ViewImage = {
  view: string;
  caption: string;
  /** the room as scanned, furnished; null for a screenshot */
  scanned: string | null;
  /** the image that was edited: the empty (defurnished) view, the parent version's image, or the screenshot */
  empty: string | null;
  /** the generated image under /media/imagine/<siteId>/, null when it could not be made */
  imagined: string | null;
  prompt: string;
  error?: ImagineError;
};

export type ViewQa = {
  view: string;
  ok: boolean;
  /** edits outside the intended region */
  outsideRegion: boolean;
  impossibleGeometry: boolean;
  note: string;
};

export type Qa = {
  disclaimer: typeof DISCLAIMER;
  structuralFlags: string[];
  views: ViewQa[];
  /** false when the vision check could not run */
  checked: boolean;
};

/** A point-in-time read of the money, before or after the imagined changes. */
export type Snapshot = {
  concept: string;
  seats: number;
  /** build-out total: X-Ray + plan extras (+ imagined changes and counted checks, after) */
  total: Range;
  overBudget: boolean | null;
  salesNeededUsd: number;
  coversPerDay: number;
  turnsPerDay: number;
  verdict: "comfortable" | "stretch" | "unlikely";
  /** base-case years to pay back the build-out; null when the base case loses money */
  paybackYears: number | null;
  /** base-case cumulative cash after year 3 */
  year3CashUsd: number;
  monthsToOpen: Range;
};

export type Numbers = { before: Snapshot; after: Snapshot; outlook: string };

export const VersionRefSchema = z.object({
  id: z.string().regex(/^v[a-z0-9]{6,16}$/),
  changes: z.array(ChangeSchema).max(10),
  layoutOps: z.array(OpSchema).max(48).default([]),
  images: z
    .array(z.object({ view: z.string().max(12), imagined: z.string().regex(/^\/(?:media\/)?imagine\/[A-Za-z0-9_-]{1,40}\/v[a-z0-9]{6,16}-\d\.(png|jpg|webp)$/) }))
    .max(3)
    .default([]),
});
export type VersionRef = z.infer<typeof VersionRefSchema>;

export type ImagineVersion = {
  id: string;
  /** A, A1, A2, B ... */
  label: string;
  parentId: string | null;
  instruction: string;
  changeSpec: ChangeSpec;
  /** the plan after the layout ops */
  layout: Layout | null;
  assessment: Assessment;
  checks: Check[];
  /** build-out added versus the space as scanned */
  costDelta: Range;
  numbers: Numbers;
  images: ViewImage[];
  imageError: ImagineError | null;
  qa: Qa | null;
  plannedBy: "claude" | "offline";
  notes: string[];
  createdAt: string;
};

export type Stage = "plan" | "checks" | "numbers" | "images" | "qa";
export const STAGES: Stage[] = ["plan", "checks", "numbers", "images", "qa"];

export type ImagineEvent =
  | { type: "stage"; stage: Stage }
  | { type: "plan"; id: string; changeSpec: ChangeSpec; layout: Layout | null; plannedBy: "claude" | "offline"; notes: string[]; ms: number }
  | { type: "checks"; assessment: Assessment; ms: number }
  | { type: "numbers"; numbers: Numbers; costDelta: Range; ms: number }
  | { type: "image"; image: ViewImage; ms: number }
  | { type: "images"; error: ImagineError | null; ms: number }
  | { type: "qa"; qa: Qa; ms: number }
  | { type: "done"; ms: number }
  | { type: "error"; message: string };
