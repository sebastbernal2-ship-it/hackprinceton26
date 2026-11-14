import type { StructureEdit } from "./floor-layout";
import type { TourKind } from "./tour-agent";

export type CatalogItem = {
  id: string;
  label: string;
  kind: TourKind;
  width: number;
  depth: number;
};

/** ASSUMED nominal footprints for pieces named in chat (no catalog match). Not measurements, and no prices. */
const SIZES: Record<string, { width: number; depth: number }> = {
  small: { width: 0.45, depth: 0.45 },
  seat: { width: 0.52, depth: 0.55 },
  table: { width: 1.6, depth: 0.9 },
  lounge: { width: 2.1, depth: 0.95 },
  kitchen: { width: 3.2, depth: 0.7 },
  run: { width: 2.4, depth: 0.7 },
};

/** A named object with an ASSUMED size from the table above. Asset-catalog pieces come from /api/assets instead. */
export function customItem(name: string, size: string): CatalogItem | null {
  const label = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (label.length < 2) return null;
  const footprint = SIZES[size.toLowerCase()] ?? SIZES[sizeFor(label)];
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label: label.replace(/\b\w/g, (letter) => letter.toUpperCase()),
    kind: kindFor(label),
    width: footprint.width,
    depth: footprint.depth,
  };
}

function sizeFor(label: string) {
  const text = label.toLowerCase();
  if (/kitchen|island|range|hood|line/.test(text)) return "kitchen";
  if (/booth|sofa|lounge|banquette/.test(text)) return "lounge";
  if (/counter|bar|host|station/.test(text)) return "run";
  if (/table|desk/.test(text)) return "table";
  if (/chair|stool|seat/.test(text)) return "seat";
  return "small";
}

function kindFor(label: string): TourKind {
  const text = label.toLowerCase();
  if (/chair|stool|seat/.test(text)) return "chair";
  if (/sofa|booth|lounge|banquette/.test(text)) return "sofa";
  if (/table|desk/.test(text)) return "table";
  if (/wall|partition/.test(text)) return "wall";
  return "counter";
}

export type LayoutDecision = {
  reply: string;
  action:
    | { type: "add"; item: CatalogItem; room: string }
    | { type: "structure"; edit: StructureEdit }
    | { type: "none" };
};
