import type { StructureEdit } from "./floor-layout";
import type { TourKind } from "./tour-agent";

export type CatalogItem = {
  id: string;
  label: string;
  kind: TourKind;
  width: number;
  depth: number;
  price: number;
};

export const CATALOG: CatalogItem[] = [
  { id: "dining-table", label: "Dining table", kind: "table", width: 1.8, depth: 0.9, price: 1400 },
  { id: "chair", label: "Chair", kind: "chair", width: 0.5, depth: 0.5, price: 180 },
  { id: "sofa", label: "Sofa", kind: "sofa", width: 2.1, depth: 0.9, price: 2200 },
  { id: "counter", label: "Service counter", kind: "counter", width: 2.4, depth: 0.7, price: 3200 },
];

const SIZES: Record<string, { width: number; depth: number; price: number }> = {
  small: { width: 0.45, depth: 0.45, price: 220 },
  seat: { width: 0.52, depth: 0.55, price: 480 },
  table: { width: 1.6, depth: 0.9, price: 1400 },
  lounge: { width: 2.1, depth: 0.95, price: 2200 },
  kitchen: { width: 3.2, depth: 0.7, price: 6400 },
  run: { width: 2.4, depth: 0.7, price: 3200 },
};

export const REMOVE_ROOM_PRICE = 2500;
export const EXTEND_PRICE_PER_METER = 800;

/** A named object outside the fixed catalog. Size and price still come from our table. */
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
    price: footprint.price,
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

export function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export type LayoutDecision = {
  reply: string;
  total: number;
  action:
    | { type: "add"; item: CatalogItem; room: string }
    | { type: "structure"; edit: StructureEdit; price: number }
    | { type: "none" };
};

export function findCatalogItem(name: string): CatalogItem | null {
  const key = name.toLowerCase().replace(/[_ ]+/g, "-");
  return (
    CATALOG.find((item) => item.id === key || item.label.toLowerCase() === name.toLowerCase()) ??
    CATALOG.find((item) => item.id.includes(key) || key.includes(item.kind)) ??
    null
  );
}
