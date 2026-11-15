import type { StructureEdit } from "./floor-layout";
import type { TourKind } from "./tour-agent";

/** How a typed object is drawn when it is not one of the modelled catalog pieces. */
export type CustomShape = "box" | "cylinder" | "table" | "shelf" | "plant" | "lamp" | "screen" | "appliance" | "seat" | "glass" | "sofa" | "chair" | "counter";

export type CatalogItem = {
  id: string;
  label: string;
  kind: TourKind;
  width: number;
  depth: number;
  price: number;
  /** any object the owner typed: drawn from primitives with this height, colour and shape */
  custom?: { height: number; color: string; shape: CustomShape };
  /** the real product the agent found online: its name, page and photo (proxied through /api/product-image) */
  product?: {
    name: string;
    /** the product's own page, only when it was actually reached */
    url?: string;
    /** a Google Shopping search for this exact product: always there, so the owner can see the real thing */
    google?: string;
    image?: string;
    /** set when the photo is an open-licence stand-in, not the shop photo */
    credit?: string;
    photoPage?: string;
  };
};

export const CUSTOM_SHAPES: CustomShape[] = ["sofa", "chair", "table", "counter", "seat", "shelf", "appliance", "glass", "plant", "lamp", "screen", "cylinder", "box"];

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

export type LayoutAction = LayoutDecision["action"];

export type LayoutDecision = {
  reply: string;
  total: number;
  /** every change in the sentence, in order ("add a piano and remove wall 3"); action is the first */
  actions?: LayoutDecision["action"][];
  action:
    | { type: "add"; item: CatalogItem; room: string; count?: number }
    | { type: "structure"; edit: StructureEdit; price: number }
    | {
        type: "walls";
        remove: number[];
        restore: number[];
        add: import("./wall-edits").WallAddSpec[];
        /** slide walls the owner added: dx/dz in plan metres (x right, z toward the back). Free. */
        move?: { wall: number; dx: number; dz: number }[];
        price: number;
      }
    /** slide placed objects (the last one whose name matches): dx/dz in plan metres. Free. */
    | { type: "move-piece"; item: string; dx: number; dz: number; count: number }
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
