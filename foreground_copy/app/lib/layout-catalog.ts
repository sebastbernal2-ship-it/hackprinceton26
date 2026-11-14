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

export const REMOVE_ROOM_PRICE = 2500;
export const EXTEND_PRICE_PER_METER = 800;

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
