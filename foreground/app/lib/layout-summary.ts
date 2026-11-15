// The owner's 3D layout (modeling/walk.html, embedded by PlanVision) as counts for the Quantify step.
// Scanned piece kinds are the segmentation's guesses from shape, so every count here is an estimate, labelled as such.

export type WalkLayout = {
  type: "walk-layout";
  model: string;
  scanned: { kind: string | null; label: string | null; deleted: boolean; moved: boolean }[];
  added: { catalogId: string; name: string; category: string | null }[];
  pendingAdded: number;
};

export type LayoutCount = { kind: string; kept: number; moved: number; removed: number; added: number };

export type LayoutSummary = {
  model: string;
  rows: LayoutCount[];
  addedItems: { name: string; category: string | null }[];
  /** chairs + stools + armchairs in the final layout; sofas and benches are not counted (seats per piece unknown) */
  seats: number;
  sofasNotCounted: number;
  removedTotal: number;
  movedTotal: number;
};

/** Catalogue categories (Poly Haven) mapped to the scanned kinds they sit beside in the summary. */
const CATEGORY_KIND: Record<string, string> = {
  Chairs: "chair", Armchairs: "armchair", Sofas: "sofa", Tables: "table", Storage: "storage", Outdoor: "outdoor",
};
const SEAT_KINDS = new Set(["chair", "stool", "armchair"]);

export function isWalkLayout(data: unknown): data is WalkLayout {
  const d = data as WalkLayout | null;
  return !!d && d.type === "walk-layout" && typeof d.model === "string" && Array.isArray(d.scanned) && Array.isArray(d.added);
}

export function summarizeLayout(layout: WalkLayout): LayoutSummary {
  const rows = new Map<string, LayoutCount>();
  const row = (kind: string) => {
    let r = rows.get(kind);
    if (!r) rows.set(kind, (r = { kind, kept: 0, moved: 0, removed: 0, added: 0 }));
    return r;
  };
  for (const p of layout.scanned) {
    const r = row(p.kind || "other");
    if (p.deleted) r.removed++;
    else { r.kept++; if (p.moved) r.moved++; }
  }
  for (const a of layout.added) row(CATEGORY_KIND[a.category ?? ""] ?? "other").added++;

  const list = [...rows.values()].sort((a, b) => b.kept + b.added - (a.kept + a.added) || a.kind.localeCompare(b.kind));
  const final = (r: LayoutCount) => r.kept + r.added;
  return {
    model: layout.model,
    rows: list,
    addedItems: layout.added.map((a) => ({ name: a.name, category: a.category })),
    seats: list.filter((r) => SEAT_KINDS.has(r.kind)).reduce((n, r) => n + final(r), 0),
    sofasNotCounted: list.filter((r) => r.kind === "sofa").reduce((n, r) => n + final(r), 0),
    removedTotal: list.reduce((n, r) => n + r.removed, 0),
    movedTotal: list.reduce((n, r) => n + r.moved, 0),
  };
}
