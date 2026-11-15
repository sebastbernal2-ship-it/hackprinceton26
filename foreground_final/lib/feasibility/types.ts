import { z } from "zod";
import type { OwnerBrief, Range } from "@/lib/engine/types";
import { CONCEPTS, type Layout, type Op } from "@/lib/layout/types";
import type { Site } from "@/lib/sites/schema";

/**
 * Feasibility contract. Pure TypeScript, no network: runs on the server for the first answer and in the browser
 * when the owner edits a line item. Every constant comes from data/benchmarks.json -> feasibility.
 */

export const CHANGE_KINDS = ["layout", "wall", "ceiling", "finish", "storefront", "exterior", "equipment", "use"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** What a change physically touches. The planner sets these; the rules also read the words as a backstop. */
export const INVOLVES = [
  "grease-cooking",
  "gas-appliance",
  "electric-load",
  "plumbing-fixture",
  "restroom",
  "seating",
  "demolition",
  "alcohol",
  "signage",
  "patio",
] as const;
export type Involves = (typeof INVOLVES)[number];

const qty = (max: number) => z.number().finite().min(0).max(max).optional();

export const QuantitiesSchema = z.object({
  /** length of the wall opening, storefront or bar */
  lengthFt: qty(500),
  /** wall, floor, ceiling or patio area the change covers */
  areaSf: qty(50_000),
  /** new ceiling height */
  heightFt: qty(60),
  /** pieces of equipment, fixtures or openings */
  count: qty(200),
  /** seats added (negative is not supported; remove seats through the plan) */
  seats: qty(400),
  /** new drain run to the nearest existing drain */
  runFt: qty(500),
});
export type Quantities = z.infer<typeof QuantitiesSchema>;

export const ChangeSchema = z.object({
  id: z.string().min(1).max(24),
  kind: z.enum(CHANGE_KINDS),
  /** where: "wall between the dining room and the back room" */
  target: z.string().max(160),
  /** what: "remove about 10 ft and leave a cased opening" */
  detail: z.string().max(400),
  quantities: QuantitiesSchema.default({}),
  involves: z.array(z.enum(INVOLVES)).max(INVOLVES.length).default([]),
  /** kind "use": the concept the space becomes */
  concept: z.enum(CONCEPTS).optional(),
  /** the owner can switch a line off without deleting it */
  enabled: z.boolean().default(true),
});
export type Change = z.infer<typeof ChangeSchema>;

export type Status = "likely-fine" | "needs-professional" | "likely-blocker";

export const CHECK_IDS = ["hood", "grease", "wall", "ceiling", "plumbing", "restrooms", "egress", "electrical", "gas", "use"] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export type SourceRef = { label: string; url?: string };
export type Citation = { code: string; text: string; source: SourceRef };

export type Check = {
  id: CheckId;
  label: string;
  status: Status;
  /** one plain sentence for the owner */
  summary: string;
  /** the facts and arithmetic behind it */
  detail: string;
  /** who to call, when status is not likely-fine */
  professional?: string;
  cost: {
    range: Range;
    /** true: added to the version's cost. false: a risk, or already priced by the X-Ray or the plan. */
    counted: boolean;
    note: string;
    source: SourceRef;
  } | null;
  citations: Citation[];
  /** city-pack step ids this check sends the project through */
  permits: string[];
  weeks: { low: number; high: number } | null;
  /** change ids that triggered it */
  triggeredBy: string[];
};

/** The priced line for one change (the work itself; code consequences are priced in the checks). */
export type ChangeLine = {
  changeId: string;
  range: Range | null;
  basis: string;
  source: SourceRef;
};

export type PermitStep = {
  id: string;
  label: string;
  agency: string;
  weeks: { low: number; high: number };
  source: SourceRef;
  url?: string;
  /** check ids or change ids that need it */
  neededBy: string[];
};

export type OccupantLoad = {
  diningSf: number;
  kitchenSf: number;
  patioSf: number;
  load: number;
  /** load before the changes */
  baseline: number;
  occupancy: "B" | "A-2";
  exitsRequired: 1 | 2;
  sprinklersRequired: boolean;
  basis: string;
};

export type Assessment = {
  city: Site["city"];
  codeBasis: string;
  cityNote: string;
  lines: ChangeLine[];
  checks: Check[];
  permits: PermitStep[];
  occupant: OccupantLoad;
  /** counted costs: the change lines, the counted checks, and their sum */
  cost: { changes: Range; checks: Range; total: Range };
  time: { permitWeeks: Range; workWeeks: Range; totalWeeks: Range; basis: string };
  worst: Status;
};

export type AssessInput = {
  site: Site;
  brief: OwnerBrief;
  changes: Change[];
  /** the plan after the changes (layout ops already applied), when there is one */
  layout?: Layout | null;
  /** the layout ops the changes produced */
  layoutOps?: Op[];
};
