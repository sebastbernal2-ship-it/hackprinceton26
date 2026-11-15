import type { Site } from "@/lib/sites/schema";
import { resolveSide } from "./geometry";
import { ITEM_SPECS, type Layout, type Op } from "./types";
import { countByType, seatCount } from "./validate";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Compact plain-text picture of the plan for the model: size, walls, zones, what stands where, and site findings. */
export function describeLayout(layout: Layout, site?: Site): string {
  const { footprint: fp } = layout;
  const counts = countByType(layout);
  const lines = [
    `Concept: ${layout.concept}. Seats on the plan: ${seatCount(layout)}.`,
    `Floor: ${r1(fp.w)} m wide (x, left to right) by ${r1(fp.d)} m deep (y, top to bottom), ${Math.round(fp.areaM2)} m2, ${
      fp.rooms ? `${fp.rooms.length} scanned rooms with fixed walls` : "one open rectangle"
    }.`,
    `Walls: front (storefront, windows, door) = ${layout.front}; back = ${resolveSide(layout, "back")}. Door at x ${r1(layout.entry[0])}, y ${r1(layout.entry[1])}.`,
    `Zones: ${layout.zones.map((z) => `${z.kind} x ${r1(z.x)}-${r1(z.x + z.w)} y ${r1(z.y)}-${r1(z.y + z.d)}`).join("; ")}.`,
    `Items: ${Object.entries(counts)
      .map(([t, n]) => `${n} ${t}`)
      .join(", ") || "none"}.`,
    `Fixtures: ${
      layout.items
        .filter((i) => ITEM_SPECS[i.type].seats === 0)
        .map((i) => `${i.id} ${i.type} at x ${r1(i.x)}, y ${r1(i.y)}`)
        .join("; ") || "none"
    }.`,
  ];
  if (layout.kitchenAnchor) lines.push(`Existing hood at x ${r1(layout.kitchenAnchor[0])}, y ${r1(layout.kitchenAnchor[1])}: moving the kitchen-line away from it costs a hood relocation.`);
  if (site) {
    const seen = site.findings.filter((f) => f.status !== "unknown").map((f) => `${f.kind} ${f.status}`);
    if (seen.length) lines.push(`Site findings: ${[...new Set(seen)].join(", ")}.`);
  }
  return lines.join("\n");
}

/** One line per op, for the fallback explanation when the model is not available. */
export function describeOps(ops: Op[]): string {
  const words = ops.map((op) => {
    switch (op.op) {
      case "add":
        return `add ${op.count} ${op.type}${op.near ? ` by the ${op.near}` : ""}`;
      case "remove":
        return `remove ${op.count} ${op.type}`;
      case "move":
        return `move the ${op.type ?? "piece"}`;
      case "setConcept":
        return `re-plan as a ${op.concept}`;
      case "setSeats":
        return `set ${op.seats} seats`;
      case "resizeZone":
        return `${op.deltaM2 > 0 ? "grow" : "shrink"} the ${op.zone}`;
      case "arrange":
        return `arrange the ${op.zone} tables (${op.pattern})`;
    }
  });
  const s = words.join(", then ");
  return s ? s[0].toUpperCase() + s.slice(1) + "." : "";
}
