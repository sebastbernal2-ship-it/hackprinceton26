import { z } from "zod";
import type { Concept } from "@/lib/engine/types";

/**
 * Layout Studio model. Pure data; every length is in metres, plan space has x to the right and y DOWN (screen
 * orientation), origin at the top-left of the footprint's bounding box.
 */

export const ITEM_TYPES = [
  "two-top",
  "four-top",
  "six-top",
  "booth",
  "bar-stool",
  "bar-counter",
  "counter",
  "kitchen-line",
  "prep",
  "walk-in",
  "restroom",
  "host",
  "patio-table",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ZONE_KINDS = ["kitchen", "dining", "bar", "restroom", "storage", "entry"] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const SIDES = ["top", "bottom", "left", "right"] as const;
export type Side = (typeof SIDES)[number];

export const CONCEPTS = ["quick-service", "fast-casual", "full-service", "cafe", "bar"] as const satisfies readonly Concept[];

export type Pt = [number, number];
export type Rect = { x: number; y: number; w: number; d: number };

export type ItemSpec = {
  label: string;
  /** footprint including chairs, metres */
  w: number;
  d: number;
  seats: number;
  /** block height in the tilted view, metres */
  h: number;
  group: "seating" | "bar" | "kitchen" | "service";
  /** zone a new item of this type goes to by default */
  zone: ZoneKind;
};

export const ITEM_SPECS: Record<ItemType, ItemSpec> = {
  "two-top": { label: "Two-top", w: 0.8, d: 1.6, seats: 2, h: 0.75, group: "seating", zone: "dining" },
  "four-top": { label: "Four-top", w: 1.5, d: 1.5, seats: 4, h: 0.75, group: "seating", zone: "dining" },
  "six-top": { label: "Six-top", w: 2.3, d: 1.6, seats: 6, h: 0.75, group: "seating", zone: "dining" },
  booth: { label: "Booth", w: 1.25, d: 1.7, seats: 4, h: 1.1, group: "seating", zone: "dining" },
  "bar-stool": { label: "Bar stool", w: 0.5, d: 0.5, seats: 1, h: 0.75, group: "bar", zone: "bar" },
  "bar-counter": { label: "Bar counter", w: 3, d: 0.75, seats: 0, h: 1.05, group: "bar", zone: "bar" },
  counter: { label: "Service counter", w: 2.4, d: 0.8, seats: 0, h: 0.95, group: "service", zone: "entry" },
  "kitchen-line": { label: "Cook line", w: 3.6, d: 0.9, seats: 0, h: 0.9, group: "kitchen", zone: "kitchen" },
  prep: { label: "Prep table", w: 1.8, d: 0.75, seats: 0, h: 0.9, group: "kitchen", zone: "kitchen" },
  "walk-in": { label: "Walk-in cooler", w: 2.4, d: 1.8, seats: 0, h: 1.9, group: "kitchen", zone: "storage" },
  restroom: { label: "Restroom", w: 2.3, d: 2, seats: 0, h: 1.9, group: "service", zone: "restroom" },
  host: { label: "Host stand", w: 0.7, d: 0.5, seats: 0, h: 1.1, group: "service", zone: "entry" },
  "patio-table": { label: "Patio table", w: 1.5, d: 1.5, seats: 4, h: 0.75, group: "seating", zone: "dining" },
};

export const GRID_M = 0.25;
/** depth of the strip outside the front wall where patio tables may stand */
export const PATIO_DEPTH_M = 3;

export const ItemSchema = z.object({
  id: z.string().min(1).max(24),
  type: z.enum(ITEM_TYPES),
  /** centre of the item */
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  w: z.number().positive().max(12),
  d: z.number().positive().max(12),
});
export type Item = z.infer<typeof ItemSchema>;

const PtSchema = z.tuple([z.number().finite(), z.number().finite()]);

export const ZoneSchema = z.object({
  id: z.string().max(24),
  kind: z.enum(ZONE_KINDS),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().positive(),
  d: z.number().positive(),
  /** set when the zone follows a scanned room; x/y/w/d is then its bounding box */
  polygon: z.array(PtSchema).max(80).optional(),
});
export type Zone = z.infer<typeof ZoneSchema>;

export const FootprintSchema = z.object({
  /** bounding box size */
  w: z.number().positive().max(200),
  d: z.number().positive().max(200),
  /** scanned room outlines; absent for a rectangle sized from the listing */
  rooms: z.array(z.object({ label: z.string().max(60), polygon: z.array(PtSchema).min(3).max(80) })).max(40).optional(),
  source: z.enum(["matterport", "listing"]),
  areaM2: z.number().positive(),
});
export type Footprint = z.infer<typeof FootprintSchema>;

export const LayoutSchema = z.object({
  v: z.literal(1),
  siteId: z.string().max(40),
  concept: z.enum(CONCEPTS),
  footprint: FootprintSchema,
  /** wall of the bounding box that carries the storefront and windows */
  front: z.enum(SIDES),
  /** the door, just inside the front wall */
  entry: PtSchema,
  zones: z.array(ZoneSchema).max(40),
  items: z.array(ItemSchema).max(400),
  /** where the existing cook line stands when the space already has a hood; moving away from it costs money */
  kitchenAnchor: PtSchema.nullable(),
  /** next numeric id suffix */
  seq: z.number().int().nonnegative(),
});
export type Layout = z.infer<typeof LayoutSchema>;

export type Warning = {
  kind: "collision" | "out-of-bounds" | "blocked-egress" | "missing";
  message: string;
  itemIds: string[];
};

/* ---- op language ---- */

const WallRef = z.enum(["front", "window", "back", "left", "right", "top", "bottom"]);
export type WallRef = z.infer<typeof WallRef>;

const Target = z.union([
  z.object({ zone: z.enum(ZONE_KINDS) }),
  z.object({ wall: WallRef }),
  z.object({ x: z.number().finite(), y: z.number().finite() }),
]);

export const OpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    type: z.enum(ITEM_TYPES),
    count: z.number().int().min(1).max(60),
    zone: z.enum(ZONE_KINDS).optional(),
    /** a wall, or an item type to sit next to */
    near: z.union([WallRef, z.enum(ITEM_TYPES)]).optional(),
  }),
  z.object({ op: z.literal("remove"), type: z.enum(ITEM_TYPES), count: z.number().int().min(1).max(400) }),
  z.object({ op: z.literal("move"), itemId: z.string().max(24).optional(), type: z.enum(ITEM_TYPES).optional(), to: Target }),
  z.object({ op: z.literal("setConcept"), concept: z.enum(CONCEPTS) }),
  z.object({ op: z.literal("setSeats"), seats: z.number().int().min(0).max(400) }),
  z.object({ op: z.literal("resizeZone"), zone: z.enum(ZONE_KINDS), deltaM2: z.number().min(-200).max(200) }),
  z.object({ op: z.literal("arrange"), zone: z.enum(ZONE_KINDS), pattern: z.enum(["grid", "wall", "window"]) }),
]);
export type Op = z.infer<typeof OpSchema>;
export const OpsSchema = z.array(OpSchema).max(12);
